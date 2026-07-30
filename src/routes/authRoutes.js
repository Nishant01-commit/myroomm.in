'use strict';

const { Router } = require('express');
const {
  register, login, refreshToken,
  logout, getMe, updatePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = Router();

router.post('/register',        register);
router.post('/login',           login);
router.post('/refresh-token',   refreshToken);
router.post('/logout',          protect, logout);
router.get('/me',               protect, getMe);
router.patch('/update-password', protect, updatePassword);

module.exports = router;
