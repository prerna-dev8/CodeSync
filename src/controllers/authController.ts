import { Request, Response, NextFunction } from "express";
import passport from "../config/passport";
import * as authService from "../services/authService";
import { AuthRequest, IUser } from "../types";

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.register(req.body); 
    res.status(201).json(result);
  } catch (err) { next(err); }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.verifyEmail(req.query.token as string);
    res.json(result);
  } catch (err) { next(err); }
};

export const resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.resendVerification(req.body.email);
    res.json(result);
  } catch (err) { next(err); }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) { next(err); }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.json(result);
  } catch (err) { next(err); }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.resetPassword(req.query.token as string, req.body.password);
    res.json(result);
  } catch (err) { next(err); }
};

export const me = (req: AuthRequest, res: Response): void => {
  const u = req.user!;
  res.json({ id: u._id, username: u.username, email: u.email, avatar: u.avatar, isVerified: u.isVerified });
};

// ── Google OAuth ──────────────────────────────────────────────────────────────

export const googleAuth = passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false, 
});

export const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate("google", { session: false }, (err: Error, user: IUser) => {
    if (err || !user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }
    const token = authService.issueTokenForOAuthUser(user);
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
  })(req, res, next);
};
