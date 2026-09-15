import { prisma } from '../config/prisma';
import { NotFoundError, PaymentRequiredError, ConflictError } from '../utils/errors';

export interface PurchaseLessonInput {
  studentId: string;
  lessonId: string;
  paymentMethod?: 'WALLET_EGP' | 'POINTS' | 'FREE';
}

export async function purchaseLesson({
  studentId,
  lessonId,
  paymentMethod = 'WALLET_EGP',
}: PurchaseLessonInput) {
  return prisma.$transaction(async (tx: any) => {
    // 1. Validate Lesson & Relations
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: { select: { id: true, title: true, subject: true, academicStage: true } },
        teacherProfile: { select: { id: true, displayName: true, commissionPct: true, userId: true } },
      },
    });

    if (!lesson || !lesson.isPublished) {
      throw NotFoundError('المحاضرة غير متاحة أو تم إلغاء نشرها');
    }

    // 2. Check Idempotency (Already subscribed?)
    const existing = await tx.lessonSubscription.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
      include: { lesson: true, course: true, teacherProfile: true },
    });

    if (existing && existing.status === 'ACTIVE') {
      return {
        alreadySubscribed: true,
        subscription: existing,
        message: 'أنت مشترك بالفعل في هذه المحاضرة',
      };
    }

    const student = await tx.user.findUnique({
      where: { id: studentId },
      select: { id: true, username: true, walletBalance: true, pointsBalance: true, role: true },
    });

    if (!student || student.role !== 'STUDENT') {
      throw NotFoundError('حساب الطالب غير موجود');
    }

    // Resolve commission: teacher-specific override takes priority over platform default
    const settings = await tx.platformSettings.findFirst();
    const platformDefault = settings?.defaultTeacherCommissionPct ?? 80.0;
    const commissionPct = lesson.teacherProfile?.commissionPct ?? platformDefault;

    let resolvedPaymentMethod: 'WALLET_EGP' | 'POINTS' | 'FREE' = paymentMethod;
    let pricePaid = 0.0;
    let pointsPaid = 0;

    const isFree = lesson.price === 0 && lesson.pointCost === 0;

    if (isFree) {
      resolvedPaymentMethod = 'FREE';
      pricePaid = 0.0;
      pointsPaid = 0;
    } else if (paymentMethod === 'POINTS') {
      const requiredPoints = lesson.pointCost > 0 ? lesson.pointCost : Math.ceil(lesson.price);
      if (student.pointsBalance < requiredPoints) {
        throw PaymentRequiredError(
          `رصيد النقاط غير كافٍ. تحتاج إلى ${requiredPoints} نقطة لشراء هذه المحاضرة.`
        );
      }

      // Deduct Points
      const updatedUser = await tx.user.updateMany({
        where: { id: studentId, pointsBalance: { gte: requiredPoints } },
        data: { pointsBalance: { decrement: requiredPoints } },
      });

      if (updatedUser.count === 0) {
        throw PaymentRequiredError('فشل خصم النقاط. يرجى إعادة المحاولة.');
      }

      pointsPaid = requiredPoints;

      // Audit Points Transaction for Student
      await tx.pointsTransaction.create({
        data: {
          studentId,
          type: 'DEBIT',
          amount: requiredPoints,
          reason: `شراء محاضرة: ${lesson.title} (الأستاذ: ${lesson.teacherProfile?.displayName || 'المدرس'})`,
          relatedLessonId: lesson.id,
          actorId: studentId,
        },
      });
    } else {
      // WALLET_EGP
      const requiredPrice = lesson.price > 0 ? lesson.price : lesson.pointCost;
      if (student.walletBalance < requiredPrice) {
        throw PaymentRequiredError(
          `رصيد المحفظة غير كافٍ. تحتاج إلى ${requiredPrice} ج.م لشراء هذه المحاضرة.`
        );
      }

      // Deduct Wallet EGP
      const newWalletBalance = student.walletBalance - requiredPrice;
      const updatedUser = await tx.user.updateMany({
        where: { id: studentId, walletBalance: { gte: requiredPrice } },
        data: { walletBalance: { decrement: requiredPrice } },
      });

      if (updatedUser.count === 0) {
        throw PaymentRequiredError('فشل خصم الرصيد من المحفظة. يرجى إعادة المحاولة.');
      }

      pricePaid = requiredPrice;

      // Audit Wallet Transaction for Student
      await tx.walletTransaction.create({
        data: {
          studentId,
          type: 'DEBIT',
          amount: requiredPrice,
          balanceAfter: newWalletBalance,
          reason: `شراء محاضرة: ${lesson.title} (الأستاذ: ${lesson.teacherProfile?.displayName || 'المدرس'})`,
          actorId: studentId,
        },
      });
    }

    // Calculate Access Expiration
    let expiresAt: Date | null = null;
    if (lesson.accessType === 'LIMITED' && lesson.accessDurationDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + lesson.accessDurationDays);
    }

    // 3. Create or Reactivate LessonSubscription
    let subscription;
    if (existing) {
      subscription = await tx.lessonSubscription.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          paymentMethod: resolvedPaymentMethod,
          pricePaid,
          pointsPaid,
          subscribedAt: new Date(),
          expiresAt,
        },
      });
    } else {
      subscription = await tx.lessonSubscription.create({
        data: {
          studentId,
          lessonId: lesson.id,
          courseId: lesson.courseId,
          teacherProfileId: lesson.teacherProfileId,
          academicStage: lesson.academicStage || lesson.course?.academicStage || 'SECONDARY_1',
          status: 'ACTIVE',
          paymentMethod: resolvedPaymentMethod,
          pricePaid,
          pointsPaid,
          expiresAt,
        },
      });
    }

    // Also mirror to UnlockedLesson for legacy queries
    await tx.unlockedLesson.upsert({
      where: { studentId_lessonId: { studentId, lessonId: lesson.id } },
      create: { studentId, lessonId: lesson.id },
      update: {},
    });

    // 4. Record Traceable PaymentTransaction (Financial Ledger)
    const teacherEarning = Math.round(pricePaid * (commissionPct / 100) * 100) / 100;
    const platformFee = Math.round((pricePaid - teacherEarning) * 100) / 100;
    const txnNumber = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const paymentTxn = await tx.paymentTransaction.create({
      data: {
        transactionNumber: txnNumber,
        studentId,
        teacherProfileId: lesson.teacherProfileId,
        academicStage: lesson.academicStage || lesson.course?.academicStage || 'SECONDARY_1',
        courseId: lesson.courseId,
        lessonId: lesson.id,
        lessonSubscriptionId: subscription.id,
        amount: pricePaid,
        pointsUsed: pointsPaid,
        currency: 'EGP',
        paymentMethod: resolvedPaymentMethod,
        teacherEarning,
        platformFee,
        status: 'COMPLETED',
      },
    });

    // 5. Credit Teacher Account & Record Teacher Financial Ledger
    const teacherUserId = lesson.teacherProfile?.userId;
    if (teacherUserId) {
      if (teacherEarning > 0) {
        const teacherUser = await tx.user.findUnique({
          where: { id: teacherUserId },
          select: { id: true, walletBalance: true },
        });
        if (teacherUser) {
          const newTeacherBalance = Math.round(((teacherUser.walletBalance || 0) + teacherEarning) * 100) / 100;
          await tx.user.update({
            where: { id: teacherUserId },
            data: { walletBalance: newTeacherBalance },
          });

          // Audit Wallet Transaction (CREDIT) for the Teacher
          await tx.walletTransaction.create({
            data: {
              studentId: teacherUserId,
              type: 'CREDIT',
              amount: teacherEarning,
              balanceAfter: newTeacherBalance,
              reason: `أرباح محاضرة: ${lesson.title} - الطالب: ${student.username || studentId}`,
              actorId: studentId,
            },
          });
        }
      }

      if (pointsPaid > 0) {
        await tx.user.update({
          where: { id: teacherUserId },
          data: { pointsBalance: { increment: pointsPaid } },
        });

        await tx.pointsTransaction.create({
          data: {
            studentId: teacherUserId,
            type: 'CREDIT',
            amount: pointsPaid,
            reason: `أرباح نقاط محاضرة: ${lesson.title} - الطالب: ${student.username || studentId}`,
            relatedLessonId: lesson.id,
            actorId: studentId,
          },
        });
      }

      // Send real-time notification to teacher
      await tx.notification.create({
        data: {
          userId: teacherUserId,
          title: 'اشتراك ودفع جديد في المحاضرة 💰',
          message: `قام الطالب (@${student.username || 'طالب'}) بالاشتراك في محاضرة "${lesson.title}". تم تسجيل الدفع وإيداع أرباحك (${teacherEarning > 0 ? teacherEarning + ' ج.م' : pointsPaid + ' نقطة'}) في محفظتك.`,
          type: 'PAYMENT',
        },
      });
    }

    return {
      success: true,
      alreadySubscribed: false,
      subscription,
      paymentTransaction: paymentTxn,
      message: `تم شراء المحاضرة (${lesson.title}) بنجاح!`,
    };
  }, { maxWait: 10000, timeout: 30000 });
}

/**
 * Returns student subscriptions structured hierarchically:
 * Teacher -> Subject/Course -> Lessons
 * Optional stage filter (e.g. 'SECONDARY_1') narrows results to a specific academic stage.
 * Includes both direct lesson subscriptions and full course enrollments.
 */
export async function getStudentSubscriptions(studentId: string, stage?: string) {
  const subWhere: any = { studentId, status: 'ACTIVE' };
  if (stage) subWhere.academicStage = stage as any;

  const enrollmentWhere: any = { studentId };
  if (stage) {
    enrollmentWhere.course = { academicStage: stage as any };
  }

  const [subscriptions, enrollments] = await Promise.all([
    prisma.lessonSubscription.findMany({
      where: subWhere,
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            courseId: true,
            description: true,
            price: true,
            pointCost: true,
            videoUrl: true,
            driveFileId: true,
            pdfUrl: true,
            pdfFileName: true,
            assignmentQuizId: true,
            examQuizId: true,
            orderIndex: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            subject: true,
            academicStage: true,
            imageUrl: true,
          },
        },
        teacherProfile: {
          select: {
            id: true,
            displayName: true,
            subject: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { subscribedAt: 'desc' },
    }),
    prisma.courseEnrollment.findMany({
      where: enrollmentWhere,
      include: {
        course: {
          include: {
            teacherProfile: {
              select: {
                id: true,
                displayName: true,
                subject: true,
                avatarUrl: true,
              },
            },
            lessons: {
              where: { isPublished: true },
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                price: true,
                pointCost: true,
                videoUrl: true,
                driveFileId: true,
                pdfUrl: true,
                pdfFileName: true,
                assignmentQuizId: true,
                examQuizId: true,
                orderIndex: true,
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    }),
  ]);

  // Group by Teacher -> Course -> Lessons
  const teachersMap = new Map<string, any>();

  // 1. Process Course Enrollments first so all enrolled courses are registered with their teacher & image
  for (const enr of enrollments) {
    const course = enr.course;
    if (!course) continue;
    const teacher = course.teacherProfile;
    const teacherId = teacher?.id || 'unknown-teacher';

    if (!teachersMap.has(teacherId)) {
      teachersMap.set(teacherId, {
        teacher: teacher || {
          id: teacherId,
          displayName: 'معلم المادة',
          subject: course.subject || 'عام',
          avatarUrl: null,
        },
        courses: new Map<string, any>(),
      });
    }

    const teacherEntry = teachersMap.get(teacherId);
    const courseId = course.id;

    if (!teacherEntry.courses.has(courseId)) {
      teacherEntry.courses.set(courseId, {
        id: course.id,
        title: course.title,
        subject: course.subject,
        academicStage: course.academicStage,
        imageUrl: course.imageUrl,
        isEnrolled: true,
        enrolledAt: enr.enrolledAt,
        lessons: course.lessons.map((l) => ({
          subscriptionId: `enr-${enr.id}-${l.id}`,
          lessonId: l.id,
          title: l.title,
          description: l.description,
          orderIndex: l.orderIndex,
          pricePaid: 0,
          pointsPaid: 0,
          paymentMethod: 'COURSE_ENROLLMENT',
          subscribedAt: enr.enrolledAt,
          expiresAt: null,
          hasVideo: !!(l.driveFileId || l.videoUrl),
          hasPdf: !!l.pdfUrl,
          hasAssignment: !!l.assignmentQuizId,
          hasExam: !!l.examQuizId,
          isCourseEnrollment: true,
        })),
      });
    }
  }

  // 2. Process Individual Lesson Subscriptions
  for (const sub of subscriptions) {
    if (!sub.lesson) continue;
    const teacherId = sub.teacherProfileId || sub.teacherProfile?.id || 'unknown-teacher';
    if (!teachersMap.has(teacherId)) {
      teachersMap.set(teacherId, {
        teacher: sub.teacherProfile || {
          id: teacherId,
          displayName: 'معلم المادة',
          subject: 'عام',
          avatarUrl: null,
        },
        courses: new Map<string, any>(),
      });
    }

    const teacherEntry = teachersMap.get(teacherId);
    const courseId = sub.courseId || sub.lesson?.courseId || 'general-course';
    const courseInfo = sub.course || {
      id: 'general-course',
      title: 'محاضرات عامة',
      subject: sub.teacherProfile?.subject || 'عام',
      academicStage: sub.academicStage,
      imageUrl: null,
    };

    if (!teacherEntry.courses.has(courseId)) {
      teacherEntry.courses.set(courseId, {
        ...courseInfo,
        isEnrolled: false,
        lessons: [],
      });
    }

    const courseEntry = teacherEntry.courses.get(courseId);
    // If course had default lessons from enrollment, check if this specific lesson is already there
    const existingLessonIdx = courseEntry.lessons.findIndex((l: any) => l.lessonId === sub.lesson.id);
    const lessonData = {
      subscriptionId: sub.id,
      lessonId: sub.lesson.id,
      title: sub.lesson.title,
      description: sub.lesson.description,
      orderIndex: sub.lesson.orderIndex,
      pricePaid: sub.pricePaid,
      pointsPaid: sub.pointsPaid,
      paymentMethod: sub.paymentMethod,
      subscribedAt: sub.subscribedAt,
      expiresAt: sub.expiresAt,
      hasVideo: !!(sub.lesson.driveFileId || sub.lesson.videoUrl),
      hasPdf: !!sub.lesson.pdfUrl,
      hasAssignment: !!sub.lesson.assignmentQuizId,
      hasExam: !!sub.lesson.examQuizId,
      isCourseEnrollment: false,
    };

    if (existingLessonIdx >= 0) {
      courseEntry.lessons[existingLessonIdx] = lessonData;
    } else {
      courseEntry.lessons.push(lessonData);
    }
  }

  // Convert maps to array structure
  const result = Array.from(teachersMap.values()).map((t) => ({
    teacher: t.teacher,
    courses: Array.from(t.courses.values()),
  }));

  // Collect all unique lesson IDs to fetch grades
  const allLessonIds: string[] = [];
  for (const group of result) {
    for (const course of (group.courses as any[])) {
      for (const lesson of (course.lessons as any[])) {
        if (lesson.lessonId) allLessonIds.push(lesson.lessonId);
      }
    }
  }

  if (allLessonIds.length > 0) {
    // Fetch all quiz attempts for this student related to these lessons' quizzes
    const lessonsWithQuizIds = await prisma.lesson.findMany({
      where: { id: { in: allLessonIds } },
      select: { id: true, assignmentQuizId: true, examQuizId: true, homeworkId: true, openingQuizId: true },
    });

    const quizIdToLessonMap = new Map<string, { lessonId: string; role: 'assignment' | 'exam' }>();
    for (const l of lessonsWithQuizIds) {
      // Primary quizzes take precedence; fallbacks fill in if no primary exists
      if (l.assignmentQuizId) quizIdToLessonMap.set(l.assignmentQuizId, { lessonId: l.id, role: 'assignment' });
      else if (l.homeworkId) quizIdToLessonMap.set(l.homeworkId, { lessonId: l.id, role: 'assignment' });
      if (l.examQuizId) quizIdToLessonMap.set(l.examQuizId, { lessonId: l.id, role: 'exam' });
      else if (l.openingQuizId) quizIdToLessonMap.set(l.openingQuizId, { lessonId: l.id, role: 'exam' });
    }

    const allQuizIds = Array.from(quizIdToLessonMap.keys());
    if (allQuizIds.length > 0) {
      const attempts = await prisma.quizAttempt.findMany({
        where: { studentId, quizId: { in: allQuizIds }, isCompleted: true },
        select: { quizId: true, scorePercent: true, totalCorrect: true, totalQuestions: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
      });

      // Build a map of quizId -> best attempt score
      const gradeMap = new Map<string, { scorePercent: number; totalCorrect: number; totalQuestions: number }>();
      for (const att of attempts) {
        if (!gradeMap.has(att.quizId)) {
          gradeMap.set(att.quizId, {
            scorePercent: att.scorePercent ?? 0,
            totalCorrect: att.totalCorrect,
            totalQuestions: att.totalQuestions,
          });
        }
      }

      // Annotate lessons with grades
      for (const group of result) {
        for (const course of (group.courses as any[])) {
          for (const lesson of (course.lessons as any[])) {
            const lessonQuizInfo = lessonsWithQuizIds.find((l) => l.id === lesson.lessonId);
            // Primary: assignmentQuizId; fallback: homeworkId
            const assignQuizId = lessonQuizInfo?.assignmentQuizId || lessonQuizInfo?.homeworkId;
            if (assignQuizId) {
              const grade = gradeMap.get(assignQuizId);
              if (grade) lesson.assignmentGrade = grade;
            }
            // Primary: examQuizId; fallback: openingQuizId
            const examQuizId = lessonQuizInfo?.examQuizId || lessonQuizInfo?.openingQuizId;
            if (examQuizId) {
              const grade = gradeMap.get(examQuizId);
              if (grade) lesson.examGrade = grade;
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Returns flat list of subscriptions for table views
 */
export async function getStudentSubscriptionsFlat(studentId: string) {
  return prisma.lessonSubscription.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: {
      lesson: {
        select: {
          id: true,
          title: true,
          price: true,
          pointCost: true,
        },
      },
      course: {
        select: {
          id: true,
          title: true,
          subject: true,
          academicStage: true,
        },
      },
      teacherProfile: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: { subscribedAt: 'desc' },
  });
}
