import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

/**
 * @openapi
 * /api/auth/request-otp:
 *   post:
 *     summary: Request a verification OTP
 *     description: Checks if user exists and sends a 6-digit OTP to their email.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@example.com
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       404:
 *         description: Account not found
 *       400:
 *         description: Invalid email format
 */
router.post('/request-otp', AuthController.requestOTP);

/**
 * @openapi
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login
 *     description: Validates the OTP and returns a JWT token for the session.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: student@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       401:
 *         description: Invalid or expired OTP
 */
router.post('/verify-otp', AuthController.verifyOTP);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Logout from the session
 *     description: Ends the current session. In a JWT system, this primarily serves as an indicator for the client to delete the token.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', AuthController.logout);

export default router;
