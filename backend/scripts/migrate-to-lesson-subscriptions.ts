/**
 * Migration Script: Migrate Existing Course Enrollments & Unlocked Lessons to LessonSubscription
 * 
 * Non-destructive: preserves existing records while backfilling new models.
 * Run with: npx tsx scripts/migrate-to-lesson-subscriptions.ts
 */

import { prisma } from '../src/config/prisma';

async function migrateData() {
  console.log('🚀 Starting Data Migration to Lesson-Level Subscriptions & Teacher Workspaces...\n');

  // 1. Sync Lesson academic stages from parent Course
  console.log('1️⃣ Synchronizing Lesson academic stages...');
  const lessons = await prisma.lesson.findMany({
    include: { course: true },
  });

  let syncedLessons = 0;
  for (const lesson of lessons) {
    if (lesson.course?.academicStage && lesson.academicStage !== lesson.course.academicStage) {
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: { academicStage: lesson.course.academicStage },
      });
      syncedLessons++;
    }
  }
  console.log(`   ✅ Synchronized ${syncedLessons} lessons with their course academic stage.\n`);

  // 2. Populate Teacher Workspaces
  console.log('2️⃣ Populating TeacherStage workspaces...');
  const teachers = await prisma.teacherProfile.findMany({
    include: { courses: true, workspaces: true },
  });

  let workspacesCreated = 0;
  for (const teacher of teachers) {
    const stageSet = new Set<string>();

    if (teacher.academicStages) {
      teacher.academicStages.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => stageSet.add(s));
    }
    teacher.courses.forEach((c) => stageSet.add(c.academicStage));

    if (stageSet.size === 0) {
      stageSet.add('SECONDARY_1');
      stageSet.add('SECONDARY_2');
      stageSet.add('SECONDARY_3');
    }

    for (const stage of Array.from(stageSet)) {
      const exists = teacher.workspaces.some((w) => w.stage === stage);
      if (!exists) {
        try {
          await prisma.teacherStage.create({
            data: {
              teacherProfileId: teacher.id,
              stage: stage as any,
              isActive: true,
            },
          });
          workspacesCreated++;
        } catch (_) {}
      }
    }
  }
  console.log(`   ✅ Created ${workspacesCreated} teacher workspace stages.\n`);

  // 3. Backfill Unlocked Lessons into LessonSubscription
  console.log('3️⃣ Migrating UnlockedLesson records to LessonSubscription...');
  const unlockedLessons = await prisma.unlockedLesson.findMany({
    include: {
      lesson: {
        include: { course: true },
      },
    },
  });

  let unlockedMigrated = 0;
  for (const ul of unlockedLessons) {
    if (!ul.lesson) continue;

    const existingSub = await prisma.lessonSubscription.findUnique({
      where: { studentId_lessonId: { studentId: ul.studentId, lessonId: ul.lessonId } },
    });

    if (!existingSub) {
      await prisma.lessonSubscription.create({
        data: {
          studentId: ul.studentId,
          lessonId: ul.lessonId,
          courseId: ul.lesson.courseId,
          teacherProfileId: ul.lesson.teacherProfileId,
          academicStage: ul.lesson.academicStage || ul.lesson.course?.academicStage || 'SECONDARY_1',
          status: 'ACTIVE',
          paymentMethod: 'POINTS',
          pricePaid: 0.0,
          pointsPaid: ul.lesson.pointCost,
          subscribedAt: ul.unlockedAt || new Date(),
        },
      });
      unlockedMigrated++;
    }
  }
  console.log(`   ✅ Backfilled ${unlockedMigrated} unlocked lessons into subscriptions.\n`);

  // 4. Backfill Course Enrollments into LessonSubscription
  console.log('4️⃣ Migrating CourseEnrollment records to LessonSubscription...');
  const courseEnrollments = await prisma.courseEnrollment.findMany({
    include: {
      course: {
        include: {
          lessons: true,
        },
      },
    },
  });

  let courseLessonsMigrated = 0;
  for (const enrollment of courseEnrollments) {
    if (!enrollment.course?.lessons) continue;

    for (const lesson of enrollment.course.lessons) {
      const existingSub = await prisma.lessonSubscription.findUnique({
        where: { studentId_lessonId: { studentId: enrollment.studentId, lessonId: lesson.id } },
      });

      if (!existingSub) {
        await prisma.lessonSubscription.create({
          data: {
            studentId: enrollment.studentId,
            lessonId: lesson.id,
            courseId: enrollment.courseId,
            teacherProfileId: enrollment.course.teacherProfileId,
            academicStage: enrollment.course.academicStage,
            status: 'ACTIVE',
            paymentMethod: 'WALLET_EGP',
            pricePaid: lesson.price,
            pointsPaid: 0,
            subscribedAt: enrollment.enrolledAt || new Date(),
            expiresAt: enrollment.expiresAt,
          },
        });
        courseLessonsMigrated++;
      }
    }
  }
  console.log(`   ✅ Backfilled ${courseLessonsMigrated} course enrollment lessons into subscriptions.\n`);

  console.log('🎉 Migration completed successfully!');
}

migrateData()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
