import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { z } from 'zod';

const requestOTPSchema = z.object({
  email: z.string().email(),
});

const verifyOTPSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export class AuthController {
  static async requestOTP(req: Request, res: Response) {
    try {
      const { email } = requestOTPSchema.parse(req.body);
      const result = await AuthService.requestOTP(email);

      if (!result.success) {
        if (result.error === 'ACCOUNT_NOT_FOUND') {
          return res.status(404).json({
            message: result.message,
            link: 'https://zigexconnect.com/signup'
          });
        }
        return res.status(500).json({ message: result.message });
      }

      return res.status(200).json({ message: result.message });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid email address' });
      }
      return res.status(500).json({ message: error.message });
    }
  }

  static async verifyOTP(req: Request, res: Response) {
    try {
      const { email, otp } = verifyOTPSchema.parse(req.body);
      const result = await AuthService.verifyOTP(email, otp);

      if (!result.success) {
        return res.status(401).json({ message: result.message });
      }

      return res.status(200).json({
        message: 'Login successful',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input' });
      }
      return res.status(500).json({ message: error.message });
    }
  }
}
