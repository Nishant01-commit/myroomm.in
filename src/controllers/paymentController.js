'use strict';

const Booking        = require('../models/Booking');
const paymentService = require('../services/paymentService');
const { AppError }   = require('../middleware/errorHandler');

// ── POST /api/v1/payments/create-checkout-session ─────────────
const createCheckoutSession = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return next(new AppError('bookingId is required.', 400));

    const booking = await Booking.findById(bookingId)
      .populate('room', 'name area pricePerNight')
      .populate('customer', 'name email');

    if (!booking) return next(new AppError('Booking not found.', 404));

    if (booking.customer._id.toString() !== req.user._id.toString()) {
      return next(new AppError('You can only pay for your own bookings.', 403));
    }
    if (booking.paymentStatus === 'paid') {
      return next(new AppError('This booking has already been paid.', 400));
    }
    if (booking.status === 'cancelled') {
      return next(new AppError('Cannot pay for a cancelled booking.', 400));
    }

    const order = await paymentService.createOrder({
      amount:   booking.totalPrice,
      currency: 'INR',
      receipt:  booking._id.toString(),
      roomName: `${booking.room.name} — ${booking.room.area}, Deoghar`,
      metadata: {
        bookingId: booking._id.toString(),
        userId:    req.user._id.toString(),
      },
    });

    // Store the gateway order/session ID on the booking
    booking.paymentOrderId  = order.orderId || order.sessionId;
    booking.paymentGateway  = order.gateway;
    await booking.save({ validateBeforeSave: false });

    res.json({
      success: true,
      data: {
        ...order,
        bookingId:     booking._id,
        totalPrice:    booking.totalPrice,
        customerName:  booking.customer.name,
        customerEmail: booking.customer.email,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/payments/verify (Razorpay client-side confirm) ─
const verifyPayment = async (req, res, next) => {
  try {
    const { bookingId, orderId, paymentId, signature } = req.body;

    if (!bookingId || !orderId || !paymentId || !signature) {
      return next(new AppError('bookingId, orderId, paymentId, and signature are required.', 400));
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(new AppError('Booking not found.', 404));

    if (booking.customer.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorised.', 403));
    }

    // HMAC verification
    const isValid = paymentService.verifyPayment({ orderId, paymentId, signature });
    if (!isValid) {
      return next(new AppError('Payment signature verification failed. Contact support.', 400));
    }

    booking.paymentStatus    = 'paid';
    booking.paymentId        = paymentId;
    booking.paymentSignature = signature;
    booking.status           = 'confirmed';
    await booking.save();

    res.json({ success: true, message: 'Payment verified. Booking confirmed!', data: booking });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/payments/webhook ─────────────────────────────
/**
 * Handles async webhook events from Razorpay / Stripe.
 * The raw body is preserved by the app-level middleware for signature verification.
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] ||
                      req.headers['stripe-signature'];

    if (!signature) {
      return next(new AppError('Missing webhook signature.', 400));
    }

    const { valid, event, error } = paymentService.verifyWebhook(req.body, signature);

    if (!valid) {
      console.error('Webhook verification failed:', error);
      return next(new AppError('Webhook signature invalid.', 400));
    }

    // Normalise across gateways
    const { orderId, paymentId, status, amountPaid } = paymentService.extractPaymentData(event);

    if (status === 'paid' && orderId) {
      const booking = await Booking.findOne({ paymentOrderId: orderId });
      if (booking && booking.paymentStatus !== 'paid') {
        booking.paymentStatus = 'paid';
        booking.paymentId     = paymentId;
        booking.status        = 'confirmed';
        await booking.save();
        console.log(`✅  Webhook: booking ${booking._id} marked PAID (₹${amountPaid})`);
      }
    }

    // Always respond 200 quickly so the gateway stops retrying
    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/payments/status/:bookingId ────────────────────
const getPaymentStatus = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .select('paymentStatus paymentId status totalPrice paymentGateway')
      .lean();

    if (!booking) return next(new AppError('Booking not found.', 404));
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

module.exports = { createCheckoutSession, verifyPayment, handleWebhook, getPaymentStatus };
