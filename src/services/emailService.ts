import transporter from "../config/mailer";

const FROM = process.env.EMAIL_FROM ?? "CodeSync <no-reply@codesync.dev>";
const CLIENT = process.env.CLIENT_URL ?? "http://localhost:3000";

export const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const link = `${CLIENT}/verify-email?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Verify your CodeSync email",
    html: `
      <h2>Welcome to CodeSync!</h2>
      <p>Click the link below to verify your email address. This link expires in <strong>24 hours</strong>.</p>
      <a href="${link}" style="
        display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;
        text-decoration:none;border-radius:6px;font-weight:600;">
        Verify Email
      </a>
      <p>Or copy this URL into your browser:<br/><small>${link}</small></p>
    `,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const link = `${CLIENT}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: "Reset your CodeSync password",
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${link}" style="
        display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;
        text-decoration:none;border-radius:6px;font-weight:600;">
        Reset Password
      </a>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
};
