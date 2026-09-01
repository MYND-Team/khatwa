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
        teacherProfile: { select: { id: true, displayName: true, commissionPct: true } },
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
      select: { id: true, walletBalance: true, pointsBalance: true, role: true },
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

      // Audit Points Transaction
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

      // Audit Wallet Transaction
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

    // 4. Record Traceable PaymentTransaction (Full Relational Chain)
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

    return {
      success: true,
      alreadySubscribed: false,
      subscription,
      paymentTransaction: paymentTxn,
      message: `تم شراء المحاضرة (${lesson.title}) بنجاح!`,
    };
  });
}

/**
 * Returns student subscriptions structured hierarchically:
 * Teacher -> Subject/Course -> Lessons
 * Optional stage filter (e.g. 'SECONDARY_1') narrows results to a specific academic stage.
 */
export async function getStudentSubscriptions(studentId: string, stage?: string) {
  const where: any = { studentId, status: 'ACTIVE' };
  if (stage) where.academicStage = stage as any;

  const subscriptions = await prisma.lessonSubscription.findMany({
    where,
    include: {
      lesson: {
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
  });

  // Group by Teacher -> Course -> Lessons
  const teachersMap = new Map<string, any>();

  for (const sub of subscriptions) {
    const teacherId = sub.teacherProfileId;
    if (!teachersMap.has(teacherId)) {
      teachersMap.set(teacherId, {
        teacher: sub.teacherProfile,
        courses: new Map<string, any>(),
      });
    }

    const teacherEntry = teachersMap.get(teacherId);
    const courseId = sub.courseId || 'general-course';
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
        lessons: [],
      });
    }

    const courseEntry = teacherEntry.courses.get(courseId);
    courseEntry.lessons.push({
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
    });
  }

  // Convert maps to array structure
  const result = Array.from(teachersMap.values()).map((t) => ({
    teacher: t.teacher,
    courses: Array.from(t.courses.values()),
  }));

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
