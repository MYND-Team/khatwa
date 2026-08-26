import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as QuizService from './quizEngine.service';
import { prisma } from '../../config/prisma';

// ─── Teacher ─────────────────────────────────────────────────────────────────

export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const { title, type = 'EXAM' } = req.body;
  if (!title) {
    res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'title is required' } });
    return;
  }
  const data = await QuizService.createQuiz({ title, type });
  res.status(201).json({ success: true, data });
});

export const addQuestion = asyncHandler(async (req: Request, res: Response) => {
  const quizId = req.params.id;
  const {
    questionType = 'MULTIPLE_CHOICE',
    questionText,
    // Multiple choice fields
    optionA, optionB, optionC, optionD, correctOption,
    // Essay fields
    sampleAnswer, rubric,
    // Equation fields
    equationLatex,
    orderIndex,
  } = req.body;

  if (!questionText) {
    res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'questionText is required' } });
    return;
  }

  const validTypes = ['MULTIPLE_CHOICE', 'ESSAY', 'EQUATION'];
  if (!validTypes.includes(questionType)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_TYPE', message: `questionType must be one of: ${validTypes.join(', ')}` },
    });
    return;
  }

  if (questionType === 'MULTIPLE_CHOICE' && (!optionA || !optionB || !correctOption)) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'optionA, optionB, and correctOption are required for MULTIPLE_CHOICE questions' },
    });
    return;
  }

  const maxOrder = await prisma.quizQuestion.aggregate({
    where: { quizId },
    _max: { orderIndex: true },
  });
  const nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;

  const question = await prisma.quizQuestion.create({
    data: {
      quizId,
      questionType,
      questionText,
      optionA: optionA || null,
      optionB: optionB || null,
      optionC: optionC || null,
      optionD: optionD || null,
      correctOption: correctOption || null,
      sampleAnswer: sampleAnswer || null,
      rubric: rubric || null,
      equationLatex: equationLatex || null,
      orderIndex: orderIndex !== undefined ? parseInt(orderIndex) : nextOrder,
    },
  });

  res.status(201).json({ success: true, data: question });
});

export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  await prisma.quizQuestion.delete({ where: { id: req.params.questionId } });
  res.status(200).json({ success: true, message: 'Question deleted' });
});

export const getQuizWithAnswers = asyncHandler(async (req: Request, res: Response) => {
  const data = await QuizService.getQuizWithAnswers(req.params.id as string, req.user!.sub);
  res.status(200).json({ success: true, data });
});

// ─── Student ──────────────────────────────────────────────────────────────────

export const getQuiz = asyncHandler(async (req: Request, res: Response) => {
  const data = await QuizService.getQuiz(req.params.id as string);
  res.status(200).json({ success: true, data });
});

export const submitAttempt = asyncHandler(async (req: Request, res: Response) => {
  const { answers } = req.body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'answers array is required' } });
    return;
  }

  const data = await QuizService.submitAttempt({
    studentId: req.user!.sub,
    quizId: req.params.id as string,
    answers,
  });

  res.status(200).json({ success: true, data });
});

export const getAttempt = asyncHandler(async (req: Request, res: Response) => {
  const data = await QuizService.getAttempt(req.user!.sub, req.params.id as string);
  res.status(200).json({ success: true, data });
});
