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
  const firstName = name ? name.trim().split(' ')[0] : 'there';
  await resend.emails.send({
    from: `Arjun <${FROM}>`,
    to: toEmail,
    subject: 'Welcome to Arjun — your account is ready',
    html: `
      <div style="font-family: 'Poppins', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FFFFFF; color: #1A1A1A;">
        <p style="font-weight: 700; font-size: 16px; color: #185FA5; margin: 0 0 24px;">Arjun</p>

        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>

        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Your Arjun account is ready.</p>

        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px; color: #4B5563;">
          Open Arjun whenever you want to work on focus, pressure, confidence or preparing for training and competition.
        </p>

        <div style="margin-bottom: 24px;">
          <a href="${clientUrl}" style="display: inline-block; background: #185FA5; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Open Arjun
          </a>
        </div>

        <p style="font-size: 13px; line-height: 1.6; color: #6B7280; margin: 0 0 24px;">
          Tip: You can install Arjun on your phone from your browser menu and use it like an app.
        </p>

        <p style="font-size: 15px; margin: 0;">— Arjun</p>
      </div>
    `,
  });
}

async function sendDeletionEmail(toEmail, firstName) {
  const resend = getResend();
  await resend.emails.send({
    from: `Arjun <${FROM}>`,
    to: toEmail,
    subject: 'Your Arjun account has been deleted',
    html: `
      <div style="font-family: 'Poppins', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0A0A15; color: #F1F5F9;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="display: inline-block; width: 40px; height: 40px; background: #7C3AED; border-radius: 10px; line-height: 40px; font-weight: 800; font-size: 18px; color: white;">A</div>
        </div>
        <h2 style="color: #F1F5F9; margin-bottom: 8px; font-size: 20px;">Account deleted</h2>
        <p style="color: #94A3B8; margin-bottom: 16px; line-height: 1.6;">
          Hi ${firstName}, your Arjun account and all associated data have been permanently deleted as requested.
        </p>
        <p style="color: #94A3B8; margin-bottom: 24px; line-height: 1.6;">
          If you ever want to come back, you can create a new account at any time. Take care of yourself.
        </p>
        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
          Arjun · AI Mental Performance Coaching for Indian Athletes
        </p>
      </div>
    `,
  });
}

async function sendGuardianConsentEmail(toEmail, athleteName, consentUrl) {
  const resend = getResend();
  const firstName = athleteName ? athleteName.split(' ')[0] : 'your child';
  await resend.emails.send({
    from: `Arjun <${FROM}>`,
    to: toEmail,
    subject: `${firstName} needs your permission to use Arjun`,
    html: `
      <div style="font-family: 'Poppins', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0A0A15; color: #F1F5F9;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="display: inline-block; width: 40px; height: 40px; background: #185FA5; border-radius: 10px; line-height: 40px; font-weight: 800; font-size: 18px; color: white;">A</div>
        </div>
        <h2 style="color: #F1F5F9; margin-bottom: 8px; font-size: 20px;">Parent / guardian consent needed</h2>
        <p style="color: #94A3B8; margin-bottom: 16px; line-height: 1.7; font-size: 15px;">
          <strong style="color: #F1F5F9;">${firstName}</strong> has created an account on <strong style="color: #F1F5F9;">Arjun</strong> —
          a mental performance coaching app for young Indian athletes. Arjun helps athletes handle match nerves,
          bounce back from mistakes, and build focus. It is performance coaching, <strong style="color: #F1F5F9;">not therapy or medical advice</strong>.
        </p>
        <p style="color: #94A3B8; margin-bottom: 24px; line-height: 1.7; font-size: 15px;">
          Because ${firstName} is under 18, we need your consent before they can use Arjun's coaching tools.
          If you approve, tap the button below.
        </p>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${consentUrl}" style="display: inline-block; background: #185FA5; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px;">
            I give my consent →
          </a>
        </div>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.6; margin-bottom: 16px;">
          What Arjun stores: the athlete's name, email, sport, and their coaching activity inside the app.
          You can ask for the account and all data to be deleted at any time from the app's Account page.
        </p>
        <p style="color: #475569; font-size: 12px; text-align: center; margin: 0;">
          If you do not approve, ignore this email — ${firstName}'s coaching tools will stay locked.<br/>
          Arjun · AI Mental Performance Coaching for Indian Athletes · coacharjun.in
        </p>
      </div>
    `,
  });
}

// Minimal HTML-escaping for values interpolated into the hand-built markup
// below. The contact form is the one email built from untrusted visitor
// input (name/email/message), so this keeps that text inert instead of
// live markup — plain text in, plain text rendered.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Public contact form → internal notification, sent to CONTACT_TO_EMAIL.
// Reply-To is the visitor's own (already-validated) address so the founder
// can just hit reply; the From address stays Arjun's verified sender —
// never spoofed to the visitor's address.
async function sendContactEmail({ name, email, reason, reasonLabel, message }) {
  const resend = getResend();
  const to = process.env.CONTACT_TO_EMAIL;
  if (!to) throw new Error('CONTACT_TO_EMAIL is not configured');

  const submittedAt = new Date().toISOString();
  await resend.emails.send({
    from: `Arjun <${FROM}>`,
    to,
    replyTo: email,
    subject: `Arjun contact — ${reasonLabel}`,
    html: `
      <div style="font-family: 'Poppins', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0A0A15; color: #F1F5F9;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; width: 40px; height: 40px; background: #185FA5; border-radius: 10px; line-height: 40px; font-weight: 800; font-size: 18px; color: white;">A</div>
        </div>
        <h2 style="color: #F1F5F9; margin-bottom: 16px; font-size: 20px;">New contact message</h2>
        <p style="color: #94A3B8; margin: 4px 0; font-size: 14px;"><strong style="color: #F1F5F9;">Name:</strong> ${escapeHtml(name)}</p>
        <p style="color: #94A3B8; margin: 4px 0; font-size: 14px;"><strong style="color: #F1F5F9;">Email:</strong> ${escapeHtml(email)}</p>
        <p style="color: #94A3B8; margin: 4px 0; font-size: 14px;"><strong style="color: #F1F5F9;">Reason:</strong> ${escapeHtml(reasonLabel)}</p>
        <p style="color: #94A3B8; margin: 16px 0 4px; font-size: 14px;"><strong style="color: #F1F5F9;">Message:</strong></p>
        <p style="color: #F1F5F9; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</p>
        <p style="color: #475569; font-size: 12px; margin-top: 24px;">Submitted ${escapeHtml(submittedAt)}</p>
      </div>
    `,
  });
}

module.exports = {
  sendPasswordResetEmail, sendWelcomeEmail, sendDeletionEmail, sendGuardianConsentEmail,
  sendContactEmail,
};
