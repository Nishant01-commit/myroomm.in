'use strict';

const jwt = require('jsonwebtoken');

/**
 * generateAccessToken
 * Short-lived token (default 15 min) for authenticating API requests.
 * Payload carries { id, role } — just enough for auth checks.
 */
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { id: userId.toString(), role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' }
  );
};

/**
 * generateRefreshToken
 * Long-lived token (default 7 days) stored in an httpOnly cookie.
 * Used only to issue a new access token — contains minimal payload.
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId.toString() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
};

/**
 * cookieOptions
 * Shared options for the refresh-token cookie.
 */
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
});

/**
 * sendTokenResponse
 * Convenience helper used in auth controllers to issue both tokens,
 * set the cookie, and respond with the access token + user data.
 */
const sendTokenResponse = async (user, statusCode, res) => {
  const accessToken  = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  // Persist refresh token (single-device; replace with array for multi-device)
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res
    .status(statusCode)
    .cookie('refreshToken', refreshToken, cookieOptions())
    .json({
      success: true,
      accessToken,
      data: user.toPublic ? user.toPublic() : user,
    });
};

module.exports = { generateAccessToken, generateRefreshToken, sendTokenResponse, cookieOptions };
