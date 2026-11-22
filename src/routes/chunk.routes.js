const express = require('express');
const chunkController = require('../controllers/chunk.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadConfig = require('../config/upload.config');

const router = express.Router();

// Raw binary body parser, only for the chunk route
const rawChunk = express.raw({
  type: 'application/octet-stream',
  limit: uploadConfig.chunkSize + 1024,
});

router.post('/init', authMiddleware, chunkController.init);
router.put('/:id/chunks/:index', authMiddleware, rawChunk, chunkController.uploadChunk);
router.get('/:id', authMiddleware, chunkController.status);
router.post('/:id/complete', authMiddleware, chunkController.complete);
router.delete('/:id', authMiddleware, chunkController.abort);

module.exports = router;