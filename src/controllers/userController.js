'use strict';

const User    = require('../models/User');
const Room    = require('../models/Room');
const Booking = require('../models/Booking');
const Review  = require('../models/Review');
const { AppError } = require('../middleware/errorHandler');
const { handleUpload, uploadAvatar } = require('../middleware/upload');

// ── GET /api/v1/users/dashboard ───────────────────────────────
/**
 * Returns role-specific dashboard data.
 * customer → upcoming & past bookings, spend metrics.
 * host     → listed rooms, revenue metrics, incoming bookings.
 * admin    → platform-wide stats.
 */
const getDashboard = async (req, res, next) => {
  try {
    const { _id: userId, role } = req.user;

    if (role === 'customer') {
      const [upcoming, past] = await Promise.all([
        Booking.find({
          customer: userId,
          checkIn:  { $gte: new Date() },
          status:   { $nin: ['cancelled'] },
        })
          .populate('room', 'name area images pricePerNight')
          .sort({ checkIn: 1 })
          .limit(10)
          .lean(),

        Booking.find({
          customer: userId,
          checkOut: { $lt: new Date() },
        })
          .populate('room', 'name area images pricePerNight')
          .sort({ checkOut: -1 })
          .limit(20)
          .lean(),
      ]);

      // Spend summary
      const spendAgg = await Booking.aggregate([
        { $match: { customer: userId, paymentStatus: 'paid' } },
        { $group: { _id: null, totalSpent: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
      ]);
      const totalSpent = spendAgg[0]?.totalSpent || 0;
      const bookingCount = spendAgg[0]?.count || 0;

      return res.json({
        success: true,
        role: 'customer',
        data: { upcoming, past, totalSpent, bookingCount },
      });
    }

    if (role === 'host') {
      const rooms = await Room.find({ host: userId })
        .select('name area pricePerNight isAvailable rating reviewCount images createdAt')
        .lean();

      const roomIds = rooms.map((r) => r._id);

      const [bookings, revenueAgg, occupancyAgg] = await Promise.all([
        Booking.find({
          room: { $in: roomIds },
          status: { $nin: ['cancelled'] },
        })
          .populate('customer', 'name email phone')
          .populate('room', 'name area')
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),

        Booking.aggregate([
          { $match: { room: { $in: roomIds }, paymentStatus: 'paid' } },
          { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' }, count: { $sum: 1 } } },
        ]),

        Booking.aggregate([
          { $match: { room: { $in: roomIds }, status: 'confirmed' } },
          { $group: { _id: '$room', activeBookings: { $sum: 1 } } },
        ]),
      ]);

      return res.json({
        success: true,
        role: 'host',
        data: {
          rooms,
          recentBookings: bookings,
          totalRevenue: revenueAgg[0]?.totalRevenue || 0,
          totalBookings: revenueAgg[0]?.count || 0,
          occupancy: occupancyAgg,
        },
      });
    }

    if (role === 'admin') {
      const [totalUsers, totalRooms, totalBookings, revenueAgg, pendingBookings] =
        await Promise.all([
          User.countDocuments(),
          Room.countDocuments(),
          Booking.countDocuments({ status: { $nin: ['cancelled'] } }),
          Booking.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: '$totalPrice' } } },
          ]),
          Booking.countDocuments({ status: 'pending' }),
        ]);

      return res.json({
        success: true,
        role: 'admin',
        data: {
          totalUsers,
          totalRooms,
          totalBookings,
          totalRevenue: revenueAgg[0]?.total || 0,
          pendingBookings,
        },
      });
    }

    next(new AppError('Unknown role.', 400));
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users/me ──────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: user.toPublic() });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/users/me ────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone'];
    const updates = {};
    allowed.forEach((field) => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, data: user.toPublic() });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/users/me/avatar ──────────────────────────────
const uploadUserAvatar = async (req, res, next) => {
  try {
    await handleUpload(uploadAvatar)(req, res);
    if (!req.file) {
      return next(new AppError('Please upload an image file.', 400));
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: req.file.filename },
      { new: true }
    );
    res.json({ success: true, data: user.toPublic() });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/users (admin only) ───────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: users,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/users/:id/deactivate (admin only) ──────────
const deactivateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return next(new AppError('User not found.', 404));
    res.json({ success: true, message: 'User deactivated.', data: user.toPublic() });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  uploadUserAvatar,
  getAllUsers,
  deactivateUser,
};
