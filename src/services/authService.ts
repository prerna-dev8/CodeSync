import User from "../models/User";
import { signToken } from "../utils/jwt";
import { generateToken, hashToken } from "../utils/crypto";
import { sendVerificationEmail, sendPasswordResetEmail } from "./emailService";
import { IUser } from "../types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

// ── Register ──────────────────────────────────────────────────────────────────

export const register = async (body: {
  username: string;
  email: string;
  password: string;
}): Promise<{ message: string }> => {
  const { username, email, password } = body;

  if (await User.findOne({ email })) {
    throw appError("Email already in use", 409);
  }

  if (await User.findOne({ username })) {
    throw appError("Username already taken", 409);
  }

  const { raw, hashed } = generateToken();

  await User.create({
    username,
    email,
    password,
    isVerified: true, // temporarily skip email verification
    // verificationToken: hashed,
    // verificationTokenExpiry: new Date(Date.now() + ONE_DAY_MS),
  });

  // await sendVerificationEmail(email, raw);

  return { message: "Registration successful. You can now log in." };
};

// ── Verify Email ──────────────────────────────────────────────────────────────

export const verifyEmail = async (token: string): Promise<{ message: string }> => {
  const hashed = hashToken(token);

  const user = await User.findOne({
    verificationToken: hashed,
    verificationTokenExpiry: { $gt: new Date() },
  });

  if (!user) throw appError("Verification link is invalid or has expired", 400);

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();

  return { message: "Email verified successfully. You can now log in." };
};

// ── Resend Verification ───────────────────────────────────────────────────────

export const resendVerification = async (email: string): Promise<{ message: string }> => {
  const user = await User.findOne({ email });
  if (!user) throw appError("No account found with this email", 404);
  if (user.isVerified) throw appError("Email is already verified", 400);

  const { raw, hashed } = generateToken();
  user.verificationToken = hashed;
  user.verificationTokenExpiry = new Date(Date.now() + ONE_DAY_MS);
  await user.save();

  // await sendVerificationEmail(email, raw);
  return { message: "Verification email resent." };
};

// ── Login ─────────────────────────────────────────────────────────────────────

export const login = async (body: {
  email: string;
  password: string;
}): Promise<{ token: string; user: Partial<IUser> }> => {
  const { email, password } = body;

  const user = await User.findOne({ email });
  if (!user || !user.password) throw appError("Invalid credentials", 401);
  if (!(await user.comparePassword(password))) throw appError("Invalid credentials", 401);
  if (!user.isVerified) throw appError("Please verify your email before logging in", 403);

  const token = signToken({ id: String(user._id) });
  return { token, user: sanitize(user) };
};

// ── Google OAuth — issue JWT after passport callback ─────────────────────────

export const issueTokenForOAuthUser = (user: IUser): string =>
  signToken({ id: String(user._id) });

// ── Forgot Password ───────────────────────────────────────────────────────────

export const forgotPassword = async (email: string): Promise<{ message: string }> => {
  const user = await User.findOne({ email });
  // Always respond the same to avoid email enumeration
  if (!user || !user.isVerified) {
    return { message: "If that email exists, a reset link has been sent." };
  }

  const { raw, hashed } = generateToken();
  user.passwordResetToken = hashed;
  user.passwordResetTokenExpiry = new Date(Date.now() + ONE_HOUR_MS);
  await user.save();

  // await sendPasswordResetEmail(email, raw);
  return { message: "If that email exists, a reset link has been sent." };
};

// ── Reset Password ────────────────────────────────────────────────────────────

export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<{ message: string }> => {
  const hashed = hashToken(token);

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetTokenExpiry: { $gt: new Date() },
  });

  if (!user) throw appError("Reset link is invalid or has expired", 400);

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpiry = undefined;
  await user.save();

  return { message: "Password reset successfully. You can now log in." };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const sanitize = (user: IUser): Partial<IUser> => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  avatar: user.avatar,
  isVerified: user.isVerified,
});

const appError = (message: string, statusCode: number): Error =>
  Object.assign(new Error(message), { statusCode });
