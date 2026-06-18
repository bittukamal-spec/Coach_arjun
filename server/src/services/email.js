const { Resend } = require('resend');

const FROM = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const resend = getResend();
  await resend.emails.send({
    from: `Arjun <${FROM}>`,
    to: toEmail,
    subject: 'Reset your Arjun password',
    html: `
      <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0A0A15; color: #F1F5F9;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="display: inline-block; width: 40px; height: 40px; background: #7C3AED; border-radius: 10px; line-height: 40px; font-weight: 800; font-size: 18px; color: white;">A</div>
        </div>
        <h2 style="color: #F1F5F9; margin-bottom: 8px; font-size: 20px;">Reset your password</h2>
        <p style="color: #94A3B8; margin-bottom: 24px; line-height: 1.6;">
          You requested a password reset for your Arjun account. Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${resetUrl}" style="display: inline-block; background: #7C3AED; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px;">
            Reset Password →
          </a>
        </div>
        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
          If you didn't request this, ignore this email. Your password won't change.
        </p>
      </div>
    `,
  });
}

async function sendWelcomeEmail(toEmail, name) {
  const resend = getResend();
  const clientUrl = process.env.CLIENT_URL || 'https://arjun.app';
  await resend.emails.send({
    from: `Arjun <${FROM}>`,
    to: toEmail,
    subject: `${name}, your mental performance coach is ready`,
    html: `
      <div style="font-family: 'Poppins', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0A0A15; color: #F1F5F9;">

        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; width: 56px; height: 56px; background: linear-gradient(135deg, #8B5CF6, #6D28D9); border-radius: 16px; line-height: 56px; font-weight: 800; font-size: 28px; color: white; margin-bottom: 16px;">A</div>
          <h1 style="color: #F1F5F9; font-size: 22px; margin: 0 0 6px;">Hey ${name}! 👋</h1>
          <p style="color: #A78BFA; font-weight: 600; margin: 0; font-size: 15px;">I'm Arjun — your mental performance coach.</p>
        </div>

        <p style="color: #94A3B8; line-height: 1.7; margin-bottom: 16px; font-size: 15px;">
          I'm built specifically for Indian athletes. Whether it's pre-match nerves, a string of bad performances, family pressure, or just losing focus — I'm here to help you build a stronger mind.
        </p>

        <p style="color: #94A3B8; line-height: 1.7; margin-bottom: 28px; font-size: 15px;">
          You have <strong style="color: #F1F5F9;">14 days of free access</strong> — no payment card needed.
        </p>

        <div style="background: #12122A; border: 1px solid #2A2A50; border-radius: 16px; padding: 20px; margin-bottom: 28px;">
          <p style="color: #F1F5F9; font-weight: 600; margin: 0 0 14px; font-size: 14px;">Your first 3 steps:</p>
          <p style="color: #94A3B8; margin: 8px 0; font-size: 14px;">1. ✅ Complete your athlete profile <span style="color: #64748B;">(2 min)</span></p>
          <p style="color: #94A3B8; margin: 8px 0; font-size: 14px;">2. 📊 Do your first daily check-in</p>
          <p style="color: #94A3B8; margin: 8px 0; font-size: 14px;">3. 💬 Tell me what's on your mind</p>
        </div>

        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${clientUrl}" style="display: inline-block; background: #7C3AED; color: white; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 700; font-size: 16px;">
            Start Training with Arjun →
          </a>
        </div>

        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
          Arjun · AI Mental Performance Coaching for Indian Athletes
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };
