# 🚀 Zila API: THE SUBMIT REPORT ENDPOINT

This document provides a step-by-step walkthrough on how the endpoint functions.

---

## 1. Purpose
This endpoint makes it easy for interns on the zigex platform to submit their reports about what they learned each day right at their CLI when coding. They will not have to go else where for reports submission

🔗 **[http://localhost:5000/api/submit-report](http://localhost:5000/api/submit-report)**

---

## 2. Authentication and Authorization
Authentication and Authorization follows same method as described in the DEVELOPER guide.

---

## 4. Tools used 
1. Prisma ORM for PostgreSQL
2. PostgreSQL for the database
3. Neon, for the cloud storage of PostgreSQL
4. Typescript

### Getting started
1. Install required packages (npm i prisma @prisma/client @prisma/adapter-pg pg @types/node)
2. Generate and Migrate (1. npx prisma generate 2. npx prisma migrate dev --name testing)
3. Run your server

### Post a report
1. Open http://localhost:5000/api/submit-report in Thunder Client or Postman or Insomia or HTTpie parse your token in Auth.
2. Write your report following the JSON format then hit send.
3. You should see a success message if submitted.

### View your reports
1. Open http://localhost:5000/api/submit-report in Thunder Client or Postman or Insomia or HTTpie parse your token in Auth.
2. Hit send. 
3. Your report will pop up starting from the newest to the oldest submitted report.

---

## 5. Benefits
*   **Time** Checks for Closing time before submission (An intern can not submit before 3 pm)
*   **Access** Only authorized interns can submit reports

## 6. Questions
1. Should an intern be able to update or delete his/her report?
2. How many times can a report be submitted in a day?
3. What if an intern forgets to submit a report?

## 7. Open for Corrections
