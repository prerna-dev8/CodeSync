import crypto from "crypto";

export const generateToken = (): { raw: string; hashed: string } => {
  const raw = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hashed };
};

export const hashToken = (raw: string): string =>
  crypto.createHash("sha256").update(raw).digest("hex");
