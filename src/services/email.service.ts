import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);

export const sendOTPEmail = async (email: string, otp: string) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `Zigex Agent <${env.EMAIL_FROM}>`,
      to: email,
      subject: 'Your Zigex Verification Code',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e8; border-radius: 12px; background-color: #ffffff;">
          <h1 style="color: #1a73e8; text-align: center; font-size: 24px;">Verification Code</h1>
          <p style="font-size: 16px; color: #3c4043; line-height: 1.5;">Hello,</p>
          <p style="font-size: 16px; color: #3c4043; line-height: 1.5;">Use the code below to verify your identity on the Zigex Terminal Agent. This code will expire in 10 minutes.</p>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <span style="font-family: monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #202124;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #70757a; text-align: center; margin-top: 30px;">
            If you didn't request this code, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0 20px 0;" />
          <p style="font-size: 12px; color: #9aa0a6; text-align: center;">
            Zigex Connect - Empowing the next generation of professionals.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Failed to send OTP email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Email service error:', error);
    return { success: false, error: error.message };
  }
};
