'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorHandler');

/**
 * protect
 * Validates the Bearer access token from the Authorization header.
 * Attaches the authenticated user to req.user.
 */
const protect = async (req, res, next) => {
  try {
    // 1. Extract token
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401));
    }

    // 2. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return next(new AppError('Your session has expired. Please log in again.', 401));
      }
      return next(new AppError('Invalid authentication token.', 401));
    }

    // 3. Check user still exists & is active
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user) {
      return next(new AppError('User no longer exists.', 401));
    }
    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated.', 403));
    }

    // 4. Attach to request
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * optionalAuth
 * Attaches user to req.user if a valid token is present, but does NOT
 * block the request if no token is provided.  Useful for public routes
 * that return extra data for authenticated users.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(); // invalid token → treat as anonymous
    }

    const user = await User.findById(decoded.id);
    if (user && user.isActive) req.user = user;
    next();
  } catch {
    next();
  }
};

module.exports = { protect, optionalAuth };
