const express = require('express');
const fileController = require('../controllers/file.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');

const router = express.Router();

// Order matters: first check the token, then receive the file
router.post('/upload', authMiddleware, uploadMiddleware, fileController.upload);
router.get('/', authMiddleware, fileController.list);
router.get('/storage', authMiddleware, fileController.storage);
router.get('/:id/download', authMiddleware, fileController.download);
router.delete('/:id', authMiddleware, fileController.remove);
router.patch('/:id/rename', authMiddleware, fileController.rename);
router.patch('/:id/move', authMiddleware, fileController.move);

module.exports = router;