const express = require('express');
const fileController = require('../controllers/file.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');

const router = express.Router();

// Order matters: first check the token, then receive the file
router.post('/upload', authMiddleware, uploadMiddleware, fileController.upload);

module.exports = router;