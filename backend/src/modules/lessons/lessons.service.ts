import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { hasPassed } from '../quizEngine/quizEngine.service';

// ─── Create lesson ────────────────────────────────────────────────────────────

export async function createLesson(input: {
  teacherProfileId: string;
  courseId?: string | null;
  chapterId?: string | null;
  academicStage?: any;
  title: string;
  description?: string | null;
  price?: number;
  pointCost?: number;
  orderIndex?: number;
  imageUrl?: string | null;
  isPublished?: boolean;
}) {
  const newLesson = await prisma.lesson.create({
    data: {
      teacherProfileId: input.teacherProfileId,
      courseId: input.courseId,
      chapterId: input.chapterId,
      academicStage: input.academicStage || 'SECONDARY_1',
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl || null,
      price: input.price ?? 0.0,
      pointCost: input.pointCost ?? 0,
      orderIndex: input.orderIndex ?? 0,
      isPublished: input.isPublished ?? true,
    },
  });

  // If lesson belongs to a course (directly or via chapter), grant access to all enrolled students
  let targetCourseId = input.courseId;
  if (!targetCourseId && input.chapterId) {
    const chapter = await prisma.chapter.findUnique({
      where: { id: input.chapterId },
      select: { courseId: true },
    });
    if (chapter?.courseId) {
      targetCourseId = chapter.courseId;
    }
  }

  if (targetCourseId) {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { courseId: targetCourseId },
      select: { studentId: true },
    });

    if (enrollments.length > 0) {
      await prisma.lessonSubscription.createMany({
        data: enrollments.map((e) => ({
          studentId: e.studentId,
          lessonId: newLesson.id,
          teacherProfileId: input.teacherProfileId,
          academicStage: input.academicStage || 'SECONDARY_1',
          status: 'ACTIVE',
          paymentMethod: 'COURSE_ENROLLMENT',
          pricePaid: 0,
          pointsPaid: 0,
        })),
        skipDuplicates: true,
      }).catch((err) => console.error('Failed to auto-enroll course students for new lesson:', err));
    }
  }

  return newLesson;
}

// ─── Update lesson ────────────────────────────────────────────────────────────

export async function updateLesson(
  lessonId: string,
  teacherProfileId: string,
  input: any
) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw NotFoundError('Lesson');
  if (lesson.teacherProfileId !== teacherProfileId) {
    throw ForbiddenError('Not your lesson');
  }
  return prisma.lesson.update({ where: { id: lessonId }, data: input });
}

// ─── List lessons (public-ish — no video, no gating check) ───────────────────

export async function listLessons(teacherProfileId?: string) {
  return prisma.lesson.findMany({
    where: {
      isPublished: true,
      ...(teacherProfileId ? { teacherProfileId } : {}),
    },
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      pointCost: true,
      academicStage: true,
      orderIndex: true,
      openingQuizId: true,
      homeworkId: true,
    },
    orderBy: { orderIndex: 'asc' },
  });
}

// ─── Gating check before returning lesson content ────────────────────────────

export type GateReasonCode =
  | 'LESSON_LOCKED'
  | 'INSUFFICIENT_POINTS'
  | 'ASSIGNMENT_REQUIRED'
  | 'EXAM_REQUIRED'
  | 'QUIZ_NOT_PASSED'
  | 'HOMEWORK_NOT_SUBMITTED';

export async function getLessonContent(lessonId: string, studentId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      teacherProfile: { select: { displayName: true } },
    },
  });
  if (!lesson || !lesson.isPublished) throw NotFoundError('Lesson');

  // Scheduled Gate: Lesson not yet available (hidden completely until publish time)
  if (lesson.scheduledPublishAt && lesson.scheduledPublishAt > new Date()) {
    throw NotFoundError('Lesson');
  }

  const isFree = lesson.price === 0 && lesson.pointCost === 0;

  // Gate 1: Must have active subscription, unlocked lesson, or be enrolled in the course
  if (!isFree) {
    let isEnrolledInCourse = false;
    let effectiveCourseId = lesson.courseId;
    if (!effectiveCourseId && lesson.chapterId) {
      const ch = await prisma.chapter.findUnique({
        where: { id: lesson.chapterId },
        select: { courseId: true },
      });
      effectiveCourseId = ch?.courseId || null;
    }

    if (effectiveCourseId) {
      const courseEnrollment = await prisma.courseEnrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId: effectiveCourseId } },
      });
      if (courseEnrollment) {
        isEnrolledInCourse = true;
        await prisma.lessonSubscription.upsert({
          where: { studentId_lessonId: { studentId, lessonId } },
          create: {
            studentId,
            lessonId,
            teacherProfileId: lesson.teacherProfileId,
            academicStage: lesson.academicStage,
            status: 'ACTIVE',
            paymentMethod: 'COURSE_ENROLLMENT',
            pricePaid: 0,
            pointsPaid: 0,
          },
          update: { status: 'ACTIVE' },
        }).catch(() => null);
      }
    }

    if (!isEnrolledInCourse) {
      const subscription = await prisma.lessonSubscription.findUnique({
        where: { studentId_lessonId: { studentId, lessonId } },
      });

      const legacyUnlocked = await prisma.unlockedLesson.findUnique({
        where: { studentId_lessonId: { studentId, lessonId } },
      });

      if (!subscription || subscription.status !== 'ACTIVE') {
        if (!legacyUnlocked) {
          const gate: GateReasonCode = 'LESSON_LOCKED';
          throw Object.assign(
            new Error(`يجب شراء هذه المحاضرة أولاً للوصول إلى محتواها`),
            { statusCode: 403, code: gate }
          );
        }
      }
    }
  }

  // Gate 2: Academic Gate — Previous Lesson Homework must be submitted
  let previousLesson: any = null;
  if (lesson.chapterId) {
    previousLesson = await prisma.lesson.findFirst({
      where: {
        chapterId: lesson.chapterId,
        orderIndex: { lt: lesson.orderIndex },
        isPublished: true,
      },
      orderBy: { orderIndex: 'desc' },
      select: {
        id: true,
        title: true,
        assignmentQuizId: true,
        homeworkId: true,
      },
    });
  } else if (lesson.courseId) {
    previousLesson = await prisma.lesson.findFirst({
      where: {
        courseId: lesson.courseId,
        orderIndex: { lt: lesson.orderIndex },
        isPublished: true,
      },
      orderBy: { orderIndex: 'desc' },
      select: {
        id: true,
        title: true,
        assignmentQuizId: true,
        homeworkId: true,
      },
    });
  }

  if (previousLesson) {
    const prevHwQuizId = previousLesson.assignmentQuizId || previousLesson.homeworkId;
    if (prevHwQuizId) {
      const prevQuiz = await prisma.quiz.findUnique({
        where: { id: prevHwQuizId },
        select: { id: true, _count: { select: { questions: true } } },
      });
      if (prevQuiz && prevQuiz._count.questions > 0) {
        const prevAttempt = await prisma.quizAttempt.findUnique({
          where: { studentId_quizId: { studentId, quizId: prevHwQuizId } },
        });
        const prevHwSubmission = await prisma.homeworkSubmission.findUnique({
          where: { studentId_lessonId: { studentId, lessonId: previousLesson.id } },
        });
        if (!prevAttempt && !prevHwSubmission) {
          throw Object.assign(
            new Error(`يجب إكمال وتسليم واجب الحصة السابقة (${previousLesson.title}) أولاً`),
            { statusCode: 403, code: 'PREVIOUS_HOMEWORK_REQUIRED' }
          );
        }
      }
    }
  }

  // Gate 3: Exam of the current lesson must be taken and PASSED (if questions exist)
  const examQuizId = lesson.examQuizId || lesson.openingQuizId;
  if (examQuizId) {
    const examQuiz = await prisma.quiz.findUnique({
      where: { id: examQuizId },
      select: { id: true, _count: { select: { questions: true } } },
    });
    if (examQuiz && examQuiz._count.questions > 0) {
      const examAttempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: examQuizId } },
      });
      if (!examAttempt || !examAttempt.passed) {
        throw Object.assign(
          new Error(`يجب اجتياز امتحان الحصة أولاً قبل فتح المحتوى`),
          { statusCode: 403, code: 'EXAM_REQUIRED' }
        );
      }
    }
  }

  // Gate 4: Assignment / Opening quiz must be completed if questions exist
  const effectiveHwQuizId = lesson.assignmentQuizId || lesson.homeworkId;
  if (effectiveHwQuizId && effectiveHwQuizId !== examQuizId) {
    const assignQuiz = await prisma.quiz.findUnique({
      where: { id: effectiveHwQuizId },
      select: { id: true, _count: { select: { questions: true } } },
    });
    if (assignQuiz && assignQuiz._count.questions > 0) {
      const attempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: effectiveHwQuizId } },
      });
      const submission = !lesson.assignmentQuizId
        ? await prisma.homeworkSubmission.findUnique({
            where: { studentId_lessonId: { studentId, lessonId: lesson.id } },
          })
        : null;
      if (!attempt && !submission) {
        throw Object.assign(
          new Error(`يجب تسليم الواجب أولاً قبل فتح المحاضرة`),
          { statusCode: 403, code: 'ASSIGNMENT_REQUIRED' }
        );
      }
    }
  }

  // Attach student grades for assignment & exam if present
  let assignmentGrade: any = null;
  let examGrade: any = null;
  const hwQuizId = lesson.assignmentQuizId || lesson.homeworkId;
  const exQuizId = lesson.examQuizId || lesson.openingQuizId;

  if (hwQuizId || exQuizId) {
    const qIds = [hwQuizId, exQuizId].filter(Boolean) as string[];
    const attempts = await prisma.quizAttempt.findMany({
      where: { studentId, quizId: { in: qIds } },
      select: { quizId: true, score: true, totalQuestions: true, passed: true },
    });
    for (const att of attempts) {
      const total = att.totalQuestions || 1;
      const gradeObj = {
        score: att.score,
        totalQuestions: att.totalQuestions,
        scorePercent: Math.round((att.score / total) * 100),
        passed: att.passed,
      };
      if (att.quizId === hwQuizId) assignmentGrade = gradeObj;
      if (att.quizId === exQuizId) examGrade = gradeObj;
    }
  }

  // All gates passed — return content metadata
  return {
    id: lesson.id,
    lessonId: lesson.id,
    title: lesson.title,
    description: lesson.description,
    teacher: lesson.teacherProfile.displayName,
    driveFileId: lesson.driveFileId,
    videoUrl: lesson.videoUrl,
    pdfUrl: lesson.pdfUrl,
    pdfFileName: lesson.pdfFileName,
    imageUrl: lesson.imageUrl,
    hasVideo: !!(lesson.driveFileId || lesson.videoUrl),
    assignmentGrade,
    examGrade,
  };
}

// ─── Teacher & Admin Content Preview (Bypasses Student Gates) ────────────────

export async function getLessonPreview(lessonId: string, actorUserId: string, actorRole: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      teacherProfile: { select: { id: true, userId: true, displayName: true } },
      course: { select: { id: true, title: true, subject: true, academicStage: true } },
      chapter: { select: { id: true, title: true } },
      assignmentQuiz: { include: { questions: true } },
      examQuiz: { include: { questions: true } },
    },
  });

  if (!lesson) throw NotFoundError('Lesson');

  // Permission check: Must be the owner teacher or an ADMIN
  if (actorRole !== 'ADMIN' && lesson.teacherProfile.userId !== actorUserId) {
    throw ForbiddenError('ليس لديك صلاحية لمعاينة محتوى هذا المعلم');
  }

  return {
    id: lesson.id,
    lessonId: lesson.id,
    title: lesson.title,
    description: lesson.description,
    price: lesson.price,
    pointCost: lesson.pointCost,
    academicStage: lesson.academicStage,
    isPublished: lesson.isPublished,
    teacher: lesson.teacherProfile.displayName,
    teacherProfileId: lesson.teacherProfileId,
    course: lesson.course,
    chapter: lesson.chapter,
    driveFileId: lesson.driveFileId,
    videoUrl: lesson.videoUrl,
    pdfUrl: lesson.pdfUrl,
    pdfFileName: lesson.pdfFileName,
    hasVideo: !!(lesson.driveFileId || lesson.videoUrl),
    assignmentQuiz: lesson.assignmentQuiz,
    examQuiz: lesson.examQuiz,
  };
}

// ─── Submit homework ─────────────────────────────────────────────────────────

export async function submitHomework(studentId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { teacherProfile: true },
  });
  if (!lesson) throw NotFoundError('Lesson');

  // Idempotent
  const existing = await prisma.homeworkSubmission.findUnique({
    where: { studentId_lessonId: { studentId, lessonId } },
  });
  if (existing) return existing;

  return prisma.homeworkSubmission.create({
    data: { studentId, lessonId },
  });
}

// ─── Unlock lesson ───────────────────────────────────────────────────────────

export async function unlockLesson(studentId: string, lessonId: string) {
  const { purchaseLesson } = await import('../../services/subscription.service');
  return purchaseLesson({ studentId, lessonId, paymentMethod: 'POINTS' });
}

// ─── Teacher: get lesson detail with quiz IDs ─────────────────────────────────

export async function getLessonDetail(lessonId: string, teacherProfileId?: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      openingQuiz: { include: { questions: true } },
      homework: { include: { questions: true } },
      assignmentQuiz: { include: { questions: true } },
      examQuiz: { include: { questions: true } },
      teacherProfile: { select: { displayName: true } },
    },
  });
  if (!lesson) throw NotFoundError('Lesson');
  if (teacherProfileId && lesson.teacherProfileId !== teacherProfileId) {
    throw ForbiddenError('Not your lesson');
  }
  return lesson;
}

// ─── Student progress for teacher dashboard ───────────────────────────────────

export async function getStudentProgress(studentId: string, teacherProfileId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { teacherProfileId, isPublished: true },
    include: {
      subscriptions: { where: { studentId, status: 'ACTIVE' } },
      unlockedBy: { where: { studentId } },
      assignmentQuiz: {
        include: { attempts: { where: { studentId } } },
      },
      examQuiz: {
        include: { attempts: { where: { studentId } } },
      },
    },
    orderBy: { orderIndex: 'asc' },
  });

  return lessons.map((lesson: any) => ({
    lessonId: lesson.id,
    title: lesson.title,
    orderIndex: lesson.orderIndex,
    isSubscribed: lesson.subscriptions.length > 0 || lesson.unlockedBy.length > 0,
    assignmentSubmitted: (lesson.assignmentQuiz?.attempts?.length || 0) > 0,
    examPassed: lesson.examQuiz?.attempts[0]?.passed ?? false,
    examScore: lesson.examQuiz?.attempts[0]?.score ?? null,
  }));
}
