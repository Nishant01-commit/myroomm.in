/**
 * ╔═══════════════════════════════════════════════════════════╗
 *   myroom.in — Frontend API Client
 *   Drop this file next to your HTML and add:
 *   <script src="./api.js"></script>
 *
 *   Then use the global `api` object:
 *     const rooms = await api.getRooms({ landmark: 'Tower Chowk' });
 * ╚═══════════════════════════════════════════════════════════╝
 */

const API_BASE = 'http://localhost:5000/api/v1'; // ← Change to your deployed URL in production

class MyroomAPI {
  constructor(baseURL) {
    this.base  = baseURL;
    // Access token lives only in memory (most XSS-safe approach).
    // We use an httpOnly cookie for the refresh token — the browser handles it automatically.
    this._token = null;
    // Restore from sessionStorage so page refresh doesn't log out during dev.
    this._token = sessionStorage.getItem('mrAccessToken') || null;
    this._user  = JSON.parse(sessionStorage.getItem('mrUser') || 'null');
  }

  // ── Internal helpers ───────────────────────────────────────

  _headers(withAuth = true) {
    const h = { 'Content-Type': 'application/json' };
    if (withAuth && this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  }

  async _request(method, path, body = null, useAuth = true) {
    const opts = {
      method,
      headers: this._headers(useAuth),
      credentials: 'include', // sends the refresh-token cookie automatically
    };
    if (body !== null) opts.body = JSON.stringify(body);

    let res = await fetch(`${this.base}${path}`, opts);

    // ── Auto-refresh access token on 401 ──────────────────
    if (res.status === 401 && path !== '/auth/refresh-token' && path !== '/auth/login') {
      const refreshed = await this._refreshToken();
      if (refreshed) {
        opts.headers = this._headers(true); // new token
        res = await fetch(`${this.base}${path}`, opts);
      } else {
        this._clearSession();
        window.dispatchEvent(new CustomEvent('mr:sessionExpired'));
        throw new Error('Session expired. Please log in again.');
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
  }

  async _refreshToken() {
    try {
      const data = await this._request('POST', '/auth/refresh-token', null, false);
      if (data?.accessToken) {
        this._setToken(data.accessToken);
        return true;
      }
    } catch { /* silent */ }
    return false;
  }

  _setToken(token) {
    this._token = token;
    sessionStorage.setItem('mrAccessToken', token);
  }

  _setUser(user) {
    this._user = user;
    sessionStorage.setItem('mrUser', JSON.stringify(user));
  }

  _clearSession() {
    this._token = null;
    this._user  = null;
    sessionStorage.removeItem('mrAccessToken');
    sessionStorage.removeItem('mrUser');
  }

  // ── Public state helpers ───────────────────────────────────

  isLoggedIn()  { return !!this._token; }
  currentUser() { return this._user; }
  userRole()    { return this._user?.role || null; }

  // ── AUTH ──────────────────────────────────────────────────

  /**
   * Register a new account.
   * @param {string} name
   * @param {string} email
   * @param {string} password
   * @param {string} role  — 'customer' | 'host'
   * @param {string} [phone]
   */
  async register(name, email, password, role = 'customer', phone = '') {
    const data = await this._request('POST', '/auth/register', { name, email, password, role, phone }, false);
    this._setToken(data.accessToken);
    this._setUser(data.data);
    window.dispatchEvent(new CustomEvent('mr:authChange', { detail: data.data }));
    return data;
  }

  /**
   * Log in with email + password.
   */
  async login(email, password) {
    const data = await this._request('POST', '/auth/login', { email, password }, false);
    this._setToken(data.accessToken);
    this._setUser(data.data);
    window.dispatchEvent(new CustomEvent('mr:authChange', { detail: data.data }));
    return data;
  }

  /**
   * Log out current user.
   */
  async logout() {
    try { await this._request('POST', '/auth/logout'); } catch { /* ignore */ }
    this._clearSession();
    window.dispatchEvent(new CustomEvent('mr:authChange', { detail: null }));
  }

  /**
   * Get current user profile.
   */
  async getMe() {
    const data = await this._request('GET', '/auth/me');
    this._setUser(data.data);
    return data.data;
  }

  /**
   * Update password.
   */
  async updatePassword(currentPassword, newPassword) {
    return this._request('PATCH', '/auth/update-password', { currentPassword, newPassword });
  }

  // ── ROOMS ─────────────────────────────────────────────────

  /**
   * Fetch room listings with optional filters.
   *
   * @param {Object} filters
   *   city, landmark, area, roomType, minPrice, maxPrice,
   *   guests, rating, search, sort, page, limit
   */
  async getRooms(filters = {}) {
    const params = new URLSearchParams();
    // Always default to Deoghar
    params.set('city', filters.city || 'Deoghar');
    const optionals = ['landmark', 'area', 'roomType', 'minPrice', 'maxPrice',
                       'guests', 'rating', 'search', 'sort', 'page', 'limit'];
    optionals.forEach((k) => {
      if (filters[k] !== undefined && filters[k] !== '' && filters[k] !== 'All') {
        params.set(k, filters[k]);
      }
    });
    return this._request('GET', `/rooms?${params}`, null, false);
  }

  /**
   * Get a single room by ID.
   */
  async getRoomById(id) {
    const data = await this._request('GET', `/rooms/${id}`, null, false);
    return data.data;
  }

  /**
   * Get booked date ranges for calendar blocking.
   */
  async getRoomAvailability(id) {
    const data = await this._request('GET', `/rooms/${id}/availability`, null, false);
    return data;
  }

  /**
   * Create a new room listing (host only).
   * @param {FormData} formData — includes 'images' files
   */
  async createRoom(formData) {
    // FormData: do NOT set Content-Type — browser sets multipart boundary
    const res = await fetch(`${this.base}/rooms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this._token}` },
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create room.');
    return data;
  }

  /**
   * Update a room listing (host/admin only).
   */
  async updateRoom(id, updates) {
    return this._request('PUT', `/rooms/${id}`, updates);
  }

  /**
   * Delete a room listing (host/admin only).
   */
  async deleteRoom(id) {
    return this._request('DELETE', `/rooms/${id}`);
  }

  // ── BOOKINGS ──────────────────────────────────────────────

  /**
   * Create a new booking.
   *
   * @param {string} roomId
   * @param {string} checkIn   — ISO date string e.g. "2025-12-01"
   * @param {string} checkOut  — ISO date string
   * @param {number} guests
   * @param {string} [specialRequests]
   */
  async createBooking(roomId, checkIn, checkOut, guests, specialRequests = '') {
    const data = await this._request('POST', '/bookings', {
      roomId, checkIn, checkOut,
      guests: parseInt(guests, 10),
      specialRequests,
    });
    return data.data;
  }

  /**
   * Fetch all bookings for the logged-in customer.
   * @param {Object} [opts] — { status, page, limit }
   */
  async getMyBookings(opts = {}) {
    const params = new URLSearchParams(opts);
    return this._request('GET', `/bookings/my-bookings?${params}`);
  }

  /**
   * Get a single booking by ID.
   */
  async getBookingById(id) {
    const data = await this._request('GET', `/bookings/${id}`);
    return data.data;
  }

  /**
   * Cancel a booking.
   * @param {string} id
   * @param {string} [reason]
   */
  async cancelBooking(id, reason = '') {
    return this._request('PATCH', `/bookings/${id}/cancel`, { reason });
  }

  // ── PAYMENTS ──────────────────────────────────────────────

  /**
   * Initialize a payment order/session for a pending booking.
   * Returns gateway-specific data (orderId for Razorpay, url for Stripe).
   *
   * @param {string} bookingId
   */
  async createCheckoutSession(bookingId) {
    const data = await this._request('POST', '/payments/create-checkout-session', { bookingId });
    return data.data;
  }

  /**
   * Verify Razorpay payment on the server after client-side success callback.
   *
   * @param {string} bookingId
   * @param {string} orderId    — razorpay_order_id
   * @param {string} paymentId  — razorpay_payment_id
   * @param {string} signature  — razorpay_signature
   */
  async verifyPayment(bookingId, orderId, paymentId, signature) {
    return this._request('POST', '/payments/verify', { bookingId, orderId, paymentId, signature });
  }

  /**
   * Check payment status for a booking.
   */
  async getPaymentStatus(bookingId) {
    const data = await this._request('GET', `/payments/status/${bookingId}`);
    return data.data;
  }

  /**
   * Convenience: open Razorpay checkout in a popup.
   * Call after createCheckoutSession().
   *
   * @param {Object}   session   — result of createCheckoutSession()
   * @param {Function} onSuccess — callback({ bookingId, orderId, paymentId, signature })
   * @param {Function} onFailure — callback(error)
   */
  openRazorpay(session, onSuccess, onFailure) {
    if (!window.Razorpay) {
      return onFailure(new Error('Razorpay SDK not loaded. Add <script src="https://checkout.razorpay.com/v1/checkout.js"></script>'));
    }
    const rzp = new window.Razorpay({
      key:         session.keyId,
      amount:      session.amount,
      currency:    session.currency || 'INR',
      order_id:    session.orderId,
      name:        'myroom.in',
      description: 'Hotel Booking – Deoghar',
      image:       '/favicon.ico',
      prefill: {
        name:    this._user?.name || '',
        email:   this._user?.email || '',
        contact: this._user?.phone || '',
      },
      theme: { color: '#A6303A' },
      handler: (response) => {
        onSuccess({
          bookingId: session.bookingId,
          orderId:   response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => onFailure(new Error('Payment cancelled by user.')),
      },
    });
    rzp.open();
  }

  // ── DASHBOARD ─────────────────────────────────────────────

  /**
   * Fetch role-specific dashboard data.
   * Returns different shape for customer / host / admin.
   */
  async getDashboard() {
    const data = await this._request('GET', '/users/dashboard');
    return data.data;
  }

  // ── SUPPORT ───────────────────────────────────────────────

  /**
   * Submit the contact form (public — no auth required).
   */
  async sendContact({ name, email, phone, subject, message }) {
    return this._request('POST', '/support/contact', { name, email, phone, subject, message }, false);
  }

  /**
   * Submit platform feedback (requires login).
   */
  async submitFeedback({ rating, comment }) {
    return this._request('POST', '/support/feedback', { rating, comment });
  }

  /**
   * Submit a room review after a completed stay (requires login).
   */
  async submitRoomReview({ bookingId, rating, comment }) {
    return this._request('POST', '/support/reviews', { bookingId, rating, comment });
  }

  /**
   * Fetch reviews for a specific room (public).
   */
  async getRoomReviews(roomId, opts = {}) {
    const params = new URLSearchParams(opts);
    const data = await this._request('GET', `/support/reviews/${roomId}?${params}`, null, false);
    return data;
  }
}

// ── Singleton export ───────────────────────────────────────────
const api = new MyroomAPI(API_BASE);

// Make it available globally (vanilla JS) and as ES module
if (typeof window !== 'undefined') window.api = api;
if (typeof module !== 'undefined') module.exports = api;
