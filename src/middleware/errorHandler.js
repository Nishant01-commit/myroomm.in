'use strict';

/**
 * AppError
 * Custom operational error class.  Anything thrown with this is an expected,
 * user-facing error (not a programming bug).  The global handler uses
 * `err.isOperational` to distinguish and avoid leaking stack traces.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Specific Mongoose / JWT error translators ──────────────────

const handleCastError = (err) =>
  new AppError(`Invalid ${err.path}: ${err.value}.`, 400);

const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return new AppError(`Validation failed: ${messages.join(' | ')}`, 400);
};

const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return new AppError(
    `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`,
    409
  );
};

const handleJWTError = () =>
  new AppError('Invalid authentication token. Please log in again.', 401);

const handleJWTExpiredError = () =>
  new AppError('Your session has expired. Please log in again.', 401);

// ── Global error handler ───────────────────────────────────────

const errorHandler = (err, req, res, _next) => {
  let error = { ...err, message: err.message, stack: err.stack };

  // Translate known error types
  if (err.name === 'CastError')            error = handleCastError(err);
  if (err.name === 'ValidationError')      error = handleValidationError(err);
  if (err.code === 11000)                  error = handleDuplicateKeyError(err);
  if (err.name === 'JsonWebTokenError')    error = handleJWTError();
  if (err.name === 'TokenExpiredError')    error = handleJWTExpiredError();

  const statusCode = error.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  // Log unexpected server errors
  if (statusCode >= 500) {
    console.error('❌  Server Error:', {
      message: err.message,
      path: req.path,
      method: req.method,
      ...(isProd ? {} : { stack: err.stack }),
    });
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Something went wrong on our end.',
    ...(isProd ? {} : { stack: error.stack }),
  });
};

// ── 404 handler ───────────────────────────────────────────────

const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

module.exports = { AppError, errorHandler, notFound };
