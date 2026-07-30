'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const path = require('path');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');

// ── Route imports ──────────────────────────────────────────────
const authRoutes    = require('./routes/authRoutes');
const userRoutes    = require('./routes/userRoutes');
const roomRoutes    = require('./routes/roomRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const supportRoutes = require('./routes/supportRoutes');

const app = express();

// ── Trust proxy (needed when behind Nginx / Heroku / Railway) ──
app.set('trust proxy', 1);

// ── Security headers ───────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:5173',   // Vite dev server
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// ── Stripe webhook must receive RAW body — register BEFORE json parser ──
app.use(
  '/api/v1/payments/webhook',
  express.raw({ type: 'application/json' })
);

// ── Body parsers ───────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── Mongo injection sanitization ──────────────────────────────
app.use(mongoSanitize());

// ── HTTP request logging (dev only) ───────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Static files for local uploads ────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Health check ───────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'myroomm.in API is operational',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to MyRoom API',
        docs: '/api/v1/health'
    });
});

// ── Mount routes ───────────────────────────────────────────────
app.use('/api/v1/auth',     authLimiter, authRoutes);
app.use('/api/v1/users',    apiLimiter,  userRoutes);
app.use('/api/v1/rooms',    apiLimiter,  roomRoutes);
app.use('/api/v1/bookings', apiLimiter,  bookingRoutes);
app.use('/api/v1/payments', apiLimiter,  paymentRoutes);
app.use('/api/v1/support',  apiLimiter,  supportRoutes);

// ── 404 & global error handler ────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;

