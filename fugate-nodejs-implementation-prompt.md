# FuGate Platform — Node.js Implementation Prompt

> استخدم هذا الملف كـ prompt كامل لتغذية أداة برمجة (مثل Claude Code) لبناء المنصة. يفترض هذا الـ prompt الـ stack التالي، وممكن تغيّره حسب احتياجك:
> **Backend:** Node.js + Express.js + TypeScript
> **Database:** PostgreSQL + Prisma ORM (بديل: MongoDB + Mongoose لو تفضل NoSQL)
> **Auth:** JWT (access + refresh tokens)
> **Realtime/Notifications:** WhatsApp Business API أو Twilio للرسائل لولي الأمر
> **File/Video storage:** AWS S3 أو Cloudflare R2 + signed URLs
> **Video streaming:** HLS مع token-based access (لمنع التنزيل المباشر)

---

## PROMPT (انسخه كامل لأداة البرمجة)

```
You are building a backend + admin-facing system in Node.js (TypeScript) for an
educational platform called "FuGate". Implement the following modules end-to-end,
with a clean layered architecture (routes → controllers → services → repositories),
input validation (zod or joi), centralized error handling, and role-based access
control (RBAC). Use PostgreSQL with Prisma as the ORM. Write the Prisma schema first,
then the REST API, then the business logic for each module below.

## 1. User Roles & Access Codes
Roles: STUDENT, PARENT (linked to student, notification-only), TEACHER (called
"المدير" for their own scope), ASSISTANT (linked to one teacher), ADMIN (Security
codes — full access), EDITOR (technical access, scoped — no financial/admin rights).

Access code system:
- Each TEACHER has one unique teacher code + 5 auto-generated assistant codes tied
  to that teacher (assistants who register with one of these codes are automatically
  scoped to that teacher's students/data only).
- 3 ADMIN codes exist platform-wide, each grants full privileges.
- 1+ EDITOR code(s): grants access to content/UI editing endpoints only, not to
  financial data, points approvals, or user management.
- Codes must be single-use-per-slot or revocable/regeneratable by an ADMIN.
- Build a `AccessCode` table: { code, type, ownerTeacherId (nullable), usedBy,
  isActive, createdAt, revokedAt }.

## 2. Auth & Registration
- Login: username + password (bcrypt hashed, JWT access + refresh token flow).
- Registration (student) requires: username, password, confirmPassword (validate
  match server-side), studentPhoneNumber, and a nested "parentInfo" object:
  { parentPhoneNumber, fatherJob, parentStatus }.
  - `parentStatus` is a dropdown/select field, one of: BOTH_ALIVE, FATHER_DECEASED,
    MOTHER_DECEASED, BOTH_DECEASED. It lives inside parentInfo (grouped with the
    other parent/guardian fields), not as a standalone top-level field.
  - Treat `parentStatus` as sensitive personal data: exclude it from any public/
    general-purpose API response (e.g. student list views, dashboards, exports used
    by assistants), never log it, and only return it on endpoints explicitly scoped
    to ADMIN or the student's own TEACHER (e.g. GET /admin/students/:id/full-profile).
    Use a Prisma `select`/DTO mapping at the service layer so it's opt-in per
    endpoint rather than something that leaks by default.
- On registration, require or optionally attach an access code if registering as
  TEACHER/ASSISTANT/EDITOR/ADMIN (not required for STUDENT).

## 3. Points (Virtual Currency) & Wallet System
DECISION: Points are a single, unified, platform-wide currency. There is no
per-teacher point system — one point balance per student, spendable on any
teacher's lessons (each lesson has its own point-cost, set by that teacher/admin).

Flow:
1. Student registers, then on the "Buy Points" screen picks a payment method:
   INSTAPAY or WALLET (both are external, outside the app — just a choice of
   which external account/number to transfer to; the platform does not process
   real payments itself).
2. Platform shows the relevant transfer details (InstaPay handle or wallet
   number) for the chosen method, and the student enters the amount + how many
   points they're requesting.
3. Student transfers the money externally, then uploads a screenshot of the
   transfer as proof: POST /points/requests
   { studentId, paymentMethod: INSTAPAY | WALLET, amountPaid, pointsRequested,
     transferScreenshotUrl, status: PENDING }.
4. ADMIN (only — not teachers, see access separation in module 8) reviews the
   screenshot in a queue: GET /admin/points/requests?status=PENDING, and either:
   - PATCH /admin/points/requests/:id/approve { pointsGranted } → credits the
     student's balance in an atomic DB transaction and marks status APPROVED.
   - PATCH /admin/points/requests/:id/reject { reason } → marks REJECTED, no
     balance change, reason stored and surfaced to the student.
5. Student spends points to "attend"/unlock lessons: POST /lessons/:id/unlock
   deducts the lesson's point-cost from the student's balance (reject with 402
   if insufficient).
6. GET /students/:id/balance returns current points.
7. Full immutable audit log table (`PointsTransaction`) for every credit/debit:
   { studentId, type: CREDIT|DEBIT, amount, reason, relatedRequestId?,
     relatedLessonId?, actorId, createdAt }.

Note: since payment itself happens outside the platform, there is no payment
gateway integration to build — only the request/upload/review/approve workflow
above.

## 4. Lesson Flow & Gating Logic
Enforce this strict sequence server-side (not just UI):
1. Student must pass a short "opening quiz" (امتحان بداية الحصة) before lesson
   content becomes accessible.
2. Student must submit the homework (واجب) for the PREVIOUS lesson (MCQ format:
   options A/B/C/D, same engine as exams) before the lesson opens.
3. Only after both conditions are met does `GET /lessons/:id/content` return the
   actual video/content; otherwise return 403 with a clear reason code
   (QUIZ_NOT_PASSED | HOMEWORK_NOT_SUBMITTED | INSUFFICIENT_POINTS).
- Model: Lesson, Quiz, QuizQuestion, QuizAttempt, Homework, HomeworkSubmission —
  each MCQ question has 4 options and one correct answer, auto-graded.

## 5. Exams/Quiz Engine (shared by opening quizzes & homework)
- Generic reusable engine: create quiz → add MCQ questions → student attempts →
  auto-grade → store score + timestamp.
- On quiz completion, trigger the parent notification job (see module 6).

## 6. Parent Notifications (SMS + Email + Push — no WhatsApp)
- Immediately after a student finishes a lesson's exam, notify the parent through
  THREE channels, each fired independently so a failure in one doesn't block the
  others:
  1. **SMS** — via an SMS gateway API (e.g. Twilio SMS, Vonage, or a local
     Egyptian SMS provider) sent to `parentPhoneNumber`.
  2. **Email** — via a transactional email provider (e.g. SendGrid, Resend, or
     SMTP) sent to a `parentEmail` field (add this to parentInfo if not already
     present at registration, or make it optional and skip email if absent).
  3. **Push Notification** — via Firebase Cloud Messaging (FCM) or OneSignal to
     the parent's registered device token (requires a lightweight
     "parent companion" mobile/web view where the parent logs in with the
     student's linked account to register their device token).
- Message content (same across channels): student name, teacher name, lesson
  name, score obtained.
- Abstract all three behind a `NotificationProvider` interface (sendSms,
  sendEmail, sendPush) so each provider is swappable independently.
- Queue as async jobs (e.g., BullMQ + Redis) so exam submission isn't blocked,
  with per-channel retry-on-failure and a `NotificationLog` table recording
  channel, status (SENT/FAILED), and timestamp for auditing/debugging.

## 7. Lecture Upload & Video Storage (Google Drive)
- TEACHER uploads their own lecture videos; storage backend is Google Drive
  (Google Drive API v3), not S3/R2.
- Use a single service Google account (or a Google Workspace shared drive) that
  the platform's backend controls via OAuth2 service-account credentials — the
  teacher uploads through the platform's UI (POST /lessons/:id/video, multipart
  upload), and the backend streams the file to Google Drive under a per-teacher
  folder, then stores the returned Drive `fileId` on the Lesson record (not a
  public link).
- Do NOT expose the raw Google Drive share link to students. Instead:
  - Set the uploaded file's Drive permissions to fully private (no "anyone with
    the link").
  - When a student who has passed the lesson-gating checks (module 4) requests
    playback, the backend uses the Drive API to fetch the file as a stream
    (`drive.files.get({ fileId, alt: 'media' })`) and proxies it to the client
    through the platform's own video endpoint, so the Drive file itself is
    never directly reachable by the browser.
  - Generate a short-lived, single-use playback token per request
    (GET /lessons/:id/stream?token=...) so links can't be shared or reused
    after expiry.
- Document this limitation clearly for the client: proxying through Drive avoids
  exposing a direct download link, but — like any web video — a determined user
  can still screen-record playback; no purely client-side or Drive-based
  solution prevents that 100%. Disabling right-click/download UI hooks on the
  player is a deterrent, not a guarantee.
- Log every video access (studentId, lessonId, timestamp, IP) for auditing.
- Watch Google Drive API quotas/rate limits at scale (proxying every view
  through Drive means every playback consumes Drive API + bandwidth quota) —
  flag this to the client as a scaling consideration for later.

## 8. Access Separation — Students / Admins / Teachers (each fully isolated)
Build this as three clearly separate route groups + middleware guards, not one
shared route set with role checks sprinkled in — each group should have its own
router file so the isolation is obvious in the codebase.

- **`/student/*`** — STUDENT only.
  - View own profile, points balance, purchase requests, lesson list, take
    quizzes/homework, watch unlocked lessons, view own grades/history.
  - Cannot see other students' data, cannot see teacher financials, cannot see
    parentStatus field even on their own profile response (strip it in the DTO).

- **`/admin/*`** — ADMIN (Security codes) only.
  - Full platform control: approve/reject points requests, manage access codes
    (generate/revoke teacher, assistant, editor, admin codes), manage
    branding/settings, view any student's full profile (including sensitive
    parentInfo fields), view platform-wide analytics, manage teacher accounts.
  - EDITOR code holders get a narrow slice of this group only (branding/content
    endpoints) — implement as a separate `requireEditor` middleware that does
    NOT inherit full admin rights, even though it lives under similar routes.

- **`/teacher/*`** — TEACHER (+ their linked ASSISTANTs, scoped) only.
  - Upload/manage own lectures (module 7), create quizzes/homework for own
    lessons, view performance dashboards for own students only
    (GET /teacher/students/:id/performance → aggregated quiz scores, homework
    completion %, lesson progress timeline), manage own assistant sub-codes.
  - ASSISTANT accounts (registered with one of the teacher's 5 sub-codes)
    get the same `/teacher/*` group but read-only by default (view dashboards,
    grades) — no access to points approval (that's admin-only) and no access to
    other teachers' data. Add a `canEdit` flag per assistant if a teacher wants
    to grant write access later.
  - Teachers never see points-request screenshots or approve/reject points —
    that stays exclusively in `/admin/*` per the module 3 flow.

Implement as three Express routers mounted separately, each behind its own auth
middleware (`requireStudent`, `requireAdmin`, `requireTeacherOrAssistant`), so a
token issued for one role is structurally rejected by the other two routers
rather than relying on a single shared permission check.

## 9. Branding / Theming
- Store platform-wide settings in a `PlatformSettings` table: logoUrl, primaryColor,
  secondaryColor, fontFamily — editable only via EDITOR/ADMIN codes, served via a
  public GET /settings/branding endpoint for the frontend to consume.

## 10. Non-functional requirements
- All money/points-related endpoints must be idempotent and wrapped in DB
  transactions.
- Rate-limit auth endpoints.
- Full RBAC middleware — every route explicitly declares which roles can access it.
- Environment-based config (dotenv), no secrets in code.
- Write Prisma schema, then seed script with sample teacher/admin/editor codes,
  then implement modules in this order: Auth & Access Codes → Points/Wallet →
  Quiz Engine → Lesson Gating → Notifications → Dashboard → Branding → Video security.

Deliver: Prisma schema file, folder structure, and working Express routes/controllers/
services for each module above, with request validation and error handling.
```

---

## ملاحظات مهمة قبل التنفيذ (خارج الـ prompt)

- **حماية الفيديو 100% غير ممكنة تقنيًا** — سواء عبر Google Drive أو أي حل تاني، منع تصوير الشاشة بالكامل مستحيل من طرف الفرونت إند وحده. البروكسي عبر Drive (بدل ما يبان لينك مباشر) بيقلل مخاطرة النسخ/المشاركة، لكن مش حل نهائي 100%. وضّح ده للعميل بصراحة من البداية.
- **`parentStatus`**: بقت اختيار (dropdown) جوه بيانات ولي الأمر (parentInfo) مش حقل منفصل، وبرضه بيتعامل معاه كبيانات حساسة — بيظهر بس في `/admin/*` أو في بروفايل الطالب لمدرّسه، مش في أي استجابة عامة.
- **النقاط**: اتقرر إنها عملة موحدة على مستوى المنصة كلها (مش لكل مدرس نظام منفصل) — رصيد واحد للطالب يصرفه على أي محاضرة لأي مدرس.
- **الدفع**: مفيش بوابة دفع فعلية متكاملة في السيستم — بس اختيار وسيلة (InstaPay / Wallet) + رفع صورة تحويل + مراجعة الأدمن يدويًا. لو حبيت مستقبلًا تدمج بوابة دفع حقيقية (Paymob مثلاً شائعة في مصر) هيبقى تطوير إضافي منفصل.
- **الإشعارات**: اتلغى WhatsApp Business API خالص، والنظام بقى SMS + Email + Push (FCM/OneSignal) — الثلاثة مستقلين عن بعض، فلو واحد فشل الباقي لسه بيتبعت.
- **الوصول**: الطلبة، الأدمنز، والمدرسين (+المساعدين) كل فريق ليه router منفصل تمامًا في الكود، مش مجرد if/role check — ده بيقلل احتمال تسريب صلاحيات بالغلط.
- **رفع المحاضرات**: هيبقى عن طريق المدرس مباشرة من المنصة، والتخزين الفعلي على Google Drive عبر Google Drive API (service account)، مش S3.

أقدر أبدأ فعليًا في كتابة الكود (Prisma schema + أول موديول) لو حابب أنطلق من هنا مباشرة.
