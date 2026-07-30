'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendTokenResponse, generateAccessToken, cookieOptions } = require('../utils/generateToken');
const { AppError } = require('../middleware/errorHandler');

// ── POST /api/v1/auth/register ────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !password) {
      return next(new AppError('Name, email, and password are required.', 400));
    }

    // Only customer and host are self-registerable; admin must be seeded
    const safeRole = ['customer', 'host'].includes(role) ? role : 'customer';

    const exists = await User.findOne({ email });
    if (exists) {
      return next(new AppError('An account with this email already exists.', 409));
    }

    const user = await User.create({ name, email, phone, password, role: safeRole });
    await sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/auth/login ───────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Email and password are required.', 400));
    }

    const user = await User.findOne({ email }).select('+password +refreshToken');
    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Invalid email or password.', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account is deactivated. Contact support.', 403));
    }

    await sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/auth/refresh-token ──────────────────────────
const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return next(new AppError('Refresh token not provided.', 401));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== token) {
      return next(new AppError('Refresh token has been revoked. Please log in.', 401));
    }
    if (!user.isActive) {
      return next(new AppError('Account is deactivated.', 403));
    }

    const accessToken = generateAccessToken(user._id, user.role);
    res.json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/auth/logout ──────────────────────────────────
const logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: '' });
    res.clearCookie('refreshToken', cookieOptions());
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/auth/me ───────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: user.toPublic() });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/auth/update-password ───────────────────────
const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(new AppError('Current password and new password are required.', 400));
    }
    if (newPassword.length < 6) {
      return next(new AppError('New password must be at least 6 characters.', 400));
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return next(new AppError('Current password is incorrect.', 401));
    }

    user.password = newPassword;
    await user.save();
    await sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refreshToken, logout, getMe, updatePassword };
