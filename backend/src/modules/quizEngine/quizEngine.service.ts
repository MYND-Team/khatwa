import { prisma } from '../../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
type QuizType = 'OPENING_QUIZ' | 'HOMEWORK' | 'EXAM';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateQuizInput {
  title: string;
  type: QuizType;
}

interface AddQuestionInput {
  quizId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
  orderIndex?: number;
}

interface SubmitAttemptInput {
  studentId: string;
  quizId: string;
  answers: { questionId: string; selectedOption: 'A' | 'B' | 'C' | 'D' }[];
}

// ─── Create quiz ──────────────────────────────────────────────────────────────

export async function createQuiz(input: CreateQuizInput) {
  return prisma.quiz.create({ data: { title: input.title, type: input.type } });
}

// ─── Add question ─────────────────────────────────────────────────────────────

export async function addQuestion(input: AddQuestionInput & { actorUserId: string }) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: input.quizId },
    include: {
      // A quiz is owned by a teacher if it is linked to one of their lessons.
      // Check both openingForLessons and homeworkForLessons relations.
      openingForLessons: { select: { teacherProfileId: true } },
      homeworkForLessons: { select: { teacherProfileId: true } },
    },
  });
  if (!quiz) throw NotFoundError('Quiz');

  // Resolve the actor's teacher profile id
  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: input.actorUserId },
    select: { id: true },
  });

  if (!teacherProfile) throw NotFoundError('TeacherProfile');
  const actorTeacherProfileId = teacherProfile.id;

  // Verify the quiz belongs to this teacher (via at least one linked lesson)
  const ownerProfileIds = [
    ...quiz.openingForLessons.map((l: any) => l.teacherProfileId),
    ...quiz.homeworkForLessons.map((l: any) => l.teacherProfileId),
  ];

  if (ownerProfileIds.length > 0 && !ownerProfileIds.includes(actorTeacherProfileId)) {
    throw ForbiddenError('You do not own this quiz');
  }

  return prisma.quizQuestion.create({
    data: {
      quizId: input.quizId,
      questionText: input.questionText,
      optionA: input.optionA,
      optionB: input.optionB,
      optionC: input.optionC,
      optionD: input.optionD,
      correctOption: input.correctOption,
      orderIndex: input.orderIndex ?? 0,
    },
  });
}

// ─── Get quiz with questions (for student to take) ───────────────────────────

export async function getQuiz(quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          questionText: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          orderIndex: true,
          // correctOption is intentionally excluded from student-facing response
        },
      },
    },
  });
  if (!quiz) throw NotFoundError('Quiz');
  return quiz;
}

// ─── Submit attempt + auto-grade ─────────────────────────────────────────────

export async function submitAttempt(input: SubmitAttemptInput) {
  const { studentId, quizId, answers } = input;

  // Load questions with correct answers
  const questions = await prisma.quizQuestion.findMany({
    where: { quizId },
    orderBy: { orderIndex: 'asc' },
  });

  if (questions.length === 0) {
    throw BadRequestError('Quiz has no questions', 'EMPTY_QUIZ');
  }

  // Check all questions answered
  const questionIds = questions.map((q: any) => q.id);
  const answeredIds = answers.map((a) => a.questionId);
  const missing = questionIds.filter((id: string) => !answeredIds.includes(id));
  if (missing.length > 0) {
    throw BadRequestError(
      `Missing answers for ${missing.length} question(s)`,
      'INCOMPLETE_SUBMISSION'
    );
  }

  // Auto-grade
  let correctCount = 0;
  const graded = answers.map((answer) => {
    const question = questions.find((q: any) => q.id === answer.questionId)!;
    const isCorrect = answer.selectedOption === question.correctOption;
    if (isCorrect) correctCount++;
    return { ...answer, isCorrect };
  });

  const score = correctCount;
  const totalQuestions = questions.length;
  const passed = score >= Math.ceil(totalQuestions * 0.5); // 50% pass threshold

  // Upsert attempt (allow retake if not yet passed)
  const existingAttempt = await prisma.quizAttempt.findUnique({
    where: { studentId_quizId: { studentId, quizId } },
  });

  if (existingAttempt?.passed) {
    throw BadRequestError('Quiz already passed', 'ALREADY_PASSED');
  }

  const attempt = await prisma.$transaction(async (tx: any) => {
    // Delete old attempt if exists
    if (existingAttempt) {
      await tx.attemptAnswer.deleteMany({ where: { attemptId: existingAttempt.id } });
      await tx.quizAttempt.delete({ where: { id: existingAttempt.id } });
    }

    return tx.quizAttempt.create({
      data: {
        studentId,
        quizId,
        score,
        totalQuestions,
        passed,
        answers: {
          create: graded.map(({ questionId, selectedOption, isCorrect }) => ({
            questionId,
            selectedOption,
            isCorrect,
          })),
        },
      },
      include: { answers: true },
    });
  });

  return { attempt, score, totalQuestions, passed };
}

// ─── Check if student passed a quiz ─────────────────────────────────────────

export async function hasPassed(studentId: string, quizId: string): Promise<boolean> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { studentId_quizId: { studentId, quizId } },
    select: { passed: true },
  });
  return attempt?.passed ?? false;
}

// ─── Get attempt result ───────────────────────────────────────────────────────

export async function getAttempt(studentId: string, quizId: string) {
  return prisma.quizAttempt.findUnique({
    where: { studentId_quizId: { studentId, quizId } },
    include: {
      answers: {
        select: {
          id: true,
          questionId: true,
          selectedOption: true,
          isCorrect: true,
          question: {
            select: {
              questionText: true,
              optionA: true,
              optionB: true,
              optionC: true,
              optionD: true,
              // correctOption is EXCLUDED to prevent exposing answer keys to students
            },
          },
        },
      },
    },
  });
}

// ─── List all questions for a quiz (teacher view — includes correct answers) ──

export async function getQuizWithAnswers(quizId: string, actorUserId?: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { orderIndex: 'asc' } },
      openingForLessons: { select: { teacherProfileId: true } },
      homeworkForLessons: { select: { teacherProfileId: true } },
    },
  });
  if (!quiz) throw NotFoundError('Quiz');

  if (actorUserId) {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (!teacherProfile) throw NotFoundError('TeacherProfile');

    const ownerProfileIds = [
      ...quiz.openingForLessons.map((l: any) => l.teacherProfileId),
      ...quiz.homeworkForLessons.map((l: any) => l.teacherProfileId),
    ];

    if (ownerProfileIds.length > 0 && !ownerProfileIds.includes(teacherProfile.id)) {
      throw ForbiddenError('You do not own this quiz');
    }
  }

  return quiz;
}
