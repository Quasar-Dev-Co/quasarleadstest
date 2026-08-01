// Simple authentication utility
const SESSION_KEY = "quasarleads_session";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface AuthSession {
  isAuthenticated: boolean;
  loginTime: number;
  expiresAt: number;
  userEmail?: string;
  userId?: string;
  username?: string;
  admin?: boolean;
  verified?: boolean;
}

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  verified?: boolean;
  admin?: boolean;
}

export interface SignupResult {
  success: boolean;
  error?: string;
  user?: any;
  verificationEmailSent?: boolean;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  user?: any;
}

export interface VerifyEmailResult {
  success: boolean;
  error?: string;
  message?: string;
}

export const auth = {
  // Check if user is authenticated
  isAuthenticated(): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;

    const session = this.getSession();
    if (!session) return false;

    const now = Date.now();
    if (now > session.expiresAt) {
      this.logout();
      return false;
    }

    return session.isAuthenticated;
  },

  // Update local session email after successful change
  updateSessionEmail(newEmail: string): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const sessionData = window.localStorage.getItem(SESSION_KEY);
      if (!sessionData) return;
      const session: AuthSession = JSON.parse(sessionData);
      session.userEmail = newEmail;
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
  },

  // Signup with new user credentials
  async signup(username: string, email: string, password: string): Promise<SignupResult> {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          email,
          password
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          user: data.user,
          verificationEmailSent: data.verificationEmailSent
        };
      } else {
        return {
          success: false,
          error: data.error || 'Signup failed'
        };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return {
        success: false,
        error: 'Network error during signup'
      };
    }
  },

  // Verify email with 6-digit code
  async verifyEmail(email: string, code: string): Promise<VerifyEmailResult> {
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error || 'Verification failed' };
      }
    } catch (error) {
      console.error('Verify email error:', error);
      return { success: false, error: 'Network error during verification' };
    }
  },

  // Resend verification code
  async resendVerificationCode(email: string): Promise<VerifyEmailResult> {
    try {
      const response = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error || 'Failed to resend code' };
      }
    } catch (error) {
      console.error('Resend code error:', error);
      return { success: false, error: 'Network error while resending code' };
    }
  },

  // Login with credentials (updated to work with database)
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password
        }),
      });