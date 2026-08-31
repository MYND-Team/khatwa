import { prisma } from '../src/config/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function hashAccessCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

async function main() {
  console.log('🌱 Seeding Khatwa database...');

  // ─── Platform settings ──────────────────────────────────────────────────────
  await prisma.platformSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      logoUrl: 'logo/logo-khatwa.png',
      primaryColor: '#B88E4F',
      secondaryColor: '#8C6527',
      accentColor: '#CBA264',
      fontFamily: 'Cairo',
    },
    update: {
      logoUrl: 'logo/logo-khatwa.png',
      primaryColor: '#B88E4F',
      secondaryColor: '#8C6527',
      accentColor: '#CBA264',
      fontFamily: 'Cairo',
    },
  });
  console.log('✅ Platform settings initialized');

  // ─── Demo Recharge Point Codes (50 & 100 points) ────────────────────────────
  const sampleRechargeCodes = [
    { code: 'POINTS-50-DEMO1', points: 50 },
    { code: 'POINTS-50-DEMO2', points: 50 },
    { code: 'POINTS-100-DEMO1', points: 100 },
  ];

  for (const item of sampleRechargeCodes) {
    const codeHash = hashAccessCode(item.code);
    await prisma.accessCode.upsert({
      where: { codeHash },
      create: {
        codeHash,
        points: item.points,
        status: 'ACTIVE',
      },
      update: {},
    });
  }
  console.log('✅ Created sample recharge point codes: POINTS-50-DEMO1, POINTS-50-DEMO2, POINTS-100-DEMO1');

  // ─── Main Admin User ────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Samer-yasser159', 12);

  await prisma.user.upsert({
    where: { username: 'sameryasser-khatwa' },
    create: {
      username: 'sameryasser-khatwa',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
    update: {
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log('✅ Admin user created: sameryasser-khatwa / Samer-yasser159');

  // ─── Demo Teacher ───────────────────────────────────────────────────────────
  const teacherPassword = await bcrypt.hash('Teacher@khatwa123', 12);

  const teacher = await prisma.user.upsert({
    where: { username: 'demo_teacher' },
    create: {
      username: 'demo_teacher',
      passwordHash: teacherPassword,
      role: 'TEACHER',
      isActive: true,
      teacherProfile: {
        create: {
          displayName: 'أ/ محمد أحمد',
          bio: 'مدرس الرياضيات والفيزياء للمرحلة الثانوية',
        },
      },
    },
    update: {
      passwordHash: teacherPassword,
      role: 'TEACHER',
      isActive: true,
    },
  });
  console.log('✅ Demo teacher created: demo_teacher / Teacher@khatwa123');

  // ─── Demo Course & Lesson ───────────────────────────────────────────────────
  let teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: teacher.id },
  });

  if (!teacherProfile) {
    teacherProfile = await prisma.teacherProfile.create({
      data: {
        userId: teacher.id,
        displayName: 'أ/ محمد أحمد',
        bio: 'مدرس الرياضيات والفيزياء للمرحلة الثانوية',
      },
    });
  }

  const lesson = await prisma.lesson.upsert({
    where: { id: 'lesson-seed-001' },
    create: {
      id: 'lesson-seed-001',
      teacherProfileId: teacherProfile.id,
      title: 'مقدمة في الجبر والمصفوفات',
      description: 'المحاضرة الأولى: مفاهيم أساسية في الجبر والمصفوفات مع تمارين عملية.',
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
      title: 'امتحان تمهيدي: أساسيات الجبر',
      type: 'OPENING_QUIZ',
      questions: {
        create: [
          {
            questionText: 'ما هي قيمة x في المعادلة: 2x + 4 = 10؟',
            optionA: '2',
            optionB: '3',
            optionC: '4',
            optionD: '5',
            correctOption: 'B',
            orderIndex: 0,
          },
          {
            questionText: 'ما هو حاصل ضرب المصفوفة في مصفوفة الوحدة؟',
            optionA: 'المصفوفة الصفرية',
            optionB: 'المصفوفة المربعة',
            optionC: 'نفس المصفوفة',
            optionD: 'مصفوفة منقولة',
            correctOption: 'C',
            orderIndex: 1,
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

  // ─── Demo Student ───────────────────────────────────────────────────────────
  const studentPassword = await bcrypt.hash('Student@khatwa123', 12);
  await prisma.user.upsert({
    where: { username: 'demo_student' },
    create: {
      username: 'demo_student',
      passwordHash: studentPassword,
      role: 'STUDENT',
      pointsBalance: 50,
      isActive: true,
      studentProfile: {
        create: {
          studentPhoneNumber: '+201012345678',
          parentInfo: {
            create: {
              parentPhoneNumber: '+201087654321',
              parentEmail: 'parent@khatwa.app',
              fatherJob: 'مهندس',
              parentStatus: 'BOTH_ALIVE',
            },
          },
        },
      },
    },
    update: {
      passwordHash: studentPassword,
      role: 'STUDENT',
      isActive: true,
    },
  });

  console.log('✅ Demo student created: demo_student / Student@khatwa123 (50 points)');
  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Login Credentials:');
  console.log('   Admin:   sameryasser-khatwa / Samer-yasser159    (Role: ADMIN)');
  console.log('   Teacher: demo_teacher       / Teacher@khatwa123  (Role: TEACHER)');
  console.log('   Student: demo_student       / Student@khatwa123  (Role: STUDENT, 50 points)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
