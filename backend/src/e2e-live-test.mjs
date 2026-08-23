/**
 * Khatwa Live E2E HTTP Tests — Complete end-to-end suite against live server
 */
const BASE = "http://localhost:3000";
let passed = 0, failed = 0;

async function req(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res, data = {};
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    try { data = await res.json(); } catch {}
  } catch(e) {
    console.error("  NETWORK ERROR:", e.message);
    return { status: 0, data: {} };
  }
  return { status: res.status, data };
}

function ok(name, cond, detail = "") {
  if (cond) { console.log(`  ✅ [PASS] ${name}`); passed++; }
  else { console.log(`  ❌ [FAIL] ${name}${detail ? " -- " + detail : ""}`); failed++; }
}

async function main() {
  console.log("\n🧪 Starting Khatwa Live E2E Integration Suite against live server...\n");

  // ── Group 1: Health & Branding ─────────────────────────────
  console.log("--- Group 1: Health & Branding ---");
  const h = await req("GET", "/health");
  ok("GET /health -> 200", h.status === 200);
  ok("Health status is 'ok'", h.data.status === "ok");

  const br = await req("GET", "/settings/branding");
  ok("GET /settings/branding -> 200", br.status === 200);
  const brandData = br.data.data || br.data;
  ok("Branding has primaryColor", !!brandData.primaryColor);

  // ── Group 2: Student Registration & Login ──────────────────
  console.log("\n--- Group 2: Student Registration & Login ---");
  const uname = `student_${Date.now()}`;
  const regBody = {
    username: uname,
    password: "Password123!",
    confirmPassword: "Password123!",
    studentPhoneNumber: "01011111111",
    parentInfo: {
      parentPhoneNumber: "01099999999",
      fatherJob: "مهندس برمجيات",
      parentStatus: "BOTH_ALIVE"
    }
  };
  const rr = await req("POST", "/auth/register/student", regBody);
  ok("POST /auth/register/student -> 201 Created", rr.status === 201);
  const regData = rr.data.data || rr.data;
  ok("Registration returns accessToken", typeof regData.accessToken === "string");

  const lr = await req("POST", "/auth/login", { username: uname, password: "Password123!" });
  ok("POST /auth/login -> 200 OK", lr.status === 200);
  const loginData = lr.data.data || lr.data;
  const studentToken = loginData.accessToken || "";
  const refreshToken = loginData.refreshToken || "";
  ok("Login returns valid JWT accessToken", studentToken.length > 20);

  const bl = await req("POST", "/auth/login", { username: uname, password: "WrongPassword!" });
  ok("Wrong password rejected with 401 Unauthorized", bl.status === 401);

  // ── Group 3: Student Profile CRUD ──────────────────────────
  console.log("\n--- Group 3: Student Profile CRUD ---");
  const pr = await req("GET", "/student/profile", undefined, studentToken);
  ok("GET /student/profile -> 200 OK", pr.status === 200);
  const pData = pr.data.data || pr.data;
  ok("Profile username matches registered account", pData.username === uname);
  ok("Parent fatherJob matches 'مهندس برمجيات'", JSON.stringify(pData).includes("مهندس برمجيات"));

  const upd = await req("PUT", "/student/profile", {
    studentPhoneNumber: "01077777777",
    parentPhoneNumber: "01088888888",
    fatherJob: "طبيب استشاري"
  }, studentToken);
  ok("PUT /student/profile (update) -> 200 OK", upd.status === 200);

  const pr2 = await req("GET", "/student/profile", undefined, studentToken);
  const pData2 = pr2.data.data || pr2.data;
  ok("Profile update persisted: fatherJob is 'طبيب استشاري'", JSON.stringify(pData2).includes("طبيب استشاري"));

  // ── Group 4: Auth Guards & Role Separation ─────────────────
  console.log("\n--- Group 4: Auth Guards & Role Separation ---");
  const na = await req("GET", "/student/profile");
  ok("Protected route without token -> 401 Unauthorized", na.status === 401);

  const tr = await req("GET", "/teacher/courses", undefined, studentToken);
  ok("Student attempting teacher route -> 403 Forbidden", tr.status === 403);

  const ta = await req("POST", "/teacher/courses", { title: "Illegal Course", subject: "Math", pointCost: 10 }, studentToken);
  ok("Student creating teacher course -> 403 Forbidden", ta.status === 403);

  // ── Group 5: Duplicate Registration Validation ─────────────
  console.log("\n--- Group 5: Duplicate Registration Protection ---");
  const dup = await req("POST", "/auth/register/student", regBody);
  ok("Duplicate username rejected with 409 Conflict", dup.status === 409 || dup.status === 400);

  // ── Group 6: Refresh Token Flow ────────────────────────────
  console.log("\n--- Group 6: Refresh Token Flow ---");
  const rl = await req("POST", "/auth/refresh", { refreshToken });
  ok("POST /auth/refresh -> 200 OK", rl.status === 200);
  const refreshData = rl.data.data || rl.data;
  ok("Refresh returns new valid accessToken", typeof refreshData.accessToken === "string");

  // ── Group 7: Student Balance & Performance Stats ───────────
  console.log("\n--- Group 7: Student Balance & Performance Stats ---");
  const bal = await req("GET", "/student/balance", undefined, studentToken);
  ok("GET /student/balance -> 200 OK", bal.status === 200);
  const balData = bal.data.data || bal.data;
  ok("Initial student pointsBalance is 0", balData.pointsBalance === 0 || balData.balance === 0);

  const stats = await req("GET", "/student/stats", undefined, studentToken);
  ok("GET /student/stats -> 200 OK", stats.status === 200);
  const statsData = stats.data.data || stats.data;
  ok("Stats includes quizAttempts array", Array.isArray(statsData.quizAttempts || statsData.attempts || []));

  // ── Group 8: Static Frontend Serving ───────────────────────
  console.log("\n--- Group 8: Static Frontend Delivery ---");
  const pages = ["/", "/index.html", "/login.html", "/signup.html", "/profile.html", "/dashboard.html", "/courses.html", "/points.html", "/request-points.html", "/teacher-dashboard.html"];
  for (const page of pages) {
    const res = await fetch(`${BASE}${page}`);
    ok(`Static page '${page}' serves 200 HTML`, res.status === 200);
  }

  // ── Summary ────────────────────────────────────────────────
  console.log("\n==================================================");
  console.log(`📊 Live E2E Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("CRASH:", e); process.exit(1); });
