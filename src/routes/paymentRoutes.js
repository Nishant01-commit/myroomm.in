'use strict';

const { Router } = require('express');
const {
  createCheckoutSession, verifyPayment,
  handleWebhook, getPaymentStatus,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Webhook — raw body handled in app.js, no auth
router.post('/webhook', webhookLimiter, handleWebhook);

// Protected
router.post('/create-checkout-session', protect, createCheckoutSession);
router.post('/verify',                  protect, verifyPayment);
router.get('/status/:bookingId',        protect, getPaymentStatus);

module.exports = router;
