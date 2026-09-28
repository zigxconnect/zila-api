# Schema Update Required

The zila-api needs to integrate with the existing zigex-app database schema.

## Current Issue
- zila-api has its own Cohort/CohortStudent models
- zigex-app uses Internship/InternshipApplication models
- Users enrolled in internships don't show up in cohort queries

## Solution
Replace Cohort models with references to existing Internship models:
- Cohort → Internship (from zigex-app)
- CohortStudent → InternshipApplication (from zigex-app)
- Query accepted internship applications instead of cohort enrollments

## Migration Steps
1. Drop zila-api Cohort tables
2. Reference zigex-app Internship tables
3. Update all routes to query InternshipApplication
4. Filter by status = 'accepted'
