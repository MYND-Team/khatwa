import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError, ConflictError } from '../../utils/errors';
type AccessCodeStatus = 'ACTIVE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';

/**
 * Generates a cryptographically random access code in format FG-XXXX-XXXX.
 */
export function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid 0/O and 1/I for human readability
  const randomBytes = crypto.randomBytes(8);
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars[randomBytes[i] % chars.length];
    p2 += chars[randomBytes[i + 4] % chars.length];
  }
  return `FG-${p1}-${p2}`;
}

/**
 * Hashes an access code using SHA-256 for secure storage.
 */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export interface CreateAccessCodeInput {
  points: number;
  expiresInHours?: number;
  createdById: string;
}

// ─── Generate points access code (STAFF / ADMIN) ─────────────────────────────

export async function createAccessCode(input: CreateAccessCodeInput) {
  if (input.points <= 0) {
    throw BadRequestError('Points must be a positive integer');
  }

  const plainCode = generateRandomCode();
  const codeHash = hashCode(plainCode);

  let expiresAt: Date | undefined;
  if (input.expiresInHours && input.expiresInHours > 0) {
    expiresAt = new Date(Date.now() + input.expiresInHours * 3600 * 1000);
  }

  const record = await prisma.accessCode.create({
    data: {
      code: plainCode,
      codeHash,
      points: input.points,
      expiresAt,
      createdById: input.createdById,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      code: true,
      points: true,
      status: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return {
    id: record.id,
    code: plainCode, // Plaintext returned ONLY at generation time
    points: record.points,
    expiresAt: record.expiresAt,
    status: record.status,
  };
}

export async function batchCreateAccessCodes(input: CreateAccessCodeInput & { count: number }) {
  const count = Math.min(Math.max(1, input.count || 1), 100);
  const results = [];
  for (let i = 0; i < count; i++) {
    const codeData = await createAccessCode(input);
    results.push(codeData);
  }
  return results;
}

// ─── Redeem points access code (STUDENT) ─────────────────────────────────────

export async function redeemAccessCode(rawCode: string, studentId: string) {
  const formattedCode = rawCode.trim().toUpperCase();
  if (!formattedCode) {
    throw BadRequestError('Access code is required');
  }

  const codeHash = hashCode(formattedCode);

  return prisma.$transaction(async (tx: any) => {
    // 1. Find matching access code
    const accessCode = await tx.accessCode.findUnique({
      where: { codeHash },
    });

    if (!accessCode) {
      throw BadRequestError('Invalid or nonexistent access code', 'INVALID_ACCESS_CODE');
    }

    // 2. Check if already redeemed
    if (accessCode.status === 'REDEEMED' || accessCode.redeemedById) {
      throw BadRequestError('This access code has already been redeemed', 'CODE_ALREADY_REDEEMED');
    }

    // 3. Check if revoked
    if (accessCode.status === 'REVOKED' || accessCode.revokedAt) {
      throw BadRequestError('This access code has been revoked', 'CODE_REVOKED');
    }

    // 4. Check if expired
    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      await tx.accessCode.update({
        where: { id: accessCode.id },
        data: { status: 'EXPIRED' },
      });
      throw BadRequestError('This access code has expired', 'CODE_EXPIRED');
    }

    if (accessCode.status !== 'ACTIVE') {
      throw BadRequestError('This access code is not active', 'CODE_NOT_ACTIVE');
    }

    // 5. Atomically mark as REDEEMED (prevents race-condition double redemption)
    const updatedCount = await tx.accessCode.updateMany({
      where: {
        id: accessCode.id,
        status: 'ACTIVE',
        redeemedById: null,
      },
      data: {
        status: 'REDEEMED',
        redeemedById: studentId,
        redeemedAt: new Date(),
      },
    });

    if (updatedCount.count === 0) {
      throw BadRequestError('This access code has already been redeemed', 'CODE_ALREADY_REDEEMED');
    }

    // 6. Credit points to student balance
    const updatedStudent = await tx.user.update({
      where: { id: studentId },
      data: {
        pointsBalance: { increment: accessCode.points },
      },
      select: {
        id: true,
        username: true,
        pointsBalance: true,
      },
    });

    // 7. Create audit transaction record
    await tx.pointsTransaction.create({
      data: {
        studentId,
        type: 'CREDIT',
        amount: accessCode.points,
        reason: `Redeemed access code (ID: ${accessCode.id})`,
        relatedCodeId: accessCode.id,
        actorId: studentId,
      },
    });

    const redeemedAt = new Date();

    return {
      pointsAdded: accessCode.points,
      newBalance: updatedStudent.pointsBalance,
      redeemedAt,
    };
  });
}

// ─── Revoke access code (STAFF / ADMIN) ──────────────────────────────────────

export async function revokeAccessCode(codeId: string) {
  const code = await prisma.accessCode.findUnique({ where: { id: codeId } });
  if (!code) throw NotFoundError('AccessCode');

  if (code.status === 'REDEEMED') {
    throw BadRequestError('Cannot revoke an already redeemed code', 'CODE_ALREADY_REDEEMED');
  }

  return prisma.accessCode.update({
    where: { id: codeId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });
}

// ─── Regenerate access code (STAFF / ADMIN) ──────────────────────────────────

export async function regenerateAccessCode(codeId: string, actorId: string) {
  const oldCode = await prisma.accessCode.findUnique({ where: { id: codeId } });
  if (!oldCode) throw NotFoundError('AccessCode');

  if (oldCode.status === 'REDEEMED') {
    throw BadRequestError('Cannot regenerate an already redeemed code', 'CODE_ALREADY_REDEEMED');
  }

  // Revoke the old code
  await prisma.accessCode.update({
    where: { id: codeId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });

  // Generate a new code with the same parameters
  const plainCode = generateRandomCode();
  const codeHash = hashCode(plainCode);

  const newCode = await prisma.accessCode.create({
    data: {
      code: plainCode,
      codeHash,
      points: oldCode.points,
      expiresAt: oldCode.expiresAt,
      createdById: actorId,
      status: 'ACTIVE',
    },
  });

  return {
    id: newCode.id,
    code: plainCode,
    points: newCode.points,
    expiresAt: newCode.expiresAt,
    status: newCode.status,
  };
}

// ─── List access codes (STAFF / ADMIN) ───────────────────────────────────────

export async function listAccessCodes(filter?: { status?: AccessCodeStatus; createdById?: string }) {
  return prisma.accessCode.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.createdById ? { createdById: filter.createdById } : {}),
    },
    select: {
      id: true,
      code: true,
      points: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      redeemedAt: true,
      revokedAt: true,
      createdBy: {
        select: { id: true, username: true, role: true },
      },
      redeemedBy: {
        select: { id: true, username: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
