const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

async function sendPasswordResetEmail(toEmail, resetUrl) {
  await resend.emails.send({
    from: `Arjun from MindGame <${FROM}>`,
    to: toEmail,
    subject: 'Reset your MindGame password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #555; margin-bottom: 24px;">
          Hi! You requested a password reset for your MindGame account. Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
          Reset Password
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          If you didn't request this, ignore this email. Your password won't change.
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail };
