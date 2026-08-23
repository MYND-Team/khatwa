import http from 'http';

function send(method: string, path: string, body?: any, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      { hostname: 'localhost', port: 3000, path, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 500, body: raw });
          }
        });
      }
    );

    req.on('error', (e) => resolve({ status: 500, body: { error: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runManualTesting() {
  console.log('===============================================================');
  console.log('📱 Khatwa Backend Manual Step-by-Step API Execution Log');
  console.log('===============================================================\n');

  // STEP 1: Check server health
  console.log('▶ STEP 1: Verify API Health Endpoint');
  console.log('  cURL: curl http://localhost:3000/health');
  const res1 = await send('GET', '/health');
  console.log(`  Status: ${res1.status}`);
  console.log(`  Response: ${JSON.stringify(res1.body, null, 2)}\n`);

  // STEP 2: Try registering a student with invalid payload (password mismatch)
  console.log('▶ STEP 2: Student Registration Validation (Mismatched Passwords)');
  console.log('  cURL: curl -X POST http://localhost:3000/auth/register/student ...');
  const res2 = await send('POST', '/auth/register/student', {
    username: 'youssef_student',
    password: 'Password123!',
    confirmPassword: 'WrongPassword!',
    studentPhoneNumber: '01012345678',
    parentInfo: {
      parentPhoneNumber: '01087654321',
      parentEmail: 'parent@example.com',
      fatherJob: 'Doctor',
      parentStatus: 'BOTH_ALIVE',
    },
  });
  console.log(`  Status: ${res2.status}`);
  console.log(`  Response: ${JSON.stringify(res2.body, null, 2)}\n`);

  // STEP 3: Attempt access to /student/profile without token
  console.log('▶ STEP 3: Attempt Student Profile Access Without Auth Token');
  console.log('  cURL: curl http://localhost:3000/student/profile');
  const res3 = await send('GET', '/student/profile');
  console.log(`  Status: ${res3.status}`);
  console.log(`  Response: ${JSON.stringify(res3.body, null, 2)}\n`);

  // STEP 4: Attempt access to /teacher/lessons without token
  console.log('▶ STEP 4: Attempt Teacher Lessons Access Without Auth Token');
  console.log('  cURL: curl http://localhost:3000/teacher/lessons');
  const res4 = await send('GET', '/teacher/lessons');
  console.log(`  Status: ${res4.status}`);
  console.log(`  Response: ${JSON.stringify(res4.body, null, 2)}\n`);

  // STEP 5: Attempt access to /admin/points/requests without token
  console.log('▶ STEP 5: Attempt Admin Points Queue Access Without Auth Token');
  console.log('  cURL: curl http://localhost:3000/admin/points/requests');
  const res5 = await send('GET', '/admin/points/requests');
  console.log(`  Status: ${res5.status}`);
  console.log(`  Response: ${JSON.stringify(res5.body, null, 2)}\n`);

  // STEP 6: Test non-existent route (404)
  console.log('▶ STEP 6: Call Non-Existent Route (404 Handler Check)');
  console.log('  cURL: curl http://localhost:3000/api/unknown-endpoint');
  const res6 = await send('GET', '/api/unknown-endpoint');
  console.log(`  Status: ${res6.status}`);
  console.log(`  Response: ${JSON.stringify(res6.body, null, 2)}\n`);

  console.log('===============================================================');
  console.log('✨ Manual Step-by-Step API Execution Finished Successfully.');
  console.log('===============================================================');
}

runManualTesting();
