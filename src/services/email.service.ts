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

export interface TaskEmailDetails {
  prUrl: string;
  branch: string;
  module: string;
  day: number;
  domain: string;
  status: 'pending' | 'accepted' | 'rejected';
  pointsAwarded?: number;
}

export const sendTaskSubmissionEmail = async (
  email: string,
  studentName: string,
  details: TaskEmailDetails
) => {
  try {
    const isAccepted = details.status === 'accepted';
    const isRejected = details.status === 'rejected';
    const statusLabel = isAccepted ? '✔ Accepted' : isRejected ? '✖ Rejected' : '⏳ Pending Review';
    const statusColor = isAccepted ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b';

    const { data, error } = await resend.emails.send({
      from: `Zigex Agent <${env.EMAIL_FROM}>`,
      to: email,
      subject: `[Zigex Cohort] Task ${details.status.toUpperCase()}: ${details.module} Day 0${details.day}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
            <h1 style="color: #2563eb; font-size: 22px; margin: 0;">Zigex Task Automation</h1>
            <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Automated GitHub Pull Request Pipeline Notification</p>
          </div>
          <p style="font-size: 16px; color: #1e293b;">Hello <strong>${studentName}</strong>,</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Your daily exercise submission has been registered and dispatched on GitHub.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 140px;">Status:</td>
                <td style="padding: 6px 0; font-weight: bold; color: ${statusColor};">${statusLabel}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Curriculum Track:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${details.domain.toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Module / Day:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${details.module} · Day 0${details.day}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Branch:</td>
                <td style="padding: 6px 0; font-family: monospace; color: #0284c7;">${details.branch}</td>
              </tr>
              ${details.pointsAwarded !== undefined ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Points Awarded:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #10b981;">+${details.pointsAwarded} pts</td>
              </tr>
              ` : ''}
            </table>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${details.prUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              View Pull Request on GitHub
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0 16px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
            Zigex Connect Platform · Automated Evaluation & Peer Mentorship
          </p>
        </div>
      `,
    });

    if (error) {
      console.warn('Failed to send task email:', error);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (error: any) {
    console.warn('Email service error for task submission:', error.message);
    return { success: false, error: error.message };
  }
};

