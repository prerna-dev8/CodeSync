import { Response, NextFunction, Request } from "express";
import { verifyAccessToken } from "../utils/jwt";
import UserModel from "../models/User";
import { AuthRequest } from "../types";
import { requireVerified } from "./requireVerified";

export { requireVerified };
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    const decoded = verifyAccessToken(header.split(" ")[1]);
    const user = await UserModel.findById(decoded.id).select("-password -verificationToken -passwordResetToken") as any;
    if (!user) {
      res.status(401).json({ message: "User not found" });
      return;
    }
    (req as AuthRequest).user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};


