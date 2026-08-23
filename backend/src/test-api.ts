import http from 'http';

function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          let parsed: any;
          try {
            parsed = JSON.parse(responseData);
          } catch {
            parsed = responseData;
          }
          resolve({ status: res.statusCode || 500, data: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Khatwa API Endpoint Automated Tests...\n');

  // Test 1: Health
  try {
    const health = await makeRequest('GET', '/health');
    console.log('1. GET /health -> Status:', health.status, 'Response:', health.data);
  } catch (err: any) {
    console.error('1. GET /health FAILED:', err.message);
  }

  // Test 2: Invalid route (404 check)
  try {
    const notFound = await makeRequest('GET', '/invalid-route-xyz');
    console.log('2. GET /invalid-route-xyz -> Status:', notFound.status, 'Response:', notFound.data);
  } catch (err: any) {
    console.error('2. GET /invalid-route-xyz FAILED:', err.message);
  }

  // Test 3: Public Branding
  try {
    const branding = await makeRequest('GET', '/settings/branding');
    console.log('3. GET /settings/branding -> Status:', branding.status, 'Response:', branding.data);
  } catch (err: any) {
    console.error('3. GET /settings/branding FAILED:', err.message);
  }

  // Test 4: Student registration validation error (password mismatch)
  try {
    const invalidReg = await makeRequest('POST', '/auth/register/student', {
      username: 'test_student',
      password: 'password123',
      confirmPassword: 'different_password',
      studentPhoneNumber: '01234567890',
      parentInfo: {
        parentPhoneNumber: '01234567891',
        fatherJob: 'Engineer',
        parentStatus: 'BOTH_ALIVE',
      },
    });
    console.log('4. POST /auth/register/student (mismatch pass) -> Status:', invalidReg.status, 'Response:', invalidReg.data);
  } catch (err: any) {
    console.error('4. POST /auth/register/student FAILED:', err.message);
  }

  // Test 5: Unauthorized access to /student/profile
  try {
    const unauth = await makeRequest('GET', '/student/profile');
    console.log('5. GET /student/profile (without token) -> Status:', unauth.status, 'Response:', unauth.data);
  } catch (err: any) {
    console.error('5. GET /student/profile FAILED:', err.message);
  }

  // Test 6: Invalid token access
  try {
    const invalidToken = await makeRequest('GET', '/student/profile', undefined, {
      Authorization: 'Bearer invalid_token_here',
    });
    console.log('6. GET /student/profile (invalid token) -> Status:', invalidToken.status, 'Response:', invalidToken.data);
  } catch (err: any) {
    console.error('6. GET /student/profile FAILED:', err.message);
  }

  console.log('\n✅ Automated tests completed.');
}

runTests();
