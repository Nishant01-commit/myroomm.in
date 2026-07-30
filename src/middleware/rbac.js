'use strict';

const { AppError } = require('./errorHandler');

/**
 * authorize(...roles)
 * Factory that returns a middleware restricting access to specific roles.
 *
 * Usage:
 *   router.post('/', protect, authorize('host', 'admin'), createRoom);
 *   router.get('/dashboard', protect, authorize('admin'), getDashboard);
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated.', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. This route requires one of the following roles: ${roles.join(', ')}.`,
          403
        )
      );
    }
    next();
  };
};

/**
 * ownerOrAdmin
 * Ensures the authenticated user either owns the resource (by checking
 * req.resource.owner / req.resource.host / req.resource.customer equals req.user._id)
 * OR has the admin role.
 *
 * Call this AFTER setting req.resource in a prior middleware or inside the controller.
 */
const ownerOrAdmin = (ownerField = 'host') => {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Not authenticated.', 401));
    if (req.user.role === 'admin') return next();

    const resource = req.resource;
    if (!resource) {
      return next(new AppError('Resource not found in request context.', 500));
    }

    const ownerId = resource[ownerField]?._id?.toString() ?? resource[ownerField]?.toString();
    if (ownerId !== req.user._id.toString()) {
      return next(new AppError('You are not authorised to modify this resource.', 403));
    }
    next();
  };
};

module.exports = { authorize, ownerOrAdmin };
