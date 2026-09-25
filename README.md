# Zila API

REST API for the Zigex internship platform with cohort management, task tracking, gamification, and AI-powered weekly scoring.

## Features

- **Cohort Management**: Group students into cohorts with peer visibility
- **Task System**: Supervisor task assignment and student submissions
- **Gamification**: Points, achievements, and leaderboards
- **Weekly Scoring**: AI-powered performance analysis with email reports
- **Document Management**: RAG-ready document storage and search
- **GitHub Integration**: Link repositories to cohorts

## Tech Stack

- Node.js + Express + TypeScript
- Prisma 7 ORM with PostgreSQL
- Supabase for authentication
- Resend for email automation

## Setup

\`\`\`bash
npm install
cp .env.example .env
# Configure DATABASE_URL and other env vars
npx prisma migrate dev
npm run dev
\`\`\`

## API Endpoints

### Cohorts
- GET /api/cohorts/my-cohorts - List user's cohorts
- GET /api/cohorts/:cohortId/peers - View cohort peers
- POST /api/cohorts/join - Join a cohort

### Tasks
- GET /api/tasks/my-tasks - List assigned tasks
- POST /api/tasks/:id/submit - Submit task solution
- POST /api/tasks/submissions/:id/review - Review submission

### Gamification
- GET /api/gamification/my-stats - User stats and points
- GET /api/gamification/leaderboard/:cohortId - Cohort rankings
- GET /api/gamification/achievements - All achievements

### Scoring
- GET /api/scores/weekly/:cohortId - Weekly scores
- POST /api/scores/trigger-weekly - Trigger score generation

### Documents
- GET /api/documents - Browse documents
- GET /api/documents/search - RAG search

### GitHub
- GET /api/github/repos - List repositories
- POST /api/github/link - Link repository

## Database Schema

13 models covering cohorts, tasks, submissions, gamification, scoring, documents, and GitHub repos.
