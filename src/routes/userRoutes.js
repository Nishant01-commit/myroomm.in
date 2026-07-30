'use strict';

const { Router } = require('express');
const {
  getDashboard, getProfile, updateProfile,
  uploadUserAvatar, getAllUsers, deactivateUser,
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

const router = Router();

// All routes require authentication
router.use(protect);

router.get('/dashboard',              getDashboard);
router.get('/me',                     getProfile);
router.patch('/me',                   updateProfile);
router.post('/me/avatar',             uploadUserAvatar);

// Admin only
router.get('/',                       authorize('admin'), getAllUsers);
router.patch('/:id/deactivate',       authorize('admin'), deactivateUser);

module.exports = router;
