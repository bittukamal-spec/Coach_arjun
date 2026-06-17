const { Resend } = require('resend');

const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const resend = getResend();
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

async function sendWelcomeEmail(toEmail, name) {
  const resend = getResend();
  const clientUrl = process.env.CLIENT_URL || 'https://mindgame.app';
  await resend.emails.send({
    from: `Arjun from MindGame <${FROM}>`,
    to: toEmail,
    subject: `${name}, I'm Arjun — your mental performance coach`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <span style="font-size: 48px;">🧠</span>
          <h1 style="color: #1a1a2e; font-size: 24px; margin: 12px 0 4px;">Hey ${name}!</h1>
          <p style="color: #6366f1; font-weight: 600; margin: 0;">I'm Arjun, your mental performance coach.</p>
        </div>

        <p style="color: #374151; line-height: 1.7; margin-bottom: 16px;">
          I'm built specifically for Indian athletes — I understand the pressure you face from coaches, family, and yourself. Whether it's pre-match nerves, a string of bad performances, or just losing motivation, I'm here to help you build a stronger mind.
        </p>

        <p style="color: #374151; line-height: 1.7; margin-bottom: 24px;">
          You have <strong>14 days of free access</strong> — no payment card needed. Use it well.
        </p>

        <div style="background: #f0f0ff; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
          <p style="color: #374151; font-weight: 600; margin: 0 0 12px;">Your first 3 steps:</p>
          <p style="color: #555; margin: 6px 0;">1. ✅ Complete your athlete profile (2 min)</p>
          <p style="color: #555; margin: 6px 0;">2. 📊 Do your first daily check-in</p>
          <p style="color: #555; margin: 6px 0;">3. 💬 Tell me what's on your mind</p>
        </div>

        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${clientUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 16px;">
            Start Training with Arjun →
          </a>
        </div>

        <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0;">
          MindGame · Mental Performance Coaching for Indian Athletes
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };
