'use strict';

const nodemailer = require('nodemailer');

/**
 * Create a re-usable transporter using SMTP settings from .env.
 * In development (NODE_ENV=development) falls back to Ethereal
 * (https://ethereal.email) so no real emails are sent.
 */
const createTransporter = async () => {
  if (process.env.NODE_ENV === 'development' &&
      !process.env.EMAIL_SMTP_USER) {
    // Auto-generate an Ethereal test account
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`📧  Ethereal test email: ${testAccount.user}`);
    return transporter;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
    secure: parseInt(process.env.EMAIL_SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    },
  });
};

/**
 * Send an email.
 * @param {Object} options - { to, subject, html, text }
 */
const sendEmail = async (options) => {
  try {
    const transporter = await createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'myroom.in'}" <${process.env.EMAIL_FROM || 'no-reply@myroom.in'}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const info = await transporter.sendMail(mailOptions);

    if (process.env.NODE_ENV === 'development') {
      console.log(`📧  Email preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }

    return info;
  } catch (err) {
    console.error('❌  Email send failed:', err.message);
    throw err;
  }
};

// ── Email template helpers ─────────────────────────────────────

const bookingConfirmationHtml = (booking, user, room) => `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#f9f6ef;padding:32px;">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e8e0d0;">
    <h2 style="color:#1E2A28;margin-bottom:4px;">Booking Confirmed! 🎉</h2>
    <p style="color:#6b7280;margin-top:0;">Your stay at <strong>${room.name}</strong> is confirmed.</p>
    <hr style="border-color:#f0e8d8;margin:24px 0;">
    <table style="width:100%;font-size:14px;color:#374151;">
      <tr><td style="padding:6px 0;color:#9ca3af;">Booking ID</td><td style="text-align:right;font-weight:600;">${booking._id}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af;">Hotel</td><td style="text-align:right;">${room.name}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af;">Location</td><td style="text-align:right;">${room.area}, Deoghar</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af;">Check-in</td><td style="text-align:right;">${new Date(booking.checkIn).toDateString()}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af;">Check-out</td><td style="text-align:right;">${new Date(booking.checkOut).toDateString()}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af;">Guests</td><td style="text-align:right;">${booking.guests}</td></tr>
      <tr><td style="padding:6px 0;color:#9ca3af;">Total Nights</td><td style="text-align:right;">${booking.totalNights}</td></tr>
    </table>
    <hr style="border-color:#f0e8d8;margin:24px 0;">
    <div style="font-size:20px;font-weight:700;color:#A6303A;">Total: ₹${booking.totalPrice.toLocaleString('en-IN')}</div>
    <p style="color:#6b7280;font-size:13px;margin-top:24px;">
      Questions? Reply to this email or WhatsApp us at +91 98725 45474.
    </p>
    <p style="color:#9ca3af;font-size:12px;margin-top:16px;">— myroom.in, Deoghar's trusted booking platform</p>
  </div>
</body>
</html>`;

const contactAckHtml = (name, message) => `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#f9f6ef;padding:32px;">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e8e0d0;">
    <h2 style="color:#1E2A28;">Thanks for reaching out, ${name}! 🙏</h2>
    <p style="color:#6b7280;">We received your message and will get back to you within 24 hours.</p>
    <blockquote style="border-left:3px solid #E8A33D;padding:8px 16px;color:#374151;background:#fffbf0;margin:16px 0;">
      ${message}
    </blockquote>
    <p style="color:#9ca3af;font-size:13px;">— myroom.in Support Team</p>
  </div>
</body>
</html>`;

module.exports = { sendEmail, bookingConfirmationHtml, contactAckHtml };
