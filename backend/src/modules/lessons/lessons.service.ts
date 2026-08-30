import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { hasPassed } from '../quizEngine/quizEngine.service';

// ─── Create lesson ────────────────────────────────────────────────────────────

export async function createLesson(input: {
  teacherProfileId: string;
  courseId?: string;
  chapterId?: string;
  academicStage?: any;
  title: string;
  description?: string;
  price?: number;
  pointCost?: number;
  orderIndex?: number;
  isPublished?: boolean;
}) {
  return prisma.lesson.create({
    data: {
      teacherProfileId: input.teacherProfileId,
      courseId: input.courseId,
      chapterId: input.chapterId,
      academicStage: input.academicStage || 'SECONDARY_1',
      title: input.title,
      description: input.description,
      price: input.price ?? 0.0,
      pointCost: input.pointCost ?? 0,
      orderIndex: input.orderIndex ?? 0,
      isPublished: input.isPublished ?? true,
    },
  });
}

// ─── Update lesson ────────────────────────────────────────────────────────────

export async function updateLesson(
  lessonId: string,
  teacherProfileId: string,
  input: Partial<{
    title: string;
    description: string;
    price: number;
    pointCost: number;
    academicStage: any;
    orderIndex: number;
    openingQuizId: string;
    homeworkId: string;
    assignmentQuizId: string;
    examQuizId: string;
    isPublished: boolean;
    videoUrl: string;
    driveFileId: string;
    pdfUrl: string;
  }>
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

  const isFree = lesson.price === 0 && lesson.pointCost === 0;

  // Gate 1: Must have active subscription or unlocked lesson
  if (!isFree) {
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

  // Gate 2: Assignment / Opening quiz must be completed if required
  if (lesson.assignmentQuizId) {
    const attempt = await prisma.quizAttempt.findUnique({
      where: { studentId_quizId: { studentId, quizId: lesson.assignmentQuizId } },
    });
    if (!attempt) {
      throw Object.assign(
        new Error(`يجب تسليم الواجب أولاً قبل فتح المحاضرة`),
        { statusCode: 403, code: 'ASSIGNMENT_REQUIRED' }
      );
    }
  }

  if (lesson.examQuizId) {
    const examAttempt = await prisma.quizAttempt.findUnique({
      where: { studentId_quizId: { studentId, quizId: lesson.examQuizId } },
    });
    if (!examAttempt || !examAttempt.passed) {
      throw Object.assign(
        new Error(`يجب اجتياز الامتحان أولاً قبل فتح المحاضرة`),
        { statusCode: 403, code: 'EXAM_REQUIRED' }
      );
    }
  }

  // All gates passed — return content metadata
  return {
    lessonId: lesson.id,
    title: lesson.title,
    description: lesson.description,
    teacher: lesson.teacherProfile.displayName,
    driveFileId: lesson.driveFileId,
    videoUrl: lesson.videoUrl,
    pdfUrl: lesson.pdfUrl,
    pdfFileName: lesson.pdfFileName,
    hasVideo: !!(lesson.driveFileId || lesson.videoUrl),
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
