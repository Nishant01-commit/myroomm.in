'use strict';

const { Router } = require('express');
const {
  submitContact, submitFeedback,
  submitRoomReview, getRoomReviews,
} = require('../controllers/supportController');
const { protect, optionalAuth } = require('../middleware/auth');

const router = Router();

router.post('/contact',         submitContact);        // public
router.post('/feedback',        protect, submitFeedback);
router.post('/reviews',         protect, submitRoomReview);
router.get('/reviews/:roomId',  optionalAuth, getRoomReviews);

module.exports = router;
