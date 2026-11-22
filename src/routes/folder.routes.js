const express = require('express');
const folderController = require('../controllers/folder.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', authMiddleware, folderController.create);
router.get('/', authMiddleware, folderController.content);
router.get('/:id', authMiddleware, folderController.content);

router.patch('/:id/rename', authMiddleware, folderController.rename);
router.patch('/:id/move', authMiddleware, folderController.move);

module.exports = router;