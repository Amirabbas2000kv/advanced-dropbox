const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const uploadConfig = require('../config/upload.config');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, crypto.randomUUID()),
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (uploadConfig.blockedExtensions.includes(ext)) {
    const err = new Error(`File type "${ext}" is not allowed`);
    err.code = 'BLOCKED_FILE_TYPE';
    return cb(err);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: uploadConfig.maxFileSize },
}).single('file');

module.exports = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large (max 50 MB)' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err && err.code === 'BLOCKED_FILE_TYPE') {
      return res.status(415).json({ error: err.message });
    }
    if (err) {
      return next(err);
    }
    next();
  });
};