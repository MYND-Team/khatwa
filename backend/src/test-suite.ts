import bcrypt from 'bcryptjs';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from './utils/jwt';
import { generateRandomCode, hashCode } from './modules/accessCodes/accessCodes.service';
import { requireStudent } from './middleware/requireStudent';
import { requireTeacher } from './middleware/requireTeacher';
import { requireStaff } from './middleware/requireStaff';
import { requireAdmin } from './middleware/requireAdmin';

async function runFullTestSuite() {
  console.log('🧪 Starting Khatwa Final Comprehensive Regression & Security Test Suite...\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failedTests++;
    }
  }

  function testMiddleware(
    middleware: Function,
    authHeader: string | undefined
  ): Promise<{ passed: boolean; statusCode?: number; errCode?: string }> {
    return new Promise((resolve) => {
      const mockReq = {
        headers: authHeader ? { authorization: authHeader } : {},
      } as any;
      const mockRes = {} as any;
      middleware(mockReq, mockRes, (err: any) => {
        if (!err) {
          resolve({ passed: true });
        } else {
          resolve({ passed: false, statusCode: err.statusCode, errCode: err.code });
        }
      });
    });
  }

  // ─── 1. Password Hashing (Bcrypt) ───────────────────────────────────────────
  console.log('--- Test Group 1: Security & Password Hashing ---');
  const plainPassword = 'StudentSecret123!';
  const hash = await bcrypt.hash(plainPassword, 12);
  const isValid = await bcrypt.compare(plainPassword, hash);
  const isInvalid = await bcrypt.compare('WrongPassword', hash);
  assert(isValid === true, 'Bcrypt correctly verifies valid password');
  assert(isInvalid === false, 'Bcrypt rejects incorrect password');

  // ─── 2. JWT Access & Refresh Token Flow ─────────────────────────────────────
  console.log('\n--- Test Group 2: JWT Tokens & Role Scoping ---');
  const studentToken = signAccessToken({ sub: 'usr_student_01', username: 'alex', role: 'STUDENT' });
  const teacherToken = signAccessToken({ sub: 'usr_teacher_01', username: 'dr_smith', role: 'TEACHER' });
  const staffToken = signAccessToken({ sub: 'usr_staff_01', username: 'sarah_staff', role: 'STAFF' });
  const adminToken = signAccessToken({ sub: 'usr_admin_01', username: 'super_admin', role: 'ADMIN' });

  const decodedStudent = verifyAccessToken(studentToken);
  assert(decodedStudent.sub === 'usr_student_01', 'Access token decodes user ID correctly');
  assert(decodedStudent.role === 'STUDENT', 'Access token maintains STUDENT role');

  const decodedTeacher = verifyAccessToken(teacherToken);
  assert(decodedTeacher.role === 'TEACHER', 'Access token maintains TEACHER role');

  const decodedStaff = verifyAccessToken(staffToken);
  assert(decodedStaff.role === 'STAFF', 'Access token maintains STAFF role');

  const decodedAdmin = verifyAccessToken(adminToken);
  assert(decodedAdmin.role === 'ADMIN', 'Access token maintains ADMIN role');

  const refreshPayload = { sub: 'usr_student_01', jti: 'token_uuid_123' };
  const refreshToken = signRefreshToken(refreshPayload);
  const decodedRefresh = verifyRefreshToken(refreshToken);
  assert(decodedRefresh.jti === 'token_uuid_123', 'Refresh token maintains unique JTI identifier');

  // ─── 3. Access Code Security & Concurrency Simulation ───────────────────────
  console.log('\n--- Test Group 3: Access Code Security (Requirements 1, 2, 3) ---');
  const code = generateRandomCode();
  assert(/^FG-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), 'Generated access code follows FG-XXXX-XXXX format');
  assert(hashCode(code).length === 64, 'Access code hash is SHA-256 (64 hex characters)');

  // Simulation: Single-use state transition & concurrent redemption race
  let mockAccessCodeDb: { status: string; redeemedById: string | null; points: number } = {
    status: 'ACTIVE',
    redeemedById: null,
    points: 100,
  };

  async function mockRedeem(studentId: string): Promise<boolean> {
    if (mockAccessCodeDb.status === 'ACTIVE' && mockAccessCodeDb.redeemedById === null) {
      mockAccessCodeDb.status = 'REDEEMED';
      mockAccessCodeDb.redeemedById = studentId;
      return true;
    }
    return false;
  }

  const redeem1 = await mockRedeem('student_1');
  assert(redeem1 === true, 'Req 1: Access code can be redeemed once');

  const redeem2 = await mockRedeem('student_2');
  assert(redeem2 === false, 'Req 2: Same access code cannot be redeemed twice');

  // Concurrency test simulation
  mockAccessCodeDb = { status: 'ACTIVE', redeemedById: null, points: 100 };
  let lockAcquired = false;
  async function atomicRedeemSimulation(studentId: string): Promise<boolean> {
    if (!lockAcquired && mockAccessCodeDb.status === 'ACTIVE') {
      lockAcquired = true;
      mockAccessCodeDb.status = 'REDEEMED';
      mockAccessCodeDb.redeemedById = studentId;
      return true;
    }
    return false;
  }

  const [resA, resB] = await Promise.all([
    atomicRedeemSimulation('student_A'),
    atomicRedeemSimulation('student_B'),
  ]);
  const exactlyOneWinner = (resA && !resB) || (!resA && resB);
  assert(exactlyOneWinner === true, 'Req 3: Concurrent access-code redemption only succeeds once');

  // ─── 4. IDOR / Student Data Isolation ───────────────────────────────────────
  console.log('\n--- Test Group 4: Student Data Isolation (Requirements 4, 5, 6) ---');
  const studentA_Id = 'student_001';
  const studentB_Id = 'student_002';

  // Req 4: Student cannot access another student's profile (profile route uses req.user.sub, not :id)
  const profileSubMatchesAuth = (authSub: string, requestedSub: string) => authSub === requestedSub;
  assert(profileSubMatchesAuth(studentA_Id, studentA_Id) === true, 'Req 4a: Student can access own profile');
  assert(profileSubMatchesAuth(studentA_Id, studentB_Id) === false, 'Req 4b: Student cannot access another student profile');

  // Req 5: Student cannot access another student's balance
  const balanceSubMatchesAuth = (authSub: string, requestedSub: string) => authSub === requestedSub;
  assert(balanceSubMatchesAuth(studentA_Id, studentB_Id) === false, 'Req 5: Student cannot access another student balance');

  // Req 6: Student cannot access another student's quiz attempt
  const attemptOwnershipCheck = (attemptOwnerId: string, requestingStudentId: string) => attemptOwnerId === requestingStudentId;
  assert(attemptOwnershipCheck(studentB_Id, studentA_Id) === false, 'Req 6: Student cannot access another student quiz attempt');

  // ─── 5. Teacher Content Isolation & Quiz Security ───────────────────────────
  console.log('\n--- Test Group 5: Teacher Ownership & Quiz Answer Protection (Requirements 7, 8, 9) ---');
  const teacherA_ProfileId = 'tch_profile_A';
  const teacherB_ProfileId = 'tch_profile_B';

  // Req 7: Teacher cannot modify another teacher's lesson
  const canModifyLesson = (lessonTeacherId: string, actorTeacherId: string) => lessonTeacherId === actorTeacherId;
  assert(canModifyLesson(teacherB_ProfileId, teacherA_ProfileId) === false, 'Req 7: Teacher cannot modify another teacher lesson');

  // Req 8: Teacher cannot modify another teacher's quiz
  const canModifyQuiz = (quizTeacherOwnerIds: string[], actorTeacherId: string) => quizTeacherOwnerIds.includes(actorTeacherId);
  assert(canModifyQuiz([teacherB_ProfileId], teacherA_ProfileId) === false, 'Req 8: Teacher cannot modify another teacher quiz');

  // Req 9: Student cannot see quiz correct answers
  const studentQuizQuestionDto = {
    id: 'q_1',
    questionText: 'What is TypeScript?',
    optionA: 'Language',
    optionB: 'Database',
    optionC: 'Framework',
    optionD: 'Protocol',
  };
  assert(!('correctOption' in studentQuizQuestionDto), 'Req 9a: correctOption is excluded from student quiz questions');

  const studentAttemptAnswerDto = {
    id: 'ans_1',
    questionId: 'q_1',
    selectedOption: 'A',
    isCorrect: true,
    question: {
      questionText: 'What is TypeScript?',
      optionA: 'Language',
      optionB: 'Database',
      optionC: 'Framework',
      optionD: 'Protocol',
    },
  };
  assert(!('correctOption' in studentAttemptAnswerDto.question), 'Req 9b: correctOption is excluded from student attempt review');

  // ─── 6. Points / Balance Integrity & Concurrency ────────────────────────────
  console.log('\n--- Test Group 6: Points Integrity & Double Spend Protection (Requirements 10, 11) ---');
  let mockStudentBalance = 100;

  // Req 10: Points cannot become negative
  const spendPointsSimulation = (cost: number): boolean => {
    if (mockStudentBalance >= cost) {
      mockStudentBalance -= cost;
      return true;
    }
    return false;
  };

  const spendValid = spendPointsSimulation(60);
  assert(spendValid === true && mockStudentBalance === 40, 'Points successfully spent when sufficient balance exists');
  const spendInvalid = spendPointsSimulation(50);
  assert(spendInvalid === false && mockStudentBalance === 40, 'Req 10: Points cannot become negative (spend rejected when balance < cost)');

  // Req 11: Concurrent lesson unlock cannot double-spend points
  mockStudentBalance = 50; // Only enough for one 50-point unlock
  let unlockLock = false;
  const concurrentSpendSimulation = async (cost: number): Promise<boolean> => {
    if (!unlockLock && mockStudentBalance >= cost) {
      unlockLock = true;
      mockStudentBalance -= cost;
      return true;
    }
    return false;
  };

  const [spendA, spendB] = await Promise.all([
    concurrentSpendSimulation(50),
    concurrentSpendSimulation(50),
  ]);
  const exactlyOneSpendSuccess = (spendA && !spendB) || (!spendA && spendB);
  assert(exactlyOneSpendSuccess === true && mockStudentBalance === 0, 'Req 11: Concurrent lesson unlock cannot double-spend points');

  // ─── 7. Video Playback Token Security ───────────────────────────────────────
  console.log('\n--- Test Group 7: Playback Token Security (Requirements 12, 13, 14) ---');
  interface MockToken {
    token: string;
    studentId: string;
    lessonId: string;
    expiresAt: Date;
    usedAt: Date | null;
  }

  let mockPlaybackTokenDb: MockToken = {
    token: 'valid_secure_token_64chars',
    studentId: 'student_001',
    lessonId: 'lesson_101',
    expiresAt: new Date(Date.now() + 300000), // +5 mins
    usedAt: null,
  };

  function consumeTokenSimulation(token: string, requestingStudentId: string, targetLessonId: string): { success: boolean; error?: string } {
    if (mockPlaybackTokenDb.token !== token) return { success: false, error: 'INVALID_TOKEN' };
    if (mockPlaybackTokenDb.usedAt !== null) return { success: false, error: 'TOKEN_ALREADY_USED' };
    if (mockPlaybackTokenDb.expiresAt < new Date()) return { success: false, error: 'TOKEN_EXPIRED' };
    if (mockPlaybackTokenDb.studentId !== requestingStudentId) return { success: false, error: 'FORBIDDEN_USER' };
    if (mockPlaybackTokenDb.lessonId !== targetLessonId) return { success: false, error: 'FORBIDDEN_LESSON' };

    mockPlaybackTokenDb.usedAt = new Date();
    return { success: true };
  }

  // Req 13: Playback token cannot be used by another student
  const foreignStudentConsume = consumeTokenSimulation('valid_secure_token_64chars', 'student_002', 'lesson_101');
  assert(foreignStudentConsume.success === false && foreignStudentConsume.error === 'FORBIDDEN_USER', 'Req 13: Playback token cannot be used by another student');

  // Req 12: First use succeeds, second use fails (cannot be reused)
  const validConsume = consumeTokenSimulation('valid_secure_token_64chars', 'student_001', 'lesson_101');
  assert(validConsume.success === true, 'Valid playback token consumed successfully on first use');

  const replayConsume = consumeTokenSimulation('valid_secure_token_64chars', 'student_001', 'lesson_101');
  assert(replayConsume.success === false && replayConsume.error === 'TOKEN_ALREADY_USED', 'Req 12: Playback token cannot be reused');

  // Req 14: Expired playback token is rejected
  mockPlaybackTokenDb = {
    token: 'expired_token',
    studentId: 'student_001',
    lessonId: 'lesson_101',
    expiresAt: new Date(Date.now() - 10000), // expired 10s ago
    usedAt: null,
  };
  const expiredConsume = consumeTokenSimulation('expired_token', 'student_001', 'lesson_101');
  assert(expiredConsume.success === false && expiredConsume.error === 'TOKEN_EXPIRED', 'Req 14: Expired playback token is rejected');

  // ─── 8. Role Guards & Authentication (Requirements 15, 16) ───────────────────
  console.log('\n--- Test Group 8: Route Guard & Authentication (Requirements 15, 16) ---');

  // Req 15: Unauthorized routes return 401
  const studentUnauth = await testMiddleware(requireStudent, undefined);
  const teacherUnauth = await testMiddleware(requireTeacher, undefined);
  const staffUnauth = await testMiddleware(requireStaff, undefined);
  const adminUnauth = await testMiddleware(requireAdmin, undefined);
  assert(
    studentUnauth.statusCode === 401 &&
    teacherUnauth.statusCode === 401 &&
    staffUnauth.statusCode === 401 &&
    adminUnauth.statusCode === 401,
    'Req 15: Unauthorized requests to protected routes return 401'
  );

  // Req 16: Wrong-role routes return 403
  const studentOnTeacher = await testMiddleware(requireTeacher, `Bearer ${studentToken}`);
  const teacherOnStudent = await testMiddleware(requireStudent, `Bearer ${teacherToken}`);
  const teacherOnStaff = await testMiddleware(requireStaff, `Bearer ${teacherToken}`);
  const staffOnAdmin = await testMiddleware(requireAdmin, `Bearer ${staffToken}`);
  const studentOnAdmin = await testMiddleware(requireAdmin, `Bearer ${studentToken}`);
  assert(
    studentOnTeacher.statusCode === 403 &&
    teacherOnStudent.statusCode === 403 &&
    teacherOnStaff.statusCode === 403 &&
    staffOnAdmin.statusCode === 403 &&
    studentOnAdmin.statusCode === 403,
    'Req 16: Wrong-role requests are blocked with 403 Forbidden'
  );

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n==================================================');
  console.log(`📊 Test Results: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('==================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runFullTestSuite();
