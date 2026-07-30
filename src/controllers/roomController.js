'use strict';

const Room    = require('../models/Room');
const Booking = require('../models/Booking');
const { AppError } = require('../middleware/errorHandler');
const { handleUpload, uploadRoomImages } = require('../middleware/upload');
const { computeLandmarkDistances, distanceFromLandmark } = require('../utils/geoDistance');

// ── GET /api/v1/rooms ─────────────────────────────────────────
/**
 * Advanced filtering, sorting, and pagination for the room catalogue.
 *
 * Supported query params:
 *   city, area, landmark, roomType, minPrice, maxPrice,
 *   guests, rating, search, sort, page, limit
 */
const getRooms = async (req, res, next) => {
  try {
    const {
      city        = 'Deoghar',
      area,
      landmark,
      roomType,
      minPrice,
      maxPrice,
      guests,
      rating,
      search,
      sort        = 'availability',
      page        = '1',
      limit       = '12',
    } = req.query;

    // ── Build filter ─────────────────────────────────────────
    const filter = {};

    filter.city = { $regex: new RegExp(city, 'i') };
    if (area)     filter.area     = { $regex: new RegExp(area, 'i') };
    if (roomType) filter.roomType = roomType;
    if (guests)   filter.capacity = { $gte: parseInt(guests, 10) };
    if (rating)   filter.rating   = { $gte: parseFloat(rating) };

    if (minPrice || maxPrice) {
      filter.pricePerNight = {};
      if (minPrice) filter.pricePerNight.$gte = parseFloat(minPrice);
      if (maxPrice) filter.pricePerNight.$lte = parseFloat(maxPrice);
    }

    if (landmark) {
      filter['landmarkDistances.landmark'] = landmark;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    // ── Sort spec ─────────────────────────────────────────────
    const sortMap = {
      'availability': { isAvailable: -1, rating: -1 },
      'price-asc':    { pricePerNight: 1 },
      'price-desc':   { pricePerNight: -1 },
      'rating':       { rating: -1 },
      'newest':       { createdAt: -1 },
    };
    const sortSpec = sortMap[sort] || sortMap.availability;

    // ── Pagination ────────────────────────────────────────────
    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip     = (pageNum - 1) * limitNum;

    // ── Execute (count + data in parallel) ────────────────────
    const [total, rooms] = await Promise.all([
      Room.countDocuments(filter),
      Room.find(filter)
        .populate('host', 'name email phone avatar')
        .sort(sortSpec)
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    // ── Annotate: attach computedDistance for the chosen landmark ──
    if (landmark) {
      rooms.forEach((room) => {
        const entry = room.landmarkDistances?.find((d) => d.landmark === landmark);
        room.computedDistance = entry
          ? { distanceText: entry.distanceText, distanceM: entry.distanceM }
          : null;
      });

      // Optional: sort by proximity within current page
      if (sort === 'availability') {
        rooms.sort((a, b) => {
          const dA = a.computedDistance?.distanceM ?? Infinity;
          const dB = b.computedDistance?.distanceM ?? Infinity;
          return dA - dB;
        });
      }
    }

    res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      count: rooms.length,
      data: rooms,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/rooms/:id ─────────────────────────────────────
const getRoomById = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate('host', 'name email phone avatar')
      .lean();

    if (!room) return next(new AppError('Room not found.', 404));
    res.json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/rooms  (host only) ───────────────────────────
const createRoom = async (req, res, next) => {
  try {
    // Handle image upload first
    await handleUpload(uploadRoomImages)(req, res);

    const {
      name, description, area, address,
      pricePerNight, capacity, roomType,
      amenities, lat, lng,
    } = req.body;

    if (!name || !area || !pricePerNight || !capacity || !roomType) {
      return next(new AppError('name, area, pricePerNight, capacity, and roomType are required.', 400));
    }

    // Uploaded filenames → public paths
    const images = req.files?.map((f) => f.filename) || [];

    // Pre-calculate distances to all known landmarks
    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lng);
    let landmarkDistances = [];
    let location = { type: 'Point', coordinates: [0, 0] };

    if (!isNaN(latitude) && !isNaN(longitude)) {
      landmarkDistances = computeLandmarkDistances(latitude, longitude);
      location = { type: 'Point', coordinates: [longitude, latitude] };
    }

    // Nearest landmark (smallest distanceM)
    const nearest = landmarkDistances.reduce(
      (best, cur) => (!best || cur.distanceM < best.distanceM ? cur : best),
      null
    );

    const room = await Room.create({
      host: req.user._id,
      name, description,
      city: 'Deoghar',
      area, address,
      location,
      pricePerNight: parseFloat(pricePerNight),
      capacity: parseInt(capacity, 10),
      roomType,
      amenities: typeof amenities === 'string' ? JSON.parse(amenities) : amenities || [],
      images,
      landmarkDistances,
      nearestLandmark: nearest?.landmark || '',
    });

    res.status(201).json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/v1/rooms/:id  (host / admin) ─────────────────────
const updateRoom = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return next(new AppError('Room not found.', 404));

    // Ownership guard (skipped if admin)
    if (
      req.user.role !== 'admin' &&
      room.host.toString() !== req.user._id.toString()
    ) {
      return next(new AppError('You can only update your own listings.', 403));
    }

    const allowed = [
      'name', 'description', 'area', 'address',
      'pricePerNight', 'capacity', 'roomType',
      'amenities', 'isAvailable', 'isFeatured',
    ];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // Recompute distances if coordinates changed
    const lat = parseFloat(req.body.lat);
    const lng = parseFloat(req.body.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      updates.landmarkDistances = computeLandmarkDistances(lat, lng);
      updates.location = { type: 'Point', coordinates: [lng, lat] };
      const nearest = updates.landmarkDistances.reduce(
        (best, cur) => (!best || cur.distanceM < best.distanceM ? cur : best),
        null
      );
      updates.nearestLandmark = nearest?.landmark || '';
    }

    const updated = await Room.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/v1/rooms/:id  (host / admin) ──────────────────
const deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return next(new AppError('Room not found.', 404));

    if (
      req.user.role !== 'admin' &&
      room.host.toString() !== req.user._id.toString()
    ) {
      return next(new AppError('You can only delete your own listings.', 403));
    }

    // Prevent deletion if there are active / confirmed bookings
    const activeBookings = await Booking.countDocuments({
      room: req.params.id,
      status: { $in: ['pending', 'confirmed'] },
      checkOut: { $gte: new Date() },
    });
    if (activeBookings > 0) {
      return next(
        new AppError(
          `Cannot delete: ${activeBookings} active booking(s) exist for this room.`,
          400
        )
      );
    }

    await room.deleteOne();
    res.json({ success: true, message: 'Room deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/rooms/:id/availability ───────────────────────
/**
 * Returns booked date ranges for the room so the frontend
 * can disable those dates on the calendar.
 */
const getRoomAvailability = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return next(new AppError('Room not found.', 404));

    const bookings = await Booking.find({
      room: req.params.id,
      status: { $nin: ['cancelled'] },
      checkOut: { $gte: new Date() },
    })
      .select('checkIn checkOut')
      .lean();

    res.json({
      success: true,
      isAvailable: room.isAvailable,
      bookedRanges: bookings.map((b) => ({
        checkIn:  b.checkIn,
        checkOut: b.checkOut,
      })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomAvailability,
};
