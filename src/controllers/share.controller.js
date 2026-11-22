const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/db');
const logger = require('../utils/logger');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const TOKEN_REGEX = /^[0-9a-f]{48}$/;
const MAX_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

// POST /api/shares   body: { fileId, expiresInSeconds? }
exports.create = async (req, res) => {
  try {
    const fileId = Number(req.body.fileId);
    if (!Number.isInteger(fileId)) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    let expiresAt = null;
    if (req.body.expiresInSeconds !== undefined && req.body.expiresInSeconds !== null) {
      const seconds = Number(req.body.expiresInSeconds);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_EXPIRY_SECONDS) {
        return res
          .status(400)
          .json({ error: `expiresInSeconds must be an integer between 1 and ${MAX_EXPIRY_SECONDS}` });
      }
      expiresAt = new Date(Date.now() + seconds * 1000);
    }

    // The file must belong to the user and must not be in the trash
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: req.user.id, deletedAt: null },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const token = crypto.randomBytes(24).toString('hex'); // 48 hex characters
    const share = await prisma.shareLink.create({
      data: { token, fileId: file.id, userId: req.user.id, expiresAt },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });

    return res.status(201).json({
      message: 'Share link created',
      share: { ...share, url: `${req.protocol}://${req.get('host')}/api/public/${share.token}` },
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/shares
exports.list = async (req, res) => {
  try {
    const shares = await prisma.shareLink.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        downloadCount: true,
        createdAt: true,
        file: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ count: shares.length, shares });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/shares/:id
exports.revoke = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid share id' });
    }

    const share = await prisma.shareLink.findFirst({ where: { id, userId: req.user.id } });
    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    await prisma.shareLink.delete({ where: { id: share.id } });
    return res.json({ message: 'Share link revoked' });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/public/:token   (NO login needed)
exports.publicDownload = async (req, res) => {
  try {
    const { token } = req.params;
    if (!TOKEN_REGEX.test(token)) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const share = await prisma.shareLink.findUnique({
      where: { token },
      include: { file: true },
    });
    if (!share || share.file.deletedAt !== null) {
      return res.status(404).json({ error: 'Link not found' });
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    await prisma.shareLink.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    const filePath = path.join(UPLOAD_ROOT, String(share.userId), share.file.storedName);
    return res.download(filePath, share.file.name, (err) => {
      if (err && !res.headersSent) {
        return res.status(404).json({ error: 'File is missing on disk' });
      }
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};