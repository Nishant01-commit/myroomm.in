'use strict';

const mongoose = require('mongoose');

const AMENITY_LIST = [
  'AC', 'WiFi', 'Hot Water', 'TV', 'Parking', 'CCTV',
  'Power Backup', 'Kitchen', 'Laundry', 'Room Service',
  'Lift', 'Western Toilet', 'Geyser', 'Mini-Fridge',
];

const landmarkDistanceSchema = new mongoose.Schema(
  {
    landmark:     { type: String, required: true },
    distanceText: { type: String, required: true },  // e.g., "450m" | "2.1km"
    distanceM:    { type: Number, required: true },  // metres (for sorting)
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A room must belong to a host.'],
    },
    name: {
      type: String,
      required: [true, 'Room name is required.'],
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters.'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters.'],
    },

    // ── Location ──────────────────────────────────────────────
    city: {
      type: String,
      default: 'Deoghar',
      trim: true,
    },
    area: {
      type: String,
      required: [true, 'Area / Locality is required.'],
      trim: true,
    },
    address: { type: String, trim: true },

    // GeoJSON point for optional spatial queries
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },

    // Pre-calculated distances to known landmarks
    landmarkDistances: [landmarkDistanceSchema],

    // The landmark that appears as "nearest" (denormalised for quick filter)
    nearestLandmark: { type: String, default: '' },

    // ── Pricing & Capacity ────────────────────────────────────
    pricePerNight: {
      type: Number,
      required: [true, 'Price per night is required.'],
      min: [0, 'Price cannot be negative.'],
    },
    capacity: {
      type: Number,
      required: [true, 'Guest capacity is required.'],
      min: [1, 'Capacity must be at least 1.'],
    },

    // ── Classification ────────────────────────────────────────
    roomType: {
      type: String,
      required: [true, 'Room type is required.'],
      enum: {
        values: ['Couple', 'Family', 'Single', 'Dormitory'],
        message: '{VALUE} is not a valid room type.',
      },
    },

    amenities: {
      type: [String],
      enum: {
        values: AMENITY_LIST,
        message: '{VALUE} is not a recognised amenity.',
      },
      default: [],
    },

    // ── Media ─────────────────────────────────────────────────
    images: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: 'Maximum 10 images allowed per room.',
      },
    },

    // ── Rating (auto-updated by Review model) ─────────────────
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },

    // ── Availability ──────────────────────────────────────────
    isAvailable: { type: Boolean, default: true },
    isFeatured:  { type: Boolean, default: false },

    addedDaysAgo: { type: Number, default: 0 }, // for "newest" sort seed data compatibility
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────
roomSchema.index({ location: '2dsphere' });        // geo queries
roomSchema.index({ city: 1, area: 1 });
roomSchema.index({ pricePerNight: 1 });
roomSchema.index({ roomType: 1 });
roomSchema.index({ isAvailable: 1, rating: -1 });
roomSchema.index({ host: 1 });
roomSchema.index(                                  // full-text search
  { name: 'text', description: 'text', area: 'text' },
  { name: 'RoomTextIndex' }
);

// ── Virtual: formatted price ───────────────────────────────────
roomSchema.virtual('priceFormatted').get(function () {
  return `₹${this.pricePerNight.toLocaleString('en-IN')}/night`;
});

// ── Auto-set addedDaysAgo on create ───────────────────────────
roomSchema.pre('save', function (next) {
  if (this.isNew) this.addedDaysAgo = 0;
  next();
});

module.exports = mongoose.model('Room', roomSchema);
