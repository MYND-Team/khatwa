import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { hasPassed } from '../quizEngine/quizEngine.service';

// ─── Create lesson ────────────────────────────────────────────────────────────

export async function createLesson(input: {
  teacherProfileId: string;
  title: string;
  description?: string;
  pointCost: number;
  orderIndex?: number;
}) {
  return prisma.lesson.create({
    data: {
      teacherProfileId: input.teacherProfileId,
      title: input.title,
      description: input.description,
      pointCost: input.pointCost,
      orderIndex: input.orderIndex ?? 0,
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
    pointCost: number;
    orderIndex: number;
    openingQuizId: string;
    homeworkId: string;
    isPublished: boolean;
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
      pointCost: true,
      orderIndex: true,
      openingQuizId: true,
      homeworkId: true,
    },
    orderBy: { orderIndex: 'asc' },
  });
}

// ─── Gating check before returning lesson content ────────────────────────────

export type GateReasonCode =
  | 'INSUFFICIENT_POINTS'
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

  // Gate 1: Must have unlocked (spent points)
  const unlocked = await prisma.unlockedLesson.findUnique({
    where: { studentId_lessonId: { studentId, lessonId } },
  });
  if (!unlocked) {
    const gate: GateReasonCode = 'INSUFFICIENT_POINTS';
    throw Object.assign(
      new Error(`Access denied: ${gate}`),
      { statusCode: 403, code: gate }
    );
  }

  // Gate 2: Opening quiz must be passed
  if (lesson.openingQuizId) {
    const passed = await hasPassed(studentId, lesson.openingQuizId);
    if (!passed) {
      const gate: GateReasonCode = 'QUIZ_NOT_PASSED';
      throw Object.assign(
        new Error(`Access denied: ${gate}`),
        { statusCode: 403, code: gate }
      );
    }
  }

  // Gate 3: Previous lesson's homework must be submitted
  const previousLesson = await prisma.lesson.findFirst({
    where: {
      teacherProfileId: lesson.teacherProfileId,
      orderIndex: { lt: lesson.orderIndex },
      isPublished: true,
    },
    orderBy: { orderIndex: 'desc' },
  });

  if (previousLesson?.homeworkId) {
    const homeworkSubmitted = await prisma.homeworkSubmission.findUnique({
      where: { studentId_lessonId: { studentId, lessonId: previousLesson.id } },
    });
    if (!homeworkSubmitted) {
      const gate: GateReasonCode = 'HOMEWORK_NOT_SUBMITTED';
      throw Object.assign(
        new Error(`Access denied: ${gate}`),
        { statusCode: 403, code: gate }
      );
    }
  }

  // All gates passed — return content metadata (actual video via stream endpoint)
  return {
    lessonId: lesson.id,
    title: lesson.title,
    description: lesson.description,
    teacher: lesson.teacherProfile.displayName,
    driveFileId: lesson.driveFileId, // used internally by stream endpoint
    hasVideo: !!lesson.driveFileId,
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

// ─── Unlock lesson (called from points service after deduction) ───────────────

export async function unlockLesson(studentId: string, lessonId: string) {
  // Delegate to points service which handles the deduction atomically
  const { spendPoints } = await import('../points/points.service');
  return spendPoints(studentId, lessonId);
}

// ─── Teacher: get lesson detail with quiz IDs ─────────────────────────────────

export async function getLessonDetail(lessonId: string, teacherProfileId?: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      openingQuiz: { include: { questions: true } },
      homework: { include: { questions: true } },
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
      unlockedBy: { where: { studentId } },
      openingQuiz: {
        include: { attempts: { where: { studentId } } },
      },
      homework: {
        include: { attempts: { where: { studentId } } },
      },
    },
    orderBy: { orderIndex: 'asc' },
  });

  return lessons.map((lesson: any) => ({
    lessonId: lesson.id,
    title: lesson.title,
    orderIndex: lesson.orderIndex,
    unlocked: lesson.unlockedBy.length > 0,
    openingQuizPassed: lesson.openingQuiz?.attempts[0]?.passed ?? false,
    openingQuizScore: lesson.openingQuiz?.attempts[0]?.score ?? null,
    homeworkPassed: lesson.homework?.attempts[0]?.passed ?? false,
    homeworkScore: lesson.homework?.attempts[0]?.score ?? null,
  }));
}
