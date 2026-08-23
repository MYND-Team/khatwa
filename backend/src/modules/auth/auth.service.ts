import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { AppError, BadRequestError, ConflictError, UnauthorizedError } from '../../utils/errors';
import { RegisterStudentInput, RegisterWithCodeInput, LoginInput } from './auth.schema';
import { env } from '../../config/env';
type Role = 'STUDENT' | 'TEACHER' | 'STAFF' | 'ADMIN';

const SALT_ROUNDS = 12;

// ─── Token helpers ───────────────────────────────────────────────────────────

async function issueTokens(userId: string, username: string, role: Role) {
  const jti = uuidv4();
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
  const { username, password, studentPhoneNumber, parentInfo } = input;

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

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw ConflictError('Username already taken');

  const targetRole = (role === 'TEACHER' ? 'TEACHER' : role === 'ADMIN' ? 'ADMIN' : 'STAFF') as Role;
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
  const { username, password } = input;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { teacherProfile: true },
  });

  if (!user || !user.isActive) {
    throw UnauthorizedError('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw UnauthorizedError('Invalid credentials');

  const tokens = await issueTokens(
    user.id,
    user.username,
    user.role
  );

  return {
    user: { id: user.id, username: user.username, role: user.role },
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
