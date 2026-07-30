'use strict';

const Review = require('../models/Review');
const Booking = require('../models/Booking');
const { AppError } = require('../middleware/errorHandler');
const { sendEmail, contactAckHtml } = require('../config/email');

// ── POST /api/v1/support/contact ──────────────────────────────
const submitContact = async (req, res, next) => {
  try {
    const { name, email, phone, message, subject } = req.body;

    if (!name || !email || !message) {
      return next(new AppError('name, email, and message are required.', 400));
    }

    // Forward to admin email
    const adminEmail = process.env.EMAIL_SMTP_USER;
    if (adminEmail) {
      await sendEmail({
        to:      adminEmail,
        subject: `[myroom.in Contact] ${subject || 'New Enquiry'} – ${name}`,
        html: `
          <div style="font-family:Inter,sans-serif;padding:24px;">
            <h3>New Contact Form Submission</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
            <p><strong>Subject:</strong> ${subject || 'N/A'}</p>
            <p><strong>Message:</strong></p>
            <blockquote>${message}</blockquote>
          </div>`,
      }).catch((e) => console.error('Admin email error:', e.message));
    }

    // Send acknowledgement to user
    await sendEmail({
      to:      email,
      subject: 'We received your message – myroom.in',
      html:    contactAckHtml(name, message),
    }).catch((e) => console.error('Ack email error:', e.message));

    res.status(201).json({
      success: true,
      message: 'Your message has been received. We will get back to you within 24 hours.',
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/support/feedback ─────────────────────────────
/**
 * Platform-level feedback (not tied to a room).
 * Optional: if user is logged in, they can submit.
 * If anonymous, we still accept it.
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || !comment) {
      return next(new AppError('rating and comment are required.', 400));
    }
    if (rating < 1 || rating > 5) {
      return next(new AppError('Rating must be between 1 and 5.', 400));
    }

    // Must be authenticated
    if (!req.user) {
      return next(new AppError('Please log in to submit feedback.', 401));
    }

    const feedback = await Review.create({
      reviewer: req.user._id,
      rating:   parseInt(rating, 10),
      comment:  comment.trim(),
      type:     'platform',
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback!',
      data: feedback,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/support/reviews ──────────────────────────────
/**
 * Submit a room review after a completed stay.
 * Linked to a specific booking to prevent fake reviews.
 */
const submitRoomReview = async (req, res, next) => {
  try {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating || !comment) {
      return next(new AppError('bookingId, rating, and comment are required.', 400));
    }

    const booking = await Booking.findById(bookingId).populate('room');
    if (!booking) return next(new AppError('Booking not found.', 404));

    if (booking.customer.toString() !== req.user._id.toString()) {
      return next(new AppError('You can only review your own stays.', 403));
    }
    if (booking.status !== 'completed') {
      return next(new AppError('Reviews can only be submitted after check-out.', 400));
    }

    const review = await Review.create({
      reviewer: req.user._id,
      room:     booking.room._id,
      booking:  booking._id,
      rating:   parseInt(rating, 10),
      comment:  comment.trim(),
      type:     'room',
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) {
    // Duplicate review (index violation)
    if (err.code === 11000) {
      return next(new AppError('You have already submitted a review for this booking.', 409));
    }
    next(err);
  }
};

// ── GET /api/v1/support/reviews/:roomId ───────────────────────
const getRoomReviews = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(20, parseInt(req.query.limit || '10', 10));
    const skip  = (page - 1) * limit;

    const [total, reviews] = await Promise.all([
      Review.countDocuments({ room: req.params.roomId, type: 'room', isApproved: true }),
      Review.find({ room: req.params.roomId, type: 'room', isApproved: true })
        .populate('reviewer', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: reviews });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitContact, submitFeedback, submitRoomReview, getRoomReviews };
