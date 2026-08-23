# Khatwa Backend — Full Production Bug Audit

**Audit Date**: 2026-08-20  
**Scope**: All backend source code, security, authorization, integrations, and dependencies.

---

## Overall Status

> **🟡 PASS WITH WARNINGS — Fix before production launch**

All existing tests pass, Google Drive integration is live, and Semgrep is clean. However, **5 real bugs** (1 Critical, 2 High, 1 Medium, 1 Low) were found through code review that are not caught by the existing test suite, including one that allows anyone on the internet to register as ADMIN.

---

## Critical Bugs

### 🔴 BUG-01 — Open Self-Registration as ADMIN/TEACHER (No Authorization Gate)

**File**: [`auth.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/auth/auth.service.ts#L71-L102)  
**Route**: `POST /auth/register`

`registerWithCode` accepts a `role` field from the request body and maps it directly to `TEACHER`, `ADMIN`, or `STAFF`. The schema requires `accessCode`, but the **service never reads or verifies the accessCode field**.

```typescript
// Line 72 — accessCode is silently ignored
const { username, password, displayName, role = 'STAFF' } = input as any;
const targetRole = role === 'TEACHER' ? 'TEACHER' : role === 'ADMIN' ? 'ADMIN' : 'STAFF';
```

**Impact**: Any unauthenticated user can POST `{ "role": "ADMIN" }` to `/auth/register` and receive a valid ADMIN JWT immediately. This is a complete privilege escalation bypass.

**Fix Options**:
- **Option A** (simplest): Remove `role` from the schema. Only allow STAFF registration here. Put teacher/admin creation behind a protected `/admin/` endpoint.
- **Option B**: Validate `accessCode` against a pre-generated invitation code in the database that carries an allowed role.
- **Option C**: Require an existing ADMIN JWT (`requireAdmin` middleware) to create privileged accounts.

---

## High Bugs

### 🟠 BUG-02 — Deactivated Users Can Refresh Tokens for 7 Days

**File**: [`auth.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/auth/auth.service.ts#L135-L171)

`refreshAccessToken` checks the token is not revoked/expired but does **not check `storedToken.user.isActive`**. A user deactivated via `PATCH /admin/students/:id/deactivate` can continue refreshing their token for up to 7 days.

**Fix**: Add after line 155:
```typescript
if (!storedToken.user.isActive) {
  throw UnauthorizedError('Account has been deactivated');
}
```
Also revoke all refresh tokens when an account is deactivated.

---

### 🟠 BUG-03 — Unlinked Quiz Has No Owner — Any Teacher Can Add Questions or Read Answers

**File**: [`quizEngine.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/quizEngine/quizEngine.service.ts#L59-L66)

The ownership guard short-circuits when a quiz has no linked lessons (`ownerProfileIds.length === 0`):

```typescript
if (ownerProfileIds.length > 0 && !ownerProfileIds.includes(actorTeacherProfileId)) {
  throw ForbiddenError('You do not own this quiz');
}
// When length === 0 → check is SKIPPED — any teacher passes
```

The same bypass exists in `getQuizWithAnswers`. Teacher B can add questions to Teacher A's freshly created (but not yet linked) quiz, or read all correct answers.

**Fix**: Add `createdByTeacherProfileId` to the `Quiz` model and enforce strict creator/owner allowlist.

---

## Medium Bugs

### 🟡 BUG-04 — Quiz Retake Race Condition

**File**: [`quizEngine.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/quizEngine/quizEngine.service.ts#L147-L153)

The `existingAttempt?.passed` guard runs **outside** the `prisma.$transaction`. Two concurrent retake requests can both pass the check before either one writes, causing duplicate submissions or a unique constraint error surfaced to the client.

**Fix**: Move the `existingAttempt` lookup inside the transaction.

---

## Low Bugs

### 🔵 BUG-05 — `listLessons` Exposes Internal Quiz IDs to Students

**File**: [`lessons.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/lessons/lessons.service.ts#L50-L67)

`openingQuizId` and `homeworkId` are included in the student-facing catalog response. Students can use these IDs to probe quizzes directly without following the intended lesson flow.

**Fix**: Remove `openingQuizId` and `homeworkId` from the student-facing `listLessons` response.

---

## Additional Security Findings

### ⚠️ FINDING-01 — 2GB Multer Memory Storage → DoS Risk

**File**: [`lessons.controller.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/lessons/lessons.controller.ts#L15-L25)

A 2GB upload holds 2GB in Node.js RAM. Multiple concurrent uploads can crash the server.  
**Rec**: Stream directly to Drive without full memory buffering, or reduce limit.

---

### ⚠️ FINDING-02 — OAuth Callback Has No CSRF `state` Parameter

**File**: [`auth.router.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/auth/auth.router.ts#L22-L44)

The `/auth/google/callback` handler does not validate a `state` CSRF nonce, violating OAuth 2.0 spec best practices.  
**Rec**: Generate and verify a `state` nonce.

---

### ⚠️ FINDING-03 — `PLAYBACK_TOKEN_SECRET` Env Var Is Never Used

**File**: [`env.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/config/env.ts#L40)

Defined in schema, never referenced in [`playbackToken.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/services/playbackToken.ts). The implementation correctly uses opaque random tokens — the env var is dead configuration.  
**Rec**: Remove from env schema.

---

### ⚠️ FINDING-04 — Admin Deactivate Has No Role Guard on Target

**File**: [`admin.router.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/routes/admin.router.ts#L107-L117)

`PATCH /admin/students/:id/deactivate` accepts any user ID — including other ADMINs and TEACHERs. No Zod validation on the `:id` param either.  
**Rec**: Add `where: { id, role: 'STUDENT' }` filter and validate `:id` with Zod.

---

### ⚠️ FINDING-05 — `driveFileId` Stripped at Controller Level (Fragile Pattern)

**File**: [`lessons.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/lessons/lessons.service.ts#L133-L140)

`driveFileId` is included in the service return value and stripped via `driveFileId: undefined` in the controller. This fragile override pattern could expose the Drive file ID to students if the spread order is ever changed.  
**Rec**: Omit `driveFileId` at the service layer instead.

---

### ⚠️ FINDING-06 — `submitHomework` Has No Unlock or Homework Existence Check

**File**: [`lessons.service.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/modules/lessons/lessons.service.ts#L145-L161)

Students can submit homework for lessons they haven't unlocked and for lessons without a homework quiz. This bypasses the sequential gating system (Gate 3 depends on homework completion).  
**Rec**: Verify unlock status and that `lesson.homeworkId !== null` before allowing submission.

---

### ⚠️ FINDING-07 — No Pagination on `GET /admin/students` and `GET /teacher/students`

**Files**: [`admin.router.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/routes/admin.router.ts#L38-L58), [`teacher.router.ts`](file:///D:/Mynd/Platform-Fu-gates/fugate-backend/src/routes/teacher.router.ts#L78-L105)

These endpoints return all records with no limit. Staff endpoint correctly paginates; admin and teacher student lists do not.  
**Rec**: Add `take` limit and pagination like the staff endpoint.

---

### ⚪ FINDING-08 — Redis/BullMQ Not Implemented; `jobs/` Directory Is Empty

The `jobs/` directory is empty. No Redis connection, no queues, no workers exist anywhere in the codebase or `package.json`. This is informational — any documentation claiming Redis support is inaccurate.

---

## Authorization Matrix

| Endpoint | Student | Teacher | Staff | Admin | Unauth |
|----------|:-------:|:-------:|:-----:|:-----:|:------:|
| `GET /health` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /settings/branding` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/register/student` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/register` | ✅ | ✅ | ✅ | ✅ | ✅ ⚠️ BUG-01 |
| `GET /student/profile` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /student/balance` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /student/access-codes/redeem` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /student/lessons` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /student/lessons/:id/unlock` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /student/lessons/:id/content` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /student/lessons/:id/stream` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /student/lessons/:id/homework/submit` | ✅ ⚠️ F-06 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /student/quizzes/:id` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /student/quizzes/:id/attempt` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /teacher/profile` | ❌ 403 | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /teacher/lessons` | ❌ 403 | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| `PATCH /teacher/lessons/:id` | ❌ 403 | ✅ own | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /teacher/lessons/:id/video` | ❌ 403 | ✅ own | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /teacher/quizzes` | ❌ 403 | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /teacher/quizzes/:id/questions` | ❌ 403 | ✅ ⚠️ BUG-03 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /teacher/quizzes/:id` | ❌ 403 | ✅ ⚠️ BUG-03 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /staff/students` | ❌ 403 | ❌ 403 | ✅ | ✅ | ❌ 401 |
| `POST /staff/access-codes` | ❌ 403 | ❌ 403 | ✅ | ✅ | ❌ 401 |
| `GET /admin/students` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| `GET /admin/students/:id/full-profile` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| `PATCH /admin/students/:id/deactivate` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ ⚠️ F-04 | ❌ 401 |
| `GET /admin/analytics` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| `PATCH /admin/settings/branding` | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |

---

## Integration Status

| System | Status | Notes |
|--------|:------:|-------|
| **PostgreSQL** | ✅ PASS | Connected, live Prisma queries verified |
| **Redis / BullMQ** | ⚪ N/A | Not implemented |
| **Google Drive OAuth** | ✅ PASS | 12/12 live E2E checks passed |
| **Video Upload** | ✅ PASS | OAuth-authenticated upload to personal Drive |
| **Video Streaming** | ✅ PASS | Backend-proxied, single-use playback token gated |

---

## Test Results

| Command | Result |
|---------|:------:|
| `npm run lint` | ✅ PASS |
| `npm test` | ✅ PASS (30/30) |
| `npm run build` | ✅ PASS |
| `npm run google-drive:test` | ✅ PASS (12/12) |
| `semgrep --config=auto` | ✅ PASS (0 findings, 213 rules, 87 files) |
| `npm audit` | ⚠️ 9 advisories (details below) |
| `npm outdated` | ⚠️ googleapis 175→176, uuid 14.0.1→14.0.2 |

> **Semgrep caveat**: Only free OSS Community rules ran (1074 rules). Commercial SAST rules require `semgrep login`. Zero OSS findings ≠ zero vulnerabilities.

---

## Dependency Vulnerabilities

### 1. `deepmerge-ts` — Stack Exhaustion (HIGH)

| Field | Detail |
|-------|--------|
| Package | `deepmerge-ts <8.0.0` |
| Severity | High |
| Chain | `prisma` → `@prisma/config` → `deepmerge-ts` |
| Runtime reachable? | **No** — Prisma CLI dev tool only, never called at runtime |
| Safe fix? | Requires `prisma@6.12.0` (breaking major downgrade from 7.x) |
| **Action** | **Do NOT downgrade.** Monitor for Prisma 7.x patch. Dev-only risk. |

### 2. `uuid` — Buffer Bounds Check (MODERATE)

| Field | Detail |
|-------|--------|
| Package | `uuid <11.1.1` |
| Severity | Moderate |
| Chain | `firebase-admin` → `@google-cloud/storage` → `gaxios@6` / `teeny-request` → `uuid@9` |
| Runtime reachable? | **No** — Requires calling `uuid.v3/v5/v6` with a malicious `buf`. App uses `uuid.v4()` only. |
| Safe fix? | `npm audit fix` (non-force) — non-breaking transitive fix |
| **Action** | Run `npm audit fix` (not `--force`). Safe. |

### Extraneous Packages to Clean Up

These are **not in `package.json`** but are installed (legacy service account remnants):
- `firebase-admin`, `@google-cloud/storage`, `gtoken`, `google-gax`, `retry-request@7`, `teeny-request@9`

Run `npm prune` to remove them and reduce the audit surface.

---

## Production Blockers

| # | ID | Severity | Description |
|---|----|:--------:|-------------|
| 1 | BUG-01 | 🔴 CRITICAL | Anyone can self-register as ADMIN/TEACHER via `/auth/register` |
| 2 | BUG-02 | 🟠 HIGH | Deactivated users retain full API access for up to 7 days |
| 3 | BUG-03 | 🟠 HIGH | Any teacher can corrupt or read answers of unlinked quizzes |
| 4 | F-06 | ⚠️ MEDIUM | Students bypass gating by pre-submitting homework before unlocking |
| 5 | F-04 | ⚠️ LOW | Admin deactivate endpoint has no target role guard |

---

## Recommended Fixes (Priority Order)

### 1. Critical
- **BUG-01**: Lock `/auth/register` — remove `role` from schema, or require ADMIN JWT, or validate access code against a database invitation table.

### 2. High
- **BUG-02**: Add `isActive` check in `refreshAccessToken`; revoke refresh tokens on deactivation.
- **BUG-03**: Add `createdByTeacherProfileId` to `Quiz` model; enforce strict ownership check even when `ownerProfileIds.length === 0`.

### 3. Medium
- **F-06**: In `submitHomework`, verify the student has unlocked the lesson and the lesson has a homework quiz.
- **BUG-04**: Move `existingAttempt` lookup inside the Prisma transaction.

### 4. Low / Hardening
- **F-04**: Add `role: 'STUDENT'` filter and Zod validation on admin deactivate endpoint.
- **BUG-05**: Remove `openingQuizId`/`homeworkId` from student-facing `listLessons`.
- **F-05**: Strip `driveFileId` at service layer, not controller layer.
- **F-01**: Reduce 2GB multer limit or switch to streaming upload.
- **F-02**: Add OAuth `state` CSRF parameter.
- **F-03**: Remove unused `PLAYBACK_TOKEN_SECRET` from env schema.
- **F-07**: Add pagination to `GET /admin/students` and `GET /teacher/students`.
- Run `npm prune` and `npm audit fix` (non-force).
- Update `uuid` to `14.0.2`.
