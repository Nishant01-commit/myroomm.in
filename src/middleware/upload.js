'use strict';

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('./errorHandler');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10); // default 5 MB
const UPLOAD_DIR = process.env.UPLOAD_PATH || './uploads';

// ── Disk storage ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ── File filter ───────────────────────────────────────────────
const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, WebP, and GIF images are allowed.', 400), false);
  }
};

// ── Upload instances ──────────────────────────────────────────

/**
 * uploadRoomImages — accepts up to 10 images under the field name "images"
 */
const uploadRoomImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 10 },
}).array('images', 10);

/**
 * uploadAvatar — single avatar image under field name "avatar"
 */
const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
}).single('avatar');

/**
 * Wrap multer in a Promise so controllers can use async/await.
 */
const handleUpload = (multerFn) => (req, res) =>
  new Promise((resolve, reject) => {
    multerFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return reject(new AppError(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1_048_576} MB.`, 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return reject(new AppError('Too many files. Maximum 10 images allowed.', 400));
        }
        return reject(new AppError(err.message, 400));
      }
      if (err) return reject(err);
      resolve();
    });
  });

module.exports = { uploadRoomImages, uploadAvatar, handleUpload };
