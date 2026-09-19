import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.platformSettings.findFirst();
  console.log('PlatformSettings:', settings);
  const teachers = await prisma.teacherProfile.findMany({
    select: { id: true, userId: true, displayName: true, commissionPct: true }
  });
  console.log('Teachers in DB:', teachers);
  const txns = await prisma.paymentTransaction.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      transactionNumber: true,
      amount: true,
      teacherEarning: true,
      platformFee: true,
      paymentMethod: true,
      teacherProfile: { select: { displayName: true, commissionPct: true } }
    }
  });
  console.log('Recent Txns in DB:', txns);
}

main().catch(console.error).finally(() => prisma.$disconnect());
