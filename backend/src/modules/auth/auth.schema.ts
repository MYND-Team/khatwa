import { z } from 'zod';

export const registerStudentSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    studentPhoneNumber: z.string().min(10),
    parentInfo: z.object({
      parentPhoneNumber: z.string().min(10),
      parentEmail: z.string().email().optional(),
      fatherJob: z.string().min(1),
      parentStatus: z.enum([
        'BOTH_ALIVE',
        'FATHER_DECEASED',
        'MOTHER_DECEASED',
        'BOTH_DECEASED',
      ]),
    }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const registerWithCodeSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8),
    confirmPassword: z.string(),
    displayName: z.string().min(1).optional(),
    role: z.enum(['TEACHER', 'STAFF', 'ADMIN']).optional(),
    specialty: z.string().optional(),
    bio: z.string().optional(),
    accessCode: z.string().optional(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
});

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>['body'];
export type RegisterWithCodeInput = z.infer<typeof registerWithCodeSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
