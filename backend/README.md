# Khatwa Backend

Node.js + TypeScript backend for the **Khatwa** educational platform.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (access + refresh tokens) |
| Queue | BullMQ + Redis |
| Video Storage | Google Drive API v3 (service account) |
| SMS | Twilio |
| Email | Resend |
| Push | Firebase Cloud Messaging (FCM) |

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL (running locally or remote)
- Redis (for BullMQ notification queues)
- Google service account JSON (for video storage)
- Twilio account (for SMS)
- Resend account (for email)
- Firebase project (for push notifications)

### 2. Setup

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Fill in all required values in .env

# Generate Prisma client
npm run prisma:generate

# Apply schema to database
npm run prisma:push
# OR for migration-based workflow:
npm run prisma:migrate

# Seed with sample codes and demo users
npm run seed

# Start dev server
npm run dev
```

### 3. Demo Credentials (after seed)

| User | Password | Role |
|---|---|---|
| `sameryasser-khatwa` | `Samer-yasser159` | ADMIN |
| `demo_teacher` | `Teacher@khatwa123` | TEACHER |
| `demo_student` | `Student@khatwa123` | STUDENT (50 pts) |

### 4. Seed Access Codes (unused)

| Type | Codes |
|---|---|
| ADMIN | `ADM-SEED002`, `ADM-SEED003` |
| EDITOR | `EDT-SEED001`, `EDT-SEED002` |
| TEACHER | `TCH-SEED002` |
| ASSISTANT | `AST-SEED001` … `AST-SEED005` (linked to demo_teacher) |

## Architecture

```
src/
├── config/         Env validation + Prisma client singleton
├── middleware/     JWT auth + role guards (requireStudent/Admin/Editor/Teacher)
├── modules/
│   ├── auth/       Login, register, refresh token
│   ├── accessCodes/ Generate/revoke access codes
│   ├── points/     Buy points, admin approve/reject, spend, audit log
│   ├── lessons/    Create, gate, stream video
│   ├── quizEngine/ MCQ quiz + auto-grade + attempt storage
│   └── branding/   Platform settings / theming
├── routes/
│   ├── student.router.ts   /student/* — STUDENT only
│   ├── teacher.router.ts   /teacher/* — TEACHER + scoped ASSISTANT
│   └── admin.router.ts     /admin/* — ADMIN (+ EDITOR for branding)
├── services/
│   ├── googleDrive.ts      Drive API wrapper + streaming proxy
│   ├── playbackToken.ts    Single-use short-lived tokens
│   └── notification/       SMS/email/push providers
├── jobs/
│   ├── queue.ts            BullMQ queue setup
│   └── notificationWorker.ts   Processes notification jobs
└── utils/          errors, asyncHandler, jwt, validate
```

## Route Groups (Structurally Isolated)

Each group has its **own auth middleware** — a token issued for one role is
**structurally rejected** by the other routers, not just filtered by a permission check.

| Prefix | Auth Guard | Who |
|---|---|---|
| `/auth` | None (rate-limited) | Everyone |
| `/student/*` | `requireStudent` | STUDENT only |
| `/teacher/*` | `requireTeacherOrAssistant` | TEACHER + scoped ASSISTANT |
| `/admin/*` | `requireAdmin` | ADMIN (+ EDITOR for branding endpoints) |
| `/settings/branding` | None | Public (read) |

## Key API Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register/student` | Student registration with parentInfo |
| POST | `/auth/register` | Teacher/Assistant/Admin/Editor via access code |
| POST | `/auth/login` | Returns access + refresh tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |

### Student
| Method | Path | Description |
|---|---|---|
| GET | `/student/profile` | Own profile (parentStatus excluded) |
| GET | `/student/balance` | Points balance |
| POST | `/student/points/requests` | Upload payment screenshot |
| GET | `/student/lessons` | List published lessons |
| POST | `/student/lessons/:id/unlock` | Spend points to unlock |
| GET | `/student/lessons/:id/content` | Gated content (returns playbackToken) |
| GET | `/student/lessons/:id/stream?token=...` | Proxy video stream |
| POST | `/student/quizzes/:id/attempt` | Submit quiz answers |
| POST | `/student/lessons/:id/homework/submit` | Submit homework |

### Teacher
| Method | Path | Description |
|---|---|---|
| POST | `/teacher/lessons` | Create lesson |
| POST | `/teacher/lessons/:id/video` | Upload video → Drive |
| POST | `/teacher/quizzes` | Create quiz |
| GET | `/teacher/students/:id/performance` | Student dashboard |
| GET | `/teacher/assistant-codes` | View own assistant codes |

### Admin
| Method | Path | Description |
|---|---|---|
| GET | `/admin/points/requests?status=PENDING` | Review queue |
| PATCH | `/admin/points/requests/:id/approve` | Approve + credit points |
| PATCH | `/admin/points/requests/:id/reject` | Reject with reason |
| POST | `/admin/access-codes/teacher` | Generate teacher code |
| GET | `/admin/students/:id/full-profile` | Full profile incl. parentStatus |
| GET | `/admin/analytics` | Platform-wide stats |
| PATCH | `/admin/settings/branding` | Update branding (EDITOR allowed) |

## Video Security Notes

> **Video protection is not 100% achievable technically.**
>
> The backend proxies all video playback through the platform (never exposing
> Google Drive URLs to clients). This prevents direct URL sharing/downloading.
> However, screen recording is impossible to prevent from the frontend alone.
> Disabling right-click/download UI hooks in the player is a deterrent, not a guarantee.
>
> **Scaling consideration:** Every video view consumes Google Drive API quota and
> bandwidth. Monitor usage at scale — this is a known limitation of the proxy approach.
> At high traffic, consider migrating to a dedicated video CDN (e.g. Cloudflare Stream,
> Mux) which provides native HLS + token-based access without proxying through your server.

## Sensitive Data Handling

- `parentStatus` is **never** included in general API responses
- It only appears in `/admin/students/:id/full-profile` (ADMIN only)
- Never logged anywhere in the codebase
- All other student list/dashboard endpoints use Prisma `select` to exclude it
