import { Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import User from "../models/User";
import { AuthRequest } from "../types";

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    const decoded = verifyToken(header.split(" ")[1]);
    const user = await User.findById(decoded.id).select("-password -verificationToken -passwordResetToken");
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
