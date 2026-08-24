# 🎓 Khatwa Platform (منصة خطوة التعليمية)

An enterprise-grade, modern educational e-learning platform built for high security, seamless course management, interactive quizzes, video streaming, points economy, and role-based access control (Students, Teachers, Staff, Admins).

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` in both root and `backend/`:
```bash
cp .env.example backend/.env
```

### 3. Generate Prisma Client & Run Database Migrations
```bash
npm run prisma:generate
```

### 4. Run Development Server
```bash
npm run dev
```
- **Backend API**: `http://localhost:3000`
- **Frontend**: `http://localhost:3000` or open `frontend/index.html`

### 5. Run Test Suite
```bash
npm run test
```

---

## ⚡ Vercel Deployment Guide

Deploying Khatwa to Vercel is turnkey and ready out of the box with the included `vercel.json` and serverless API integration.

### Steps to Deploy:
1. **Push to GitHub** (or connect your Git repository in Vercel).
2. Go to [Vercel Dashboard](https://vercel.com/new) and click **"Add New Project"**.
3. Select your `khatwa` repository.
4. Set the **Framework Preset** to **Other** (Root directory: `./`).
5. In **Environment Variables**, add the following required production variables:
   - `DATABASE_URL`: Your PostgreSQL connection string (Neon, Supabase, Railway, Vercel Postgres, etc.)
   - `JWT_ACCESS_SECRET`: Secret string (minimum 32 characters)
   - `JWT_REFRESH_SECRET`: Secret string (minimum 32 characters)
   - `PLAYBACK_TOKEN_SECRET`: Secret string (minimum 32 characters)
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: Your Vercel domain (e.g., `https://khatwa.vercel.app`)
6. Click **Deploy**. Vercel will run `npm run vercel-build` automatically, compile TypeScript, generate Prisma clients, and deploy the frontend + serverless functions.

---

## 📂 Project Architecture

```
Platform-Khatwa/
├── api/                    # Vercel Serverless Function entry point
│   └── index.ts
├── backend/                # Express & TypeScript Backend
│   ├── prisma/             # Multi-database Prisma schemas & migrations (PostgreSQL + SQLite)
│   ├── src/
│   │   ├── config/         # Environment & Prisma client instances
│   │   ├── middleware/     # Role guards, auth filters & security middleware
│   │   ├── modules/        # Modular business logic (Auth, Courses, Lessons, Points)
│   │   ├── routes/         # Role-isolated route endpoints
│   │   ├── services/       # Core services (Token, Video, Drive, Access Codes)
│   │   ├── app.ts          # Express application setup
│   │   └── server.ts       # Standalone HTTP server entry
│   └── tsconfig.json
├── frontend/               # Responsive HTML5/CSS3/JavaScript Frontend
│   ├── css/style.css       # Unified design system & responsive theme
│   ├── js/api.js           # Resilient dynamic API store & client
│   ├── js/main.js          # Interactive UI controllers
│   ├── logo/               # Branding assets
│   └── *.html              # All platform pages (Courses, Dashboard, Studio, Exams, etc.)
├── vercel.json             # Vercel routing, rewrites, and edge caching rules
├── .vercelignore           # Vercel deployment exclusions
├── package.json            # Monorepo workspaces and build scripts
└── tsconfig.json           # Root TypeScript configuration
```

---

## 🛡️ Security Features
- **Role Isolation Middleware**: Enforces distinct isolation across Student, Teacher, Staff, and Admin routes.
- **Dual-Token JWT & SHA-256 Access Codes**: Single-redemption and atomic anti-double-spend protection.
- **Ephemeral Playback Tokens**: Prevents unauthorized sharing and direct scraping of course videos.
- **Multi-layer Rate Limiting**: Global and endpoint-specific DDoS protection.
