# Deployment Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Supabase project
- Resend account

## Production Setup

1. **Database Setup**
   ```bash
   # Create production database
   createdb zigex_prod
   
   # Run migrations
   npx prisma migrate deploy
   
   # Seed achievements
   npm run seed:achievements
   ```

2. **Environment Variables**
   ```bash
   DATABASE_URL="postgresql://..."
   SUPABASE_URL="https://..."
   SUPABASE_SERVICE_ROLE_KEY="..."
   JWT_SECRET="strong-random-secret"
   RESEND_API_KEY="re_..."
   NODE_ENV=production
   PORT=3000
   ```

3. **Build and Start**
   ```bash
   npm run build
   npm start
   ```

## Weekly Scoring Cron

Set up a cron job to run weekly scoring:

```bash
# Run every Monday at 9 AM
0 9 * * 1 cd /path/to/zila-api && npm run scoring:weekly
```

Or use a service like GitHub Actions:

```yaml
name: Weekly Scoring
on:
  schedule:
    - cron: '0 9 * * 1'
jobs:
  scoring:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run scoring:weekly
```

## Health Check

```bash
curl http://localhost:3000/health
```

## Monitoring

Monitor these endpoints:
- `/api/cohorts/my-cohorts` - Cohort access
- `/api/tasks/my-tasks` - Task fetching
- `/api/gamification/leaderboard/:id` - Leaderboard performance
- `/api/scores/weekly/:id` - Scoring system
