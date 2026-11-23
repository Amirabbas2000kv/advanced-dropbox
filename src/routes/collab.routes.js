const express = require('express');
const collabController = require('../controllers/collab.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', authMiddleware, collabController.create);
router.get('/by-me', authMiddleware, collabController.byMe);
router.get('/with-me', authMiddleware, collabController.withMe);
router.get('/files/:fileId/download', authMiddleware, collabController.download);
router.patch('/files/:fileId/rename', authMiddleware, collabController.rename);
router.delete('/:id', authMiddleware, collabController.revoke);

module.exports = router;