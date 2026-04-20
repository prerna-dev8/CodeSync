import transporter from '../config/mailer';
const CLIENT = process.env.CLIENT_URL || 'http://localhost:3000';
const FROM = `"CodeSync" <${process.env.SMTP_USER}>`;

export const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const link = `${CLIENT}/verify-email?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your CodeSync account',
    html: `
      <h2>Welcome to CodeSync!</h2>
      <p>Click the link below to verify your email address. This link expires in <strong>24 hours</strong>.</p>
      <a href="${link}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email</a>
    `,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const link = `${CLIENT}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your CodeSync password',
    html: `
      <h2>Password Reset</h2>
      <p>Click below to reset your password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${link}" style="background: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
    `,
  });
};

export const sendSessionInviteEmail = async (email: string, token: string, sessionId: string): Promise<void> => {
  const link = `${CLIENT}/join/${sessionId}?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Join CodeSync Session',
    html: `
      <h2>Session Invitation</h2>
      <p>You've been invited to collaborate on a CodeSync session!</p>
      <a href="${link}" style="background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Join Session</a>
    `,
  });
};

