import { Response, NextFunction } from "express";
import { AuthRequest } from "../types";

export const requireVerified = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.isVerified) {
    res.status(403).json({ message: "Please verify your email address to access this resource." });
    return;
  }
  next();
};
