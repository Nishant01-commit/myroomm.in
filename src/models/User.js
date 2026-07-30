'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Please provide a valid email address.'],
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^\+?[0-9]{7,15}$/.test(v),
        message: 'Please provide a valid phone number.',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required.'],
      minlength: [6, 'Password must be at least 6 characters.'],
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ['customer', 'host', 'admin'],
        message: 'Role must be customer, host, or admin.',
      },
      default: 'customer',
    },
    avatar: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Stored refresh token (single-device design; swap to array for multi-device)
    refreshToken: {
      type: String,
      select: false,
    },
    // Password reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Index ──────────────────────────────────────────────────────
// userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

// ── Virtual: full avatar URL ───────────────────────────────────
userSchema.virtual('avatarUrl').get(function () {
  if (!this.avatar) return null;
  if (this.avatar.startsWith('http')) return this.avatar;
  return `/uploads/${this.avatar}`;
});

// ── Pre-save: hash password only if changed ────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance method: compare plain password with hash ──────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Instance method: safe public representation ────────────────
userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    avatar: this.avatarUrl,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
