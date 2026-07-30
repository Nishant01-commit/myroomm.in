'use strict';

const Booking = require('../models/Booking');
const Room    = require('../models/Room');
const { AppError } = require('../middleware/errorHandler');
const { sendEmail, bookingConfirmationHtml } = require('../config/email');

// ── POST /api/v1/bookings ─────────────────────────────────────
/**
 * Creates a new booking after:
 *   1. Validating room exists and is available
 *   2. Checking guest count doesn't exceed capacity
 *   3. Detecting any date-range overlap with existing confirmed bookings
 *   4. Calculating exact total price
 */
const createBooking = async (req, res, next) => {
  try {
    const { roomId, checkIn, checkOut, guests, specialRequests } = req.body;

    if (!roomId || !checkIn || !checkOut || !guests) {
      return next(new AppError('roomId, checkIn, checkOut, and guests are required.', 400));
    }

    const checkInDate  = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const now          = new Date();

    // ── Date sanity ───────────────────────────────────────────
    if (isNaN(checkInDate) || isNaN(checkOutDate)) {
      return next(new AppError('Invalid date format.', 400));
    }
    if (checkInDate < now.setHours(0, 0, 0, 0)) {
      return next(new AppError('Check-in date cannot be in the past.', 400));
    }
    if (checkOutDate <= checkInDate) {
      return next(new AppError('Check-out must be after check-in.', 400));
    }

    // ── Fetch room ────────────────────────────────────────────
    const room = await Room.findById(roomId).populate('host', 'name email');
    if (!room) return next(new AppError('Room not found.', 404));

    if (!room.isAvailable) {
      return next(new AppError('This room is currently marked unavailable by the host.', 400));
    }

    // ── Capacity check ────────────────────────────────────────
    if (parseInt(guests, 10) > room.capacity) {
      return next(
        new AppError(
          `This room accommodates up to ${room.capacity} guest(s). You requested ${guests}.`,
          400
        )
      );
    }

    // ── Date-collision check ──────────────────────────────────
    // Overlap condition: existingCheckIn < newCheckOut AND existingCheckOut > newCheckIn
    const overlap = await Booking.findOverlap(roomId, checkInDate, checkOutDate);
    if (overlap) {
      return next(
        new AppError(
          `Room is already booked from ${overlap.checkIn.toDateString()} ` +
          `to ${overlap.checkOut.toDateString()}. Please choose different dates.`,
          409
        )
      );
    }

    // ── Price calculation ─────────────────────────────────────
    const nights    = Math.max(1, Math.ceil((checkOutDate - checkInDate) / 86_400_000));
    const totalPrice = nights * room.pricePerNight;

    // ── Create booking ────────────────────────────────────────
    const booking = await Booking.create({
      customer:       req.user._id,
      room:           roomId,
      checkIn:        checkInDate,
      checkOut:       checkOutDate,
      guests:         parseInt(guests, 10),
      pricePerNight:  room.pricePerNight,
      totalNights:    nights,
      totalPrice,
      status:         'pending',
      paymentStatus:  'unpaid',
      specialRequests,
    });

    const populated = await Booking.findById(booking._id)
      .populate('room', 'name area address images pricePerNight host')
      .populate('customer', 'name email phone')
      .lean();

    // ── Async email (non-blocking) ─────────────────────────────
    sendEmail({
      to:      req.user.email,
      subject: `Booking Pending – ${room.name} | myroom.in`,
      html:    bookingConfirmationHtml(populated, req.user, room),
    }).catch((e) => console.error('Booking email error:', e.message));

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/bookings/my-bookings ─────────────────────────
const getMyBookings = async (req, res, next) => {
  try {
    const { status, page = '1', limit = '10' } = req.query;
    const filter = { customer: req.user._id };
    if (status) filter.status = status;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * limitNum;

    const [total, bookings] = await Promise.all([
      Booking.countDocuments(filter),
      Booking.find(filter)
        .populate('room', 'name area images pricePerNight landmarkDistances')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: bookings,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/bookings/:id ──────────────────────────────────
const getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('room', 'name area address images pricePerNight host')
      .populate('customer', 'name email phone')
      .lean();

    if (!booking) return next(new AppError('Booking not found.', 404));

    // Ownership: customer can see own bookings; host can see bookings for their rooms
    const isOwner  = booking.customer._id.toString() === req.user._id.toString();
    const isHost   = booking.room.host?.toString()    === req.user._id.toString();
    const isAdmin  = req.user.role === 'admin';

    if (!isOwner && !isHost && !isAdmin) {
      return next(new AppError('Not authorised to view this booking.', 403));
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/bookings/:id/confirm (host / admin) ────────
const confirmBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room', 'host name');
    if (!booking) return next(new AppError('Booking not found.', 404));

    const isHost  = booking.room.host?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isHost && !isAdmin) {
      return next(new AppError('Only the host or admin can confirm a booking.', 403));
    }
    if (booking.status !== 'pending') {
      return next(new AppError(`Cannot confirm a booking with status: ${booking.status}.`, 400));
    }

    booking.status = 'confirmed';
    await booking.save();
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/bookings/:id/cancel ─────────────────────────
/**
 * Cancellation Refund Policy:
 *   ≥ 48 h before check-in → 100% refund
 *   24–48 h before check-in → 50% refund
 *   < 24 h before check-in →   0% refund (no refund)
 */
const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room', 'name host');
    if (!booking) return next(new AppError('Booking not found.', 404));

    // Authorization: customer who made it, the host, or admin
    const isCustomer = booking.customer.toString() === req.user._id.toString();
    const isHost     = booking.room.host?.toString() === req.user._id.toString();
    const isAdmin    = req.user.role === 'admin';

    if (!isCustomer && !isHost && !isAdmin) {
      return next(new AppError('Not authorised to cancel this booking.', 403));
    }
    if (['cancelled', 'completed'].includes(booking.status)) {
      return next(new AppError(`Booking is already ${booking.status}.`, 400));
    }

    // ── Refund tier calculation ────────────────────────────────
    const hoursUntilCheckIn = (booking.checkIn - Date.now()) / 3_600_000;
    let refundPct = 0;
    let refundLabel = 'No refund';

    if (hoursUntilCheckIn >= 48) {
      refundPct = 100; refundLabel = 'Full refund';
    } else if (hoursUntilCheckIn >= 24) {
      refundPct = 50;  refundLabel = '50% refund';
    }

    const refundAmount = booking.paymentStatus === 'paid'
      ? Math.round((refundPct / 100) * booking.totalPrice)
      : 0;

    booking.status             = 'cancelled';
    booking.cancellationReason = req.body.reason || 'Cancelled by user';
    booking.cancelledAt        = new Date();
    booking.refundAmount       = refundAmount;
    if (refundAmount > 0) booking.paymentStatus = 'refunded';

    await booking.save();

    res.json({
      success: true,
      message: `Booking cancelled. ${refundLabel} of ₹${refundAmount.toLocaleString('en-IN')}.`,
      data: booking,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/bookings (admin only) ─────────────────────────
const getAllBookings = async (req, res, next) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, parseInt(limit, 10));
    const skip     = (pageNum - 1) * limitNum;

    const [total, bookings] = await Promise.all([
      Booking.countDocuments(filter),
      Booking.find(filter)
        .populate('customer', 'name email')
        .populate('room', 'name area')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({ success: true, total, page: pageNum, pages: Math.ceil(total / limitNum), data: bookings });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  confirmBooking,
  cancelBooking,
  getAllBookings,
};
