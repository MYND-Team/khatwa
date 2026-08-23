import { prisma } from '../../config/prisma';
import { NotFoundError, PaymentRequiredError } from '../../utils/errors';

// ─── Spend points to unlock a lesson ─────────────────────────────────────────

export async function spendPoints(studentId: string, lessonId: string) {
  return prisma.$transaction(async (tx: any) => {
    const lesson = await tx.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw NotFoundError('Lesson');

    // Idempotency: already unlocked?
    const existing = await tx.unlockedLesson.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
    });
    if (existing) return existing;

    const student = await tx.user.findUnique({ where: { id: studentId } });
    if (!student) throw NotFoundError('Student');

    // Deduct points atomically (guarantees balance never drops below zero under concurrency)
    const updatedUser = await tx.user.updateMany({
      where: {
        id: studentId,
        pointsBalance: { gte: lesson.pointCost },
      },
      data: {
        pointsBalance: { decrement: lesson.pointCost },
      },
    });

    if (updatedUser.count === 0) {
      throw PaymentRequiredError(
        `Insufficient points. Need ${lesson.pointCost}`
      );
    }

    // Audit log
    await tx.pointsTransaction.create({
      data: {
        studentId,
        type: 'DEBIT',
        amount: lesson.pointCost,
        reason: `Unlocked lesson: ${lesson.title}`,
        relatedLessonId: lessonId,
        actorId: studentId,
      },
    });

    // Unlock record
    return tx.unlockedLesson.create({ data: { studentId, lessonId } });
  });
}

// ─── Get balance ─────────────────────────────────────────────────────────────

export async function getBalance(studentId: string) {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: { pointsBalance: true },
  });
  if (!user) throw NotFoundError('Student');
  return { balance: user.pointsBalance };
}

// ─── Get transaction history ─────────────────────────────────────────────────

export async function getTransactionHistory(studentId: string) {
  return prisma.pointsTransaction.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
}
