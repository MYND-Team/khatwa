import 'dotenv/config';
import { prisma } from './src/config/prisma.js';

const lessons = await prisma.lesson.findMany({
  where: { title: { contains: 'Drive Test' } },
  select: { id: true, title: true, videoUrl: true, driveFileId: true, isPublished: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
  take: 5
});
console.log('Lessons matching "Drive Test":', JSON.stringify(lessons, null, 2));

const latest = await prisma.lesson.findMany({
  select: { id: true, title: true, videoUrl: true, driveFileId: true, isPublished: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
  take: 5
});
console.log('\nLatest 5 lessons:', JSON.stringify(latest, null, 2));

await prisma.$disconnect();
