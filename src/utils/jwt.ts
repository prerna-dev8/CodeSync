import jwt, { SignOptions } from "jsonwebtoken";
import { JwtPayload } from "../types";

export const signToken = (payload: JwtPayload): string =>
  jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"],
  });

export const verifyToken = (token: string): JwtPayload =>
  jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
