import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/errors';

// ─── Create quiz ──────────────────────────────────────────────────────────────

export async function createQuiz(input: { title: string; type?: string }) {
  return prisma.quiz.create({
    data: { title: input.title, type: (input.type as any) || 'EXAM' },
  });
}

// ─── Get quiz for student (no correct answers exposed) ───────────────────────

export async function getQuiz(quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          questionType: true,
          questionText: true,
          // MC options (shown to student)
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          // Equation latex (rendered on frontend)
          equationLatex: true,
          // correctOption intentionally excluded from student view
          // rubric intentionally excluded from student view
          orderIndex: true,
        },
      },
    },
  });
  if (!quiz) throw NotFoundError('Quiz');
  return quiz;
}

// ─── Submit attempt + auto-grade ─────────────────────────────────────────────
//
// Supports 3 question types:
// 1. MULTIPLE_CHOICE → auto-graded by correctOption match
// 2. ESSAY → stored as textAnswer, isCorrect = false (requires manual review)
// 3. EQUATION → stored as textAnswer, isCorrect = false (requires manual review)

export async function submitAttempt(input: {
  studentId: string;
  quizId: string;
  answers: Array<{
    questionId: string;
    selectedOption?: string;   // For MULTIPLE_CHOICE
    textAnswer?: string;       // For ESSAY and EQUATION
  }>;
}) {
  const { studentId, quizId, answers } = input;

  // Load questions with correct answers
  const questions = await prisma.quizQuestion.findMany({
    where: { quizId },
    orderBy: { orderIndex: 'asc' },
  });

  if (questions.length === 0) {
    throw BadRequestError('Quiz has no questions', 'EMPTY_QUIZ');
  }

  // For multiple-choice questions, verify all are answered
  const mcQuestions = questions.filter((q: any) => q.questionType === 'MULTIPLE_CHOICE');
  const answeredIds = answers.map((a) => a.questionId);
  const missingMC = mcQuestions.filter((q: any) => !answeredIds.includes(q.id));
  if (missingMC.length > 0) {
    throw BadRequestError(
      `Missing answers for ${missingMC.length} multiple-choice question(s)`,
      'INCOMPLETE_SUBMISSION'
    );
  }

  // Grade the attempt
  let correctCount = 0;
  let gradedMCCount = 0;

  const graded = answers.map((answer) => {
    const question = questions.find((q: any) => q.id === answer.questionId);
    if (!question) return null;

    let isCorrect = false;
    if (question.questionType === 'MULTIPLE_CHOICE') {
      isCorrect = answer.selectedOption === question.correctOption;
      if (isCorrect) correctCount++;
      gradedMCCount++;
    }
    // Essay and Equation require manual grading → isCorrect stays false
    // They are treated as "submitted" which is enough to unlock the next step

    return {
      questionId: answer.questionId,
      selectedOption: answer.selectedOption || null,
      textAnswer: answer.textAnswer || null,
      isCorrect,
    };
  }).filter(Boolean) as any[];

  // Compute score: MC questions count for score, essay/equation count as submission
  const totalMCQuestions = mcQuestions.length;
  const score = correctCount;
  const totalQuestions = questions.length;

  // Pass: if no MC questions → pass if all submitted; otherwise 50% MC pass threshold
  const passed = totalMCQuestions === 0
    ? graded.length > 0  // submitted at least one essay/equation answer
    : score >= Math.ceil(totalMCQuestions * 0.5);

  // Upsert attempt (allow retake if not yet passed)
  const existingAttempt = await prisma.quizAttempt.findUnique({
    where: { studentId_quizId: { studentId, quizId } },
  });

  if (existingAttempt?.passed) {
    throw BadRequestError('Quiz already passed', 'ALREADY_PASSED');
  }

  const attempt = await prisma.$transaction(async (tx: any) => {
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
          create: graded.map(({ questionId, selectedOption, textAnswer, isCorrect }) => ({
            questionId,
            selectedOption,
            textAnswer,
            isCorrect,
          })),
        },
      },
      include: { answers: true },
    });
  });

  return { attempt, score, totalQuestions, passed };
}

// ─── Check if student passed ─────────────────────────────────────────────────

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
          textAnswer: true,
          isCorrect: true,
          question: {
            select: {
              questionText: true,
              questionType: true,
              optionA: true,
              optionB: true,
              optionC: true,
              optionD: true,
              equationLatex: true,
              // correctOption and rubric excluded from student view
            },
          },
        },
      },
    },
  });
}

// ─── Teacher view (includes correct answers + rubrics) ───────────────────────

export async function getQuizWithAnswers(quizId: string, _actorUserId?: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { orderIndex: 'asc' },
        // All fields including correctOption, rubric, sampleAnswer
      },
    },
  });
  if (!quiz) throw NotFoundError('Quiz');
  return quiz;
}
