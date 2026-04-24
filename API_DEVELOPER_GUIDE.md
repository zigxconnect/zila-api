# 🚀 Zila API: CLI Developer's Guide

This guide provides a step-by-step walkthrough for CLI developers to interact with the Zila API using the interactive Swagger UI. Use this to test endpoints, verify data structures, and debug the authentication flow before implementing them in the CLI.

---

## 1. Accessing the Swagger UI
Once your local API server is running (`npm run dev`), you can access the interactive documentation at:

🔗 **[http://localhost:5000/docs](http://localhost:5000/docs)**

---

## 2. Authentication Flow (The "Handshake")
Most endpoints in the Zila API are protected and require a **JWT (JSON Web Token)**. Follow these steps to generate a valid session:

### Step A: Request an OTP
1. Locate the **Auth** section in Swagger.
2. Open the `POST /api/auth/request-otp` endpoint.
3. Click **"Try it out"**.
4. Enter your Zigex-registered email in the request body:
   ```json
   {
     "email": "your-email@example.com"
   }
   ```
5. Click **"Execute"**. You should receive a `200 OK` response. Check your email for the 6-digit code.

### Step B: Verify OTP & Get Token
1. Open the `POST /api/auth/verify-otp` endpoint.
2. Click **"Try it out"**.
3. Enter your email and the code you received:
   ```json
   {
     "email": "your-email@example.com",
     "otp": "123456"
   }
   ```
4. Click **"Execute"**.
5. In the Response Body, copy the long string inside the `"token"` field. **This is your Bearer Token.**

---

## 3. Authorizing Swagger UI
Now that you have a token, you need to "tell" Swagger to use it for all subsequent requests:

1. Scroll to the top of the Swagger page.
2. Click the green **"Authorize"** button on the right.
3. In the "Value" field, paste the token you copied.
   *   *Note: Just paste the token itself. Swagger handles the "Bearer " prefix automatically.*
4. Click **"Authorize"** and then **"Close"**.

---

## 4. Interacting with Protected Endpoints
Now that you are authorized (look for the locked padlock icon 🔓 next to endpoints), you can test protected data:

### Fetch Your Profile (`zila about-me` logic)
1. Open `GET /api/profile/me`.
2. Click **"Try it out"** -> **"Execute"**.
3. Review the response to see exactly what fields are available (skills, bio, linkedin_url, etc.).

### Fetch Your Roles (`zila --role` logic)
1. Open `GET /api/profile/roles`.
2. Click **"Execute"**.
3. This will show you your active roles (e.g., `["student", "intern", "supervisor"]`).

### Fetch Supervised Students (Supervisor logic)
1. Open `GET /api/profile/supervised-students`.
2. Click **"Execute"**.
3. If your account is a supervisor, you'll see a list of interns assigned to you.

---

## 5. Tips for CLI Implementation
*   **Headers:** When calling the API from the CLI (e.g., using `axios`), always include the header:
    `Authorization: Bearer <YOUR_TOKEN>`
*   **Timeouts:** The JWT expires in **30 days**. If you get a `401 Unauthorized` in the CLI, you should prompt the user to run `zila auth` again.
*   **Base URL:** During development, the CLI should point to `http://localhost:5000/api`. When deployed, update this to your Render URL.
