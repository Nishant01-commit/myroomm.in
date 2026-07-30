'use strict';

const rateLimit = require('express-rate-limit');

/**
 * authLimiter — Aggressive limit for auth routes (/login, /register).
 * Prevents brute-force and credential-stuffing attacks.
 * 15 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * apiLimiter — Generous limit for all other API routes.
 * 200 requests per 10-minute window per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * webhookLimiter — Very generous for payment webhooks (called by gateways).
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, apiLimiter, webhookLimiter };
