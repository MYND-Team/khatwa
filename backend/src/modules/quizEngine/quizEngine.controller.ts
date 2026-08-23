import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../utils/validate';
import * as QuizService from './quizEngine.service';
import { z } from 'zod';

const createQuizSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    type: z.enum(['OPENING_QUIZ', 'HOMEWORK', 'EXAM']),
  }),
});

const addQuestionSchema = z.object({
  params: z.object({ id: z.string() }), // quizId
  body: z.object({
    questionText: z.string().min(1),
    optionA: z.string().min(1),
    optionB: z.string().min(1),
    optionC: z.string().min(1),
    optionD: z.string().min(1),
    correctOption: z.enum(['A', 'B', 'C', 'D']),
    orderIndex: z.number().int().optional(),
  }),
});

const submitAttemptSchema = z.object({
  params: z.object({ id: z.string() }), // quizId
  body: z.object({
    answers: z.array(
      z.object({
        questionId: z.string(),
        selectedOption: z.enum(['A', 'B', 'C', 'D']),
      })
    ).min(1),
  }),
});

const quizIdSchema = z.object({ params: z.object({ id: z.string() }) });

// ─── Teacher ─────────────────────────────────────────────────────────────────

export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(createQuizSchema, req);
  const data = await QuizService.createQuiz(body);
  res.status(201).json({ success: true, data });
});

export const addQuestion = asyncHandler(async (req: Request, res: Response) => {
  const { params, body } = validate(addQuestionSchema, req);
  const data = await QuizService.addQuestion({ quizId: params.id, ...body, actorUserId: req.user!.sub });
  res.status(201).json({ success: true, data });
});

export const getQuizWithAnswers = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(quizIdSchema, req);
  const data = await QuizService.getQuizWithAnswers(params.id, req.user!.sub);
  res.status(200).json({ success: true, data });
});

// ─── Student ──────────────────────────────────────────────────────────────────

export const getQuiz = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(quizIdSchema, req);
  const data = await QuizService.getQuiz(params.id);
  res.status(200).json({ success: true, data });
});

export const submitAttempt = asyncHandler(async (req: Request, res: Response) => {
  const { params, body } = validate(submitAttemptSchema, req);
  const data = await QuizService.submitAttempt({
    studentId: req.user!.sub,
    quizId: params.id,
    answers: body.answers,
  });
  res.status(200).json({ success: true, data });
});

export const getAttempt = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(quizIdSchema, req);
  const data = await QuizService.getAttempt(req.user!.sub, params.id);
  res.status(200).json({ success: true, data });
});
