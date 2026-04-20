import { Redis } from '@upstash/redis';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { sendOTPEmail } from './email.service';
import jwt from 'jsonwebtoken';

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export class AuthService {
  /**
   * Check if user exists by email
   * Optimzed to query public tables which is much faster than admin listUsers
   */
  static async userExists(email: string): Promise<boolean> {
    try {
      // Check students profile first
      const { data: student, error: studentError } = await supabase
        .from('student_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (student) return true;

      // Then check company profile
      const { data: company, error: companyError } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (company) return true;

      // If both errors or not found
      if (studentError && companyError) {
        console.error('Database query error:', { studentError, companyError });
      }

      return false;
    } catch (error) {
      console.error('Error in userExists:', error);
      return false;
    }
  }

  /**
   * Request OTP
   */
  static async requestOTP(email: string) {
    const exists = await this.userExists(email);
    if (!exists) {
      return { 
        success: false, 
        error: 'ACCOUNT_NOT_FOUND', 
        message: 'No account found with this email. Please sign up at https://zigexconnect.com/signup' 
      };
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with 10-minute expiry
    await redis.set(`otp:${email}`, otp, { ex: 600 });

    // Send Email
    const emailResult = await sendOTPEmail(email, otp);
    if (!emailResult.success) {
      return { success: false, error: 'EMAIL_SEND_FAILED', message: emailResult.error };
    }

    return { success: true, message: 'OTP sent successfully' };
  }

  /**
   * Verify OTP
   */
  static async verifyOTP(email: string, otp: string) {
    const storedOtp = await redis.get(`otp:${email}`);

    if (!storedOtp) {
      return { success: false, message: 'OTP expired or not found' };
    }

    if (storedOtp !== otp) {
      return { success: false, message: 'Invalid OTP' };
    }

    // OTP is valid, remove it
    await redis.del(`otp:${email}`);

    // Get user details from profile tables
    let userData = null;

    // Check students
    const { data: student } = await supabase
      .from('student_profiles')
      .select('user_id, full_name, role')
      .eq('email', email)
      .maybeSingle();

    if (student) {
      userData = { id: student.user_id, name: student.full_name, role: student.role || 'student' };
    } else {
      // Check companies
      const { data: company } = await supabase
        .from('company_profiles')
        .select('user_id, company_name, role')
        .eq('email', email)
        .maybeSingle();
      
      if (company) {
        userData = { id: company.user_id, name: company.company_name, role: company.role || 'company' };
      }
    }

    if (!userData) {
      return { success: false, message: 'User not found in profile tables' };
    }

    // Generate JWT for the CLI agent
    const token = jwt.sign(
      { 
        sub: userData.id, 
        email: email,
        role: userData.role
      }, 
      env.JWT_SECRET, 
      { expiresIn: '30d' } // Long lived for CLI
    );

    return { 
      success: true, 
      token, 
      user: {
        id: userData.id,
        email: email,
        name: userData.name
      }
    };
  }
}
