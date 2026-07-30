'use strict';

const { Router } = require('express');
const {
  getRooms, getRoomById, createRoom,
  updateRoom, deleteRoom, getRoomAvailability,
} = require('../controllers/roomController');
const { protect, optionalAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

const router = Router();

// Public routes
router.get('/',         optionalAuth, getRooms);
router.get('/:id',      optionalAuth, getRoomById);
router.get('/:id/availability', getRoomAvailability);

// Protected routes
router.post('/',        protect, authorize('host', 'admin'), createRoom);
router.put('/:id',      protect, authorize('host', 'admin'), updateRoom);
router.delete('/:id',   protect, authorize('host', 'admin'), deleteRoom);

module.exports = router;
