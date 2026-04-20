import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import * as authService from '../services/authService';
import User from '../models/User';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
// appError is internal; test via thrown Error.statusCode if needed

// Mock email service
jest.mock('../services/emailService');
const mockSendVerificationEmail = sendVerificationEmail as jest.Mock;
const mockSendPasswordResetEmail = sendPasswordResetEmail as jest.Mock;

describe('Auth Service', () => {
  beforeEach(async () => {
    jest.setTimeout(30000);
    await new Promise(r => setTimeout(r, 1000));
    await User.deleteMany({});
  }, 30000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    test('successfully registers new user and sends email', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.register(userData);

      expect(result.message).toBe('Registration successful. Check your email to verify your account.');
      expect(mockSendVerificationEmail).toHaveBeenCalledWith(userData.email, expect.any(String));

      const dbUser = await User.findOne({ email: userData.email });
      expect(dbUser).toBeDefined();
      expect(dbUser?.isVerified).toBe(false);
      expect(dbUser?.verificationToken).toBeDefined();
    });

    test('throws on duplicate email', async () => {
      await User.create({ username: 'existing', email: 'dup@example.com', password: 'pw' });
      
      await expect(
        authService.register({ username: 'new', email: 'dup@example.com', password: 'newpw' })
      ).rejects.toThrow('Email already in use');
    });
  });

  describe('login', () => {
    test('success with valid credentials and verified', async () => {
      const userData = { username: 'loginuser', email: 'login@example.com', password: 'password123' };
      const user = await User.create({ ...userData, isVerified: true });

      const result = await authService.login({ email: userData.email, password: userData.password });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(userData.email);
      expect(result.user.isVerified).toBe(true);
    });

    test('fails unverified user', async () => {
      const user = await User.create({
        username: 'unverified',
        email: 'unverified@example.com',
        password: 'pw',
        isVerified: false,
      });

      await expect(
        authService.login({ email: user.email, password: 'pw' })
      ).rejects.toThrow('Please verify your email before logging in');
    });

    test('fails invalid password', async () => {
      await User.create({ username: 'badpw', email: 'bad@example.com', password: 'correctpw', isVerified: true });

      await expect(
        authService.login({ email: 'bad@example.com', password: 'wrongpw' })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('verifyEmail', () => {
    test('verifies valid token', async () => {
      const user = await User.create({
        username: 'verifyuser',
        email: 'verify@example.com',
        password: 'pw',
        verificationToken: 'test-hashed-token',
        verificationTokenExpiry: new Date(Date.now() + 100000),
      });

      // Simulate raw token (in real, would need crypto reverse, but mock logic)
      const result = await authService.verifyEmail('validrawtoken'); // Logic uses hashToken(raw)

      expect(result.message).toBe('Email verified successfully. You can now log in.');
      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.isVerified).toBe(true);
      expect(updatedUser?.verificationToken).toBeUndefined();
    });

    test('fails expired token', async () => {
      await User.create({
        username: 'expired',
        email: 'expired@example.com',
        password: 'pw',
        verificationToken: 'expiredhash',
        verificationTokenExpiry: new Date(Date.now() - 1000),
      });

      await expect(authService.verifyEmail('expiredraw')).rejects.toThrow('Verification link is invalid or has expired');
    });
  });

  // Similar comprehensive tests for resendVerification, forgotPassword, resetPassword...
  describe('forgotPassword', () => {
    test('sends reset email for existing verified user', async () => {
      await User.create({
        username: 'resetuser',
        email: 'reset@example.com',
        password: 'pw',
        isVerified: true,
      });

      const result = await authService.forgotPassword('reset@example.com');
      expect(result.message).toBe('If that email exists, a reset link has been sent.');
      expect(mockSendPasswordResetEmail).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    test('resets with valid token', async () => {
      const user = await User.create({
        username: 'resetpw',
        email: 'resetpw@example.com',
        password: 'oldpw',
        isVerified: true,
        passwordResetToken: 'validresethash',
        passwordResetTokenExpiry: new Date(Date.now() + 100000),
      });

      const result = await authService.resetPassword('validresetraw', 'newpassword123');
      expect(result.message).toBe('Password reset successfully. You can now log in.');

      const updated = await User.findById(user._id);
      expect(await updated?.comparePassword('newpassword123')).toBe(true);
      expect(updated?.passwordResetToken).toBeUndefined();
    });
  });
});

