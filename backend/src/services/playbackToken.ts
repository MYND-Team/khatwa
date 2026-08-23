import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

/**
 * Generates a short-lived, single-use playback token for a specific lesson.
 * The token is stored in DB and marked as used after first access.
 * This prevents link sharing and reuse.
 */
export async function generatePlaybackToken(
  studentId: string,
  lessonId: string
): Promise<string> {
  // Revoke any unused tokens for this student+lesson
  await prisma.playbackToken.updateMany({
    where: {
      studentId,
      lessonId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { expiresAt: new Date() }, // Expire immediately
  });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + env.PLAYBACK_TOKEN_TTL_SECONDS * 1000
  );

  await prisma.playbackToken.create({
    data: { token, lessonId, studentId, expiresAt },
  });

  return token;
}

/**
 * Validates and consumes a playback token (single-use).
 * Returns the lessonId if valid, throws otherwise.
 */
export async function consumePlaybackToken(
  token: string
): Promise<{ lessonId: string; studentId: string }> {
  return prisma.$transaction(async (tx: any) => {
    const record = await tx.playbackToken.findUnique({ where: { token } });

    if (!record) {
      throw new AppError('Invalid playback token', 401, 'INVALID_TOKEN');
    }

    if (record.usedAt) {
      throw new AppError('Playback token already used', 401, 'TOKEN_ALREADY_USED');
    }

    if (record.expiresAt < new Date()) {
      throw new AppError('Playback token expired', 401, 'TOKEN_EXPIRED');
    }

    // Atomic consumption: only update if usedAt is still null
    const result = await tx.playbackToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (result.count === 0) {
      throw new AppError('Playback token already used', 401, 'TOKEN_ALREADY_USED');
    }

    return { lessonId: record.lessonId, studentId: record.studentId };
  });
}
