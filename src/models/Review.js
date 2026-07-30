'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Review must have a reviewer.'],
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    rating: {
      type: Number,
      required: [true, 'Please provide a rating.'],
      min: [1, 'Rating must be at least 1.'],
      max: [5, 'Rating cannot exceed 5.'],
    },
    comment: {
      type: String,
      required: [true, 'Comment is required.'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters.'],
    },
    // 'room' reviews are tied to a specific listing;
    // 'platform' reviews are general site feedback.
    type: {
      type: String,
      enum: ['room', 'platform'],
      default: 'room',
    },
    isApproved: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────
// One review per (reviewer, booking) — prevents duplicate posting
reviewSchema.index({ reviewer: 1, booking: 1 }, { unique: true, sparse: true });
reviewSchema.index({ room: 1, isApproved: 1 });
reviewSchema.index({ type: 1 });

// ── Static: recalculate & persist room's aggregate rating ─────
reviewSchema.statics.recalculateRating = async function (roomId) {
  if (!roomId) return;

  const stats = await this.aggregate([
    { $match: { room: new mongoose.Types.ObjectId(roomId), type: 'room', isApproved: true } },
    {
      $group: {
        _id: '$room',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  const update =
    stats.length > 0
      ? {
          rating: Math.round(stats[0].avgRating * 10) / 10,
          reviewCount: stats[0].count,
        }
      : { rating: 0, reviewCount: 0 };

  await mongoose.model('Room').findByIdAndUpdate(roomId, update);
};

// ── Post-save / post-remove: keep Room in sync ────────────────
reviewSchema.post('save', function () {
  if (this.room) this.constructor.recalculateRating(this.room);
});

reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc?.room) mongoose.model('Review').recalculateRating(doc.room);
});

module.exports = mongoose.model('Review', reviewSchema);
