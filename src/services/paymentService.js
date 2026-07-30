'use strict';

const crypto = require('crypto');

/**
 * PaymentService
 * ──────────────────────────────────────────────────────────────
 * Abstraction layer over payment gateways.
 * Set  PAYMENT_GATEWAY=razorpay  or  PAYMENT_GATEWAY=stripe  in .env.
 * All other application code calls this service — never the SDK directly.
 * Switching gateways requires changing ONLY the env var.
 * ──────────────────────────────────────────────────────────────
 */
class PaymentService {
  get gateway() {
    return (process.env.PAYMENT_GATEWAY || 'razorpay').toLowerCase();
  }

  // ── Create Order / Session ─────────────────────────────────

  /**
   * createOrder
   * @param {Object} opts
   *   @param {number}  opts.amount       - Total price in INR (₹)
   *   @param {string}  opts.currency     - Default 'INR'
   *   @param {string}  opts.receipt      - Unique reference (bookingId)
   *   @param {string}  opts.roomName     - Display name for Stripe line-item
   *   @param {Object}  opts.metadata     - Extra key-value pairs for the gateway
   *
   * @returns {Object}
   *   Razorpay: { gateway, orderId, amount, currency, keyId }
   *   Stripe:   { gateway, sessionId, url, amount, currency }
   */
  async createOrder(opts = {}) {
    if (this.gateway === 'stripe') {
      return this._stripeCreateSession(opts);
    }
    return this._razorpayCreateOrder(opts);
  }

  // ── Verify Payment (client-side confirmation) ──────────────

  /**
   * verifyPayment
   * Razorpay: HMAC verification of orderId + paymentId using key_secret.
   * Stripe:   Payment is confirmed via webhook — this method is not used
   *           for Stripe in production but is provided for completeness.
   *
   * @param {Object} data
   *   @param {string} data.orderId    - razorpay_order_id
   *   @param {string} data.paymentId  - razorpay_payment_id
   *   @param {string} data.signature  - razorpay_signature (Razorpay only)
   *
   * @returns {boolean}
   */
  verifyPayment({ orderId, paymentId, signature }) {
    if (this.gateway === 'stripe') {
      // Stripe confirmation happens server-side via webhook
      return true;
    }

    // Razorpay HMAC-SHA256 verification
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(signature, 'hex')
    );
  }

  // ── Webhook Verification ───────────────────────────────────

  /**
   * verifyWebhook
   * @param {Buffer|string} rawBody   - Unparsed request body
   * @param {string}        signature - From request headers
   *
   * @returns {{ valid: boolean, event?: Object, error?: string }}
   */
  verifyWebhook(rawBody, signature) {
    if (this.gateway === 'stripe') {
      return this._stripeVerifyWebhook(rawBody, signature);
    }
    return this._razorpayVerifyWebhook(rawBody, signature);
  }

  // ── Extract Payment ID from Webhook Event ─────────────────

  /**
   * extractPaymentData
   * Normalises gateway-specific webhook payloads into a common shape.
   *
   * @param {Object} event - Parsed webhook event
   * @returns {{ orderId, paymentId, status, amountPaid, currency }}
   */
  extractPaymentData(event) {
    if (this.gateway === 'stripe') {
      const session = event.data?.object ?? {};
      return {
        orderId:   session.id,
        paymentId: session.payment_intent,
        status:    event.type === 'checkout.session.completed' ? 'paid' : 'unpaid',
        amountPaid: session.amount_total ? session.amount_total / 100 : 0,
        currency:   session.currency?.toUpperCase() || 'INR',
      };
    }

    // Razorpay
    const payload = event?.payload?.payment?.entity ?? {};
    return {
      orderId:   payload.order_id,
      paymentId: payload.id,
      status:    payload.status === 'captured' ? 'paid' : payload.status,
      amountPaid: payload.amount ? payload.amount / 100 : 0,
      currency:   payload.currency || 'INR',
    };
  }

  // ── Private: Razorpay ──────────────────────────────────────

  async _razorpayCreateOrder({ amount, currency = 'INR', receipt, metadata = {} }) {
    // Lazy-load SDK to avoid import error when using Stripe
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount:   Math.round(amount * 100), // paise
      currency,
      receipt:  receipt || `rcpt_${Date.now()}`,
      notes:    metadata,
    });

    return {
      gateway:  'razorpay',
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
    };
  }

  _razorpayVerifyWebhook(rawBody, signature) {
    try {
      const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

      const valid = crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex')
      );

      if (!valid) return { valid: false, error: 'Signature mismatch.' };
      const event = JSON.parse(body);
      return { valid: true, event };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  // ── Private: Stripe ────────────────────────────────────────

  async _stripeCreateSession({ amount, currency = 'inr', roomName = 'Hotel Booking', metadata = {} }) {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: roomName, description: 'myroom.in – Hotel Booking, Deoghar' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL}/booking/cancel`,
      metadata,
    });

    return {
      gateway:   'stripe',
      sessionId: session.id,
      url:       session.url,
      amount:    session.amount_total,
      currency:  session.currency?.toUpperCase(),
    };
  }

  _stripeVerifyWebhook(rawBody, signature) {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
      const event  = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return { valid: true, event };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

// Export a singleton — callers don't need to instantiate
module.exports = new PaymentService();
