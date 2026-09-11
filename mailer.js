const nodemailer = require('nodemailer');

// Points at the same Mailpit instance the main project's mail-gate reads
// from (MAIL_CATCHER_BASE_URL) — Mailpit's SMTP listener, plain/no-auth by
// default. Never delivers anywhere real.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '157.173.218.21',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
  ignoreTLS: true,
});

async function sendResetEmail(toEmail, resetUrl) {
  await transporter.sendMail({
    from: '"Demo SaaS" <no-reply@demo-buggy-app.local>',
    to: toEmail,
    subject: 'Reset your password',
    text: `Reset your password: ${resetUrl}`,
    html: `<p>Someone requested a password reset for this account.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}

module.exports = { sendResetEmail };
