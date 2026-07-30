'use strict';

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Booking must have a customer.'],
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: [true, 'Booking must reference a room.'],
    },

    // ── Dates ─────────────────────────────────────────────────
    checkIn: {
      type: Date,
      required: [true, 'Check-in date is required.'],
    },
    checkOut: {
      type: Date,
      required: [true, 'Check-out date is required.'],
      validate: {
        validator: function (v) { return v > this.checkIn; },
        message: 'Check-out date must be after check-in date.',
      },
    },
    totalNights: { type: Number },          // auto-calculated in pre-save

    // ── Guests & Pricing ──────────────────────────────────────
    guests: {
      type: Number,
      required: [true, 'Number of guests is required.'],
      min: [1, 'At least 1 guest is required.'],
    },
    pricePerNight: { type: Number, required: true }, // snapshot at booking time
    totalPrice:    { type: Number, required: true },

    // ── Status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },

    // ── Payment ───────────────────────────────────────────────
    paymentGateway: {
      type: String,
      enum: ['razorpay', 'stripe', 'upi', 'cash', 'none'],
      default: 'none',
    },
    paymentOrderId:     { type: String }, // gateway order / session id
    paymentId:          { type: String }, // gateway payment / charge id
    paymentSignature:   { type: String }, // Razorpay signature for verification

    // ── Cancellation ──────────────────────────────────────────
    cancellationReason: { type: String },
    cancelledAt:        { type: Date },
    refundAmount:       { type: Number, default: 0 },

    // ── Extras ────────────────────────────────────────────────
    specialRequests: { type: String, maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ paymentOrderId: 1 });

// ── Pre-save: calculate totalNights ───────────────────────────
bookingSchema.pre('save', function (next) {
  if (this.checkIn && this.checkOut) {
    const ms = this.checkOut.getTime() - this.checkIn.getTime();
    this.totalNights = Math.max(1, Math.ceil(ms / 86_400_000));
  }
  next();
});

// ── Static: check for date-range overlap ─────────────────────
/**
 * Returns an existing booking that overlaps [checkIn, checkOut] for the given room,
 * excluding a specific booking ID (useful when modifying a booking).
 *
 * Overlap condition (Allen's interval algebra):
 *   existingCheckIn  < newCheckOut  AND
 *   existingCheckOut > newCheckIn
 */
bookingSchema.statics.findOverlap = function (roomId, checkIn, checkOut, excludeId = null) {
  const query = {
    room: roomId,
    status: { $nin: ['cancelled'] },
    checkIn:  { $lt: new Date(checkOut) },
    checkOut: { $gt: new Date(checkIn) },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return this.findOne(query).lean();
};

// ── Virtual: cancellation refund tier ────────────────────────
bookingSchema.virtual('refundPolicy').get(function () {
  if (!this.checkIn) return null;
  const hoursUntilCheckIn = (this.checkIn - Date.now()) / 3_600_000;
  if (hoursUntilCheckIn >= 48) return { refundPct: 100, label: 'Full refund' };
  if (hoursUntilCheckIn >= 24) return { refundPct: 50,  label: '50% refund' };
  return { refundPct: 0, label: 'No refund' };
});

module.exports = mongoose.model('Booking', bookingSchema);
