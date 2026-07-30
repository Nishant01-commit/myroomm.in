'use strict';

const { Router } = require('express');
const {
  createBooking, getMyBookings, getBookingById,
  confirmBooking, cancelBooking, getAllBookings,
} = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

const router = Router();

router.use(protect);

router.post('/',                           authorize('customer'), createBooking);
router.get('/my-bookings',                 getMyBookings);
router.get('/:id',                         getBookingById);
router.patch('/:id/confirm',               authorize('host', 'admin'), confirmBooking);
router.patch('/:id/cancel',                cancelBooking);

// Admin
router.get('/',                            authorize('admin'), getAllBookings);

module.exports = router;
