# Zila API

> Production backend REST API for the Zigex internship platform, governing cohort management, task tracking, isolated gamification, GitHub sync automation, payment compliance, and AI weekly scoring.

---

## Features

- **Strict Cohort Isolation**: Leaderboards, scores, and points strictly scoped per cohort enrollment. Points in one cohort do not affect another.
- **Automated GitHub PR Sync Engine**: Automatically detects student pull request merges on cohort repositories, prevents branch hijacking, and enforces idempotent points attribution.
- **Task Submission & Integrity Pipeline**: Tracks automated submissions, validates pull request quotas (2 PRs per calendar day), and records reviewer comments.
- **Transactional Email Automation**: Resend integration delivering notifications with branch, curriculum track, and rubric score badges when PRs are accepted or rejected.
- **Billing & 6-Free-Task Quota Gate**: Connects with Zigex Admin records to offer 6 free submissions before requiring tuition completion, with automated late-penalty distribution (90% Zigex / 10% Host Company).
- **Gamification & Rubric Marks**: Supports normalized rubric weights (Day 1: 1pt, Day 2: 1pt, Day 3: 2pts, Day 4: 4pts).
- **RAG Document Engine**: Document indexing and semantic retrieval for learning materials.

---

## Tech Stack

- **Runtime**: Node.js + Express (TypeScript)
- **Database & ORM**: PostgreSQL (Neon Serverless) + Prisma ORM 7 with `@prisma/adapter-pg`
- **Network Resiliency**: Automated query retry (`withDbRetry`) with exponential backoff for serverless PostgreSQL drops
- **Authentication**: Supabase JWT validation & user profiles
- **Email Delivery**: Resend SDK
- **API Documentation**: OpenAPI / Swagger (`/api-docs`)

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/zigxconnect/zila-api.git
cd zila-api

# 2. Install dependencies & generate Prisma client
npm install
npx prisma generate

# 3. Environment variables
cp .env.example .env
# Fill DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY, GITHUB_TOKEN

# 4. Compile & run
npm run build
npm start
```

Default port is `5000` (or `PORT` environment variable). Health check available at `GET /health`.

---

## API Endpoints Overview

### Cohorts
- `GET /api/cohorts/my-cohorts` — List cohorts the authenticated student is enrolled in
- `GET /api/cohorts/:cohortId/chat-group` — Group members, active enrolled students, and supervisor details
- `GET /api/cohorts/:cohortId/peers` — Cohort peers and attendance
- `POST /api/cohorts/join` — Join cohort by enrollment code

### Gamification & Leaderboard
- `GET /api/gamification/leaderboard/:cohortId` — Isolated cohort leaderboard with PR status indicators (`pending`, `accepted`, `rejected`, `none`)
- `GET /api/gamification/cohort-stats/:cohortId` — Isolated points and completion stats for the current user
- `GET /api/gamification/my-stats` — Global gamification breakdown across all enrollments

### Tasks & Submissions
- `POST /api/tasks/auto-submit` — Automated terminal PR task submission with daily quota tracking
- `GET /api/tasks/:taskId` — Task details and submissions history
- `POST /api/tasks/submissions/:id/review` — Supervisor review and grading

### GitHub Integration & Webhooks
- `GET /api/github/active` — Active cohort repository URL and curriculum materials
- `POST /api/github/webhook` — GitHub webhook receiver for PR merge and closure events

---

## Developer Manual & Architecture Blueprint

For the comprehensive end-to-end architecture across CLI, API, and Web, refer to the [Zila System Developer Manual](../zila-agent/ZILA_SYSTEM_DEVELOPER_MANUAL.md) and [Future Implementation Plan](../zila-agent/ZILA_FUTURE_IMPLEMENTATION_PLAN.md).
