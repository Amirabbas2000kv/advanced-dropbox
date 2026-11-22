const express = require('express');
const shareController = require('../controllers/share.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', authMiddleware, shareController.create);
router.get('/', authMiddleware, shareController.list);
router.delete('/:id', authMiddleware, shareController.revoke);

module.exports = router;