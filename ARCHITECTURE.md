# Architecture Overview

## System Design

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│  zila-agent │─────▶│   zila-api   │─────▶│  PostgreSQL  │
│  (CLI Tool) │      │  (REST API)  │      │  (Database)  │
└─────────────┘      └──────────────┘      └──────────────┘
                            │
                            ├─────▶ Supabase Auth
                            ├─────▶ Resend Email
                            └─────▶ GitHub API
```

## Components

### 1. Authentication Layer
- Supabase JWT authentication
- Middleware validates tokens on protected routes
- User context extracted from JWT claims

### 2. Database Layer (Prisma 7)
- 13 models for comprehensive platform coverage
- Prisma Client for type-safe database access
- Migrations managed with `prisma migrate`

### 3. Business Logic
- **Cohorts**: Student grouping and peer visibility
- **Tasks**: Assignment, submission, review workflow
- **Gamification**: Points, achievements, leaderboards
- **Scoring**: Weekly AI analysis and email reports
- **Documents**: File storage and RAG search
- **GitHub**: Repository linking and tracking

### 4. External Services
- **Supabase**: User authentication and profiles
- **Resend**: Transactional email delivery
- **GitHub API**: Repository metadata and commits

## Data Models

### Core Entities
- **Cohort**: Student groups with metadata
- **CohortStudent**: Many-to-many enrollment
- **Task**: Supervisor-assigned work
- **TaskSubmission**: Student deliverables

### Gamification
- **GamificationPoint**: Point transactions
- **Achievement**: Unlockable rewards
- **StudentAchievement**: Achievement progress
- **WeeklyScore**: AI-generated performance scores

### Resources
- **Document**: Learning materials
- **GitHubRepository**: Linked repos
- **SupervisorFeedback**: Task reviews

## API Design Principles

1. **RESTful**: Standard HTTP methods and status codes
2. **Authenticated**: All routes require valid JWT
3. **Type-safe**: TypeScript throughout
4. **Consistent**: Uniform response format
5. **Documented**: Swagger/OpenAPI specs

## Scalability Considerations

- Database indexes on foreign keys and frequent queries
- Connection pooling with Prisma
- Caching layer for leaderboards (future)
- Background jobs for scoring and emails
- Horizontal scaling ready (stateless API)
