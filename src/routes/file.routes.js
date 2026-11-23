const express = require('express');
const fileController = require('../controllers/file.controller');
const versionController = require('../controllers/version.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');
const versionUploadMiddleware = require('../middlewares/version-upload.middleware');

const router = express.Router();

// Fixed paths first, then paths with parameters
router.post('/upload', authMiddleware, uploadMiddleware, fileController.upload);
router.get('/', authMiddleware, fileController.list);
router.get('/storage', authMiddleware, fileController.storage);
router.get('/trash', authMiddleware, fileController.trash);

// Versions
router.post('/:id/versions', authMiddleware, versionUploadMiddleware, versionController.upload);
router.get('/:id/versions', authMiddleware, versionController.list);
router.get('/:id/versions/:n/download', authMiddleware, versionController.download);
router.post('/:id/versions/:n/restore', authMiddleware, versionController.restore);

router.get('/:id/download', authMiddleware, fileController.download);
router.post('/:id/restore', authMiddleware, fileController.restore);
router.delete('/:id/permanent', authMiddleware, fileController.permanentDelete);
router.delete('/:id', authMiddleware, fileController.remove);
router.patch('/:id/rename', authMiddleware, fileController.rename);
router.patch('/:id/move', authMiddleware, fileController.move);

module.exports = router;