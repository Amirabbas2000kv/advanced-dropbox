const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Each user gets their own folder: uploads/<userId>/
    const dir = path.join(UPLOAD_ROOT, String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Random name on disk, original name is stored in the database
    cb(null, crypto.randomUUID());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

module.exports = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large (max 50 MB)' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    next();
  });
};