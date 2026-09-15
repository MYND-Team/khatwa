import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { AppError, BadRequestError, ConflictError, UnauthorizedError, ForbiddenError } from '../../utils/errors';
import { RegisterStudentInput, RegisterWithCodeInput, LoginInput } from './auth.schema';
import { env } from '../../config/env';
type Role = 'STUDENT' | 'TEACHER' | 'STAFF' | 'ADMIN';

// ─── Protected Admin Usernames ────────────────────────────────────────────────
// These usernames are always treated as ADMIN regardless of DB role.
// This ensures the main platform admin can never be accidentally locked out.
const ADMIN_USERNAMES: string[] = ['sameryasser-khatwa'];

const SALT_ROUNDS = 12;

// ─── Token helpers ───────────────────────────────────────────────────────────

async function issueTokens(userId: string, username: string, role: Role) {
  const jti = crypto.randomUUID();
  const accessToken = signAccessToken({ sub: userId, username, role });
  const refreshToken = signRefreshToken({ sub: userId, jti });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.refreshToken.create({
    data: {
      userId,
      token: jti,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

// ─── Register Student ─────────────────────────────────────────────────────────

export async function registerStudent(input: RegisterStudentInput) {
  const { username, password, studentPhoneNumber, academicStage, parentInfo } = input as any;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw ConflictError('Username already taken');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentPhoneNumber,
          academicStage: academicStage || 'SECONDARY_1',
          academicStages: academicStage || 'SECONDARY_1',
          parentInfo: {
            create: {
              parentPhoneNumber: parentInfo.parentPhoneNumber,
              parentEmail: parentInfo.parentEmail,
              fatherJob: parentInfo.fatherJob,
              parentStatus: parentInfo.parentStatus,
            },
          },
        },
      },
    },
    select: { id: true, username: true, role: true, createdAt: true },
  });

  const tokens = await issueTokens(user.id, user.username, user.role);
  return { user, ...tokens };
}

// ─── Register with Role (TEACHER / STAFF / ADMIN) ─────────────────────────────

export async function registerWithCode(input: RegisterWithCodeInput) {
  const { username, password, displayName, role = 'STAFF' } = input as any;

  const targetRole = (role === 'TEACHER' ? 'TEACHER' : role === 'ADMIN' ? 'ADMIN' : 'STAFF') as Role;

  if (targetRole === 'ADMIN') {
    const adminSecret = process.env.ADMIN_REGISTRATION_SECRET || process.env.ADMIN_INVITE_CODE;
    if (!adminSecret || input.accessCode !== adminSecret) {
      throw ForbiddenError('رمز إنشاء حساب مسؤول غير صحيح أو غير متوفر');
    }
  } else if (targetRole === 'TEACHER') {
    const teacherSecret = process.env.TEACHER_INVITE_CODE;
    if (teacherSecret && input.accessCode !== teacherSecret) {
      throw ForbiddenError('رمز دعوة المعلم غير صحيح أو غير متوفر');
    }
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw ConflictError('Username already taken');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx: any) => {
    const newUser = await tx.user.create({
      data: {
        username,
        passwordHash,
        role: targetRole,
        ...(targetRole === 'TEACHER' && displayName
          ? {
              teacherProfile: {
                create: { 
                  displayName,
                  bio: (input as any).bio || (input as any).specialty || undefined,
                },
              },
            }
          : {}),
      },
      select: { id: true, username: true, role: true, createdAt: true },
    });

    return newUser;
  });

  const tokens = await issueTokens(user.id, user.username, user.role);
  return { user, ...tokens };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(input: LoginInput) {
  const { username, password, academicStage } = input as any;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { teacherProfile: true, studentProfile: true },
  });

  if (!user || !user.isActive) {
    throw UnauthorizedError('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw UnauthorizedError('Invalid credentials');

  // ─── Protected admin override ─────────────────────────────────────────────
  // If this is a known admin username but DB has wrong role, fix it silently.
  let effectiveRole = user.role as Role;
  if (ADMIN_USERNAMES.includes(username) && user.role !== 'ADMIN') {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
    });
    effectiveRole = 'ADMIN';
    console.warn(`⚠️  Auto-corrected role for protected admin account: ${username} → ADMIN`);
  }

  let studentProfile = user.studentProfile;
  if (effectiveRole === 'STUDENT') {
    if (academicStage) {
      studentProfile = await prisma.studentProfile.upsert({
        where: { userId: user.id },
        update: {
          academicStage: academicStage,
          academicStages: academicStage,
        },
        create: {
          userId: user.id,
          academicStage: academicStage,
          academicStages: academicStage,
          studentPhoneNumber: '',
        },
      });
    } else if (!studentProfile) {
      studentProfile = await prisma.studentProfile.create({
        data: {
          userId: user.id,
          academicStage: 'SECONDARY_3',
          academicStages: 'SECONDARY_3',
          studentPhoneNumber: '',
        },
      });
    }
  }

  const tokens = await issueTokens(user.id, user.username, effectiveRole);

  return {
    user: {
      id: user.id,
      username: user.username,
      role: effectiveRole,
      walletBalance: user.walletBalance,
      pointsBalance: user.pointsBalance,
      studentProfile: studentProfile ? {
        academicStage: studentProfile.academicStage,
        academicStages: studentProfile.academicStages,
        studentPhoneNumber: studentProfile.studentPhoneNumber,
      } : undefined,
      teacherProfile: user.teacherProfile ? {
        id: user.teacherProfile.id,
        displayName: user.teacherProfile.displayName,
        subject: user.teacherProfile.subject,
        commissionPct: user.teacherProfile.commissionPct,
      } : undefined,
    },
    ...tokens,
  };
}

// ─── Refresh Token ─────────────────────────────────────────────────────────────

export async function refreshAccessToken(rawRefreshToken: string) {
  let payload: { sub: string; jti: string };
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw UnauthorizedError('Invalid refresh token');
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: payload.jti },
    include: { user: true },
  });

  if (
    !storedToken ||
    storedToken.revoked ||
    storedToken.expiresAt < new Date()
  ) {
    throw UnauthorizedError('Refresh token expired or revoked');
  }

  const { user } = storedToken;
  if (!user || !user.isActive) {
    throw UnauthorizedError('الحساب معطل أو غير نشط');
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revoked: true },
  });

  const tokens = await issueTokens(
    user.id,
    user.username,
    user.role
  );

  return tokens;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(rawRefreshToken: string) {
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { token: payload.jti },
      data: { revoked: true },
    });
  } catch {
    // Token already invalid — no-op
  }
}
