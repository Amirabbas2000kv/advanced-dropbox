const express = require('express');
const fileController = require('../controllers/file.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');

const router = express.Router();

// Fixed paths first, then paths with parameters
router.post('/upload', authMiddleware, uploadMiddleware, fileController.upload);
router.get('/', authMiddleware, fileController.list);
router.get('/storage', authMiddleware, fileController.storage);
router.get('/trash', authMiddleware, fileController.trash);

router.get('/:id/download', authMiddleware, fileController.download);
router.post('/:id/restore', authMiddleware, fileController.restore);
router.delete('/:id/permanent', authMiddleware, fileController.permanentDelete);
router.delete('/:id', authMiddleware, fileController.remove);
router.patch('/:id/rename', authMiddleware, fileController.rename);
router.patch('/:id/move', authMiddleware, fileController.move);

module.exports = router;