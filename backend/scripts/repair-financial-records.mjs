import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.wdkpifcohsivvpgjiubl:zfz7TlcY75SKA17C@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔄 Checking historical payment transactions with 0 amount...');

  const zeroTxns = await prisma.paymentTransaction.findMany({
    where: {
      status: 'COMPLETED',
      amount: 0,
      pointsUsed: { gt: 0 },
    },
    include: {
      lesson: true,
      teacherProfile: {
        include: { user: true },
      },
    },
  });

  console.log(`Found ${zeroTxns.length} transactions needing repair.`);

  const platformSettings = await prisma.platformSettings.findFirst();
  const defaultComm = platformSettings?.defaultTeacherCommissionPct ?? 80.0;

  for (const txn of zeroTxns) {
    const points = txn.pointsUsed || 0;
    const lessonPrice = txn.lesson?.price || 0;
    const effectiveAmount = lessonPrice > 0 ? lessonPrice : points;

    const commPct = txn.teacherProfile?.commissionPct ?? defaultComm;
    const teacherEarning = Math.round(effectiveAmount * (commPct / 100) * 100) / 100;
    const platformFee = Math.round((effectiveAmount - teacherEarning) * 100) / 100;

    console.log(`Repairing Txn ${txn.transactionNumber}: amount=${effectiveAmount} EGP, teacher=${teacherEarning} EGP, fee=${platformFee} EGP (comm=${commPct}%)`);

    await prisma.paymentTransaction.update({
      where: { id: txn.id },
      data: {
        amount: effectiveAmount,
        teacherEarning,
        platformFee,
      },
    });

    const teacherUserId = txn.teacherProfile?.userId;
    if (teacherUserId && teacherEarning > 0) {
      const teacherUser = await prisma.user.findUnique({
        where: { id: teacherUserId },
        select: { walletBalance: true },
      });

      const currentBalance = teacherUser?.walletBalance || 0;
      const newBalance = Math.round((currentBalance + teacherEarning) * 100) / 100;

      await prisma.user.update({
        where: { id: teacherUserId },
        data: { walletBalance: newBalance },
      });

      await prisma.walletTransaction.create({
        data: {
          studentId: teacherUserId,
          type: 'CREDIT',
          amount: teacherEarning,
          balanceAfter: newBalance,
          reason: `تسوية أرباح بأثر رجعي: ${txn.lesson?.title || 'محاضرة'} (معاملة ${txn.transactionNumber})`,
          actorId: txn.studentId,
        },
      });

      console.log(`  -> Credited teacher user ${teacherUserId}: +${teacherEarning} EGP (New balance: ${newBalance} EGP)`);
    }
  }

  // Summary aggregation check
  const sumAgg = await prisma.paymentTransaction.aggregate({
    where: { status: 'COMPLETED' },
    _sum: { amount: true, teacherEarning: true, platformFee: true, pointsUsed: true },
  });

  console.log('✅ All transactions repaired! New database sums:');
  console.log({
    totalAmountEGP: sumAgg._sum.amount,
    totalTeacherEarnings: sumAgg._sum.teacherEarning,
    totalPlatformFees: sumAgg._sum.platformFee,
    totalPointsUsed: sumAgg._sum.pointsUsed,
  });
}

try {
  await main();
} catch (e) {
  console.error('❌ Error repairing financial records:', e);
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
