import { prisma } from '../src/config/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('🌱 Seeding Khatwa database...');

  // ─── Platform settings ──────────────────────────────────────────────────────
  await prisma.platformSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      logoUrl: null,
      primaryColor: '#6C63FF',
      secondaryColor: '#FF6584',
      fontFamily: 'Inter',
    },
    update: {},
  });

  // ─── 3 Admin codes ──────────────────────────────────────────────────────────
  const adminCodes = ['ADM-SEED001', 'ADM-SEED002', 'ADM-SEED003'];
  for (const code of adminCodes) {
    await prisma.accessCode.upsert({
      where: { code },
      create: { code, type: 'ADMIN', isActive: true },
      update: {},
    });
  }
  console.log(`✅ Created 3 admin codes: ${adminCodes.join(', ')}`);

  // ─── 2 Editor codes ─────────────────────────────────────────────────────────
  const editorCodes = ['EDT-SEED001', 'EDT-SEED002'];
  for (const code of editorCodes) {
    await prisma.accessCode.upsert({
      where: { code },
      create: { code, type: 'EDITOR', isActive: true },
      update: {},
    });
  }
  console.log(`✅ Created 2 editor codes: ${editorCodes.join(', ')}`);

  // ─── 2 Teacher codes ────────────────────────────────────────────────────────
  const teacherCodes = ['TCH-SEED001', 'TCH-SEED002'];
  for (const code of teacherCodes) {
    await prisma.accessCode.upsert({
      where: { code },
      create: { code, type: 'TEACHER', isActive: true },
      update: {},
    });
  }
  console.log(`✅ Created 2 teacher codes: ${teacherCodes.join(', ')}`);

  // ─── Demo admin user ─────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@khatwa123', 12);
  const adminCode = await prisma.accessCode.findUnique({ where: { code: 'ADM-SEED001' } });

  const admin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    create: {
      username: 'superadmin',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
    update: {},
  });

  if (adminCode && !adminCode.usedById) {
    await prisma.accessCode.update({
      where: { code: 'ADM-SEED001' },
      data: { usedById: admin.id, isActive: false },
    });
  }

  console.log('✅ Demo admin user created: superadmin / Admin@khatwa123');

  // ─── Demo teacher ────────────────────────────────────────────────────────────
  const teacherPassword = await bcrypt.hash('Teacher@khatwa123', 12);
  const teacherCode = await prisma.accessCode.findUnique({ where: { code: 'TCH-SEED001' } });

  const teacher = await prisma.user.upsert({
    where: { username: 'demo_teacher' },
    create: {
      username: 'demo_teacher',
      passwordHash: teacherPassword,
      role: 'TEACHER',
      teacherProfile: {
        create: {
          displayName: 'Demo Teacher',
          bio: 'A demonstration teacher account',
        },
      },
    },
    update: {},
  });

  if (teacherCode && !teacherCode.usedById) {
    await prisma.accessCode.update({
      where: { code: 'TCH-SEED001' },
      data: { usedById: teacher.id, isActive: false },
    });
  }

  console.log('✅ Demo teacher created: demo_teacher / Teacher@khatwa123');

  // ─── 5 Assistant codes tied to demo teacher ───────────────────────────────────
  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: teacher.id },
  });

  if (teacherProfile) {
    const assistantCodes = [
      'AST-SEED001', 'AST-SEED002', 'AST-SEED003', 'AST-SEED004', 'AST-SEED005',
    ];
    for (const code of assistantCodes) {
      await prisma.accessCode.upsert({
        where: { code },
        create: { code, type: 'ASSISTANT', ownerTeacherId: teacher.id, isActive: true },
        update: {},
      });
    }
    console.log(`✅ Created 5 assistant codes for demo_teacher: ${assistantCodes.join(', ')}`);

    // ─── Demo lesson ──────────────────────────────────────────────────────────
    const lesson = await prisma.lesson.upsert({
      where: { id: 'lesson-seed-001' },
      create: {
        id: 'lesson-seed-001',
        teacherProfileId: teacherProfile.id,
        title: 'Introduction to Algebra',
        description: 'First lesson covering basic algebraic concepts.',
        pointCost: 10,
        orderIndex: 1,
        isPublished: true,
      },
      update: {},
    });

    // Demo opening quiz
    const quiz = await prisma.quiz.upsert({
      where: { id: 'quiz-seed-001' },
      create: {
        id: 'quiz-seed-001',
        title: 'Algebra Opening Quiz',
        type: 'OPENING_QUIZ',
        questions: {
          create: [
            {
              questionText: 'What is 2 + 2?',
              optionA: '3', optionB: '4', optionC: '5', optionD: '6',
              correctOption: 'B', orderIndex: 0,
            },
            {
              questionText: 'What is 5 × 3?',
              optionA: '12', optionB: '14', optionC: '15', optionD: '18',
              correctOption: 'C', orderIndex: 1,
            },
          ],
        },
      },
      update: {},
    });

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { openingQuizId: quiz.id },
    });

    console.log('✅ Demo lesson and opening quiz created');
  }

  // ─── Demo student ────────────────────────────────────────────────────────────
  const studentPassword = await bcrypt.hash('Student@khatwa123', 12);
  await prisma.user.upsert({
    where: { username: 'demo_student' },
    create: {
      username: 'demo_student',
      passwordHash: studentPassword,
      role: 'STUDENT',
      pointsBalance: 50,
      studentProfile: {
        create: {
          studentPhoneNumber: '+201234567890',
          parentInfo: {
            create: {
              parentPhoneNumber: '+201234567891',
              parentEmail: 'parent@example.com',
              fatherJob: 'Engineer',
              parentStatus: 'BOTH_ALIVE',
            },
          },
        },
      },
    },
    update: {},
  });

  console.log('✅ Demo student created: demo_student / Student@khatwa123 (50 points)');
  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Summary:');
  console.log('   Admin codes:     ADM-SEED001, ADM-SEED002, ADM-SEED003');
  console.log('   Editor codes:    EDT-SEED001, EDT-SEED002');
  console.log('   Teacher codes:   TCH-SEED001, TCH-SEED002');
  console.log('   Assistant codes: AST-SEED001 through AST-SEED005 (linked to demo_teacher)');
  console.log('\n   Demo users:');
  console.log('   superadmin   / Admin@khatwa123    (ADMIN)');
  console.log('   demo_teacher / Teacher@khatwa123  (TEACHER)');
  console.log('   demo_student / Student@khatwa123  (STUDENT, 50 points)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
