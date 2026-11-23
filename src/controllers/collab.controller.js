const path = require('path');
const prisma = require('../config/db');
const logger = require('../utils/logger');
const { isPreviewable, sendPreview } = require('../utils/preview');
const { emitToUser } = require('../realtime/socket');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const PERMISSIONS = ['read', 'edit'];

// Find a share that gives this user access to a live (not trashed) file
const findAccess = (fileId, userId) =>
  prisma.fileShare.findFirst({
    where: { fileId, recipientId: userId, file: { deletedAt: null } },
    include: { file: true },
  });

// POST /api/collab   body: { fileId, email, permission? }
exports.create = async (req, res) => {
  try {
    const fileId = Number(req.body.fileId);
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const permission = req.body.permission || 'read';

    if (!Number.isInteger(fileId) || !email) {
      return res.status(400).json({ error: 'fileId and email are required' });
    }
    if (!PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: `permission must be one of: ${PERMISSIONS.join(', ')}` });
    }

    // Only the owner can share, and the file must not be in the trash
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: req.user.id, deletedAt: null },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const recipient = await prisma.user.findUnique({ where: { email } });
    if (!recipient) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (recipient.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot share a file with yourself' });
    }

    // Create the share, or update the permission if it already exists
    const share = await prisma.fileShare.upsert({
      where: { fileId_recipientId: { fileId: file.id, recipientId: recipient.id } },
      create: { fileId: file.id, ownerId: req.user.id, recipientId: recipient.id, permission },
      update: { permission },
      select: { id: true, fileId: true, permission: true, createdAt: true },
    });

    emitToUser(recipient.id, 'share:received', { fileId: file.id, name: file.name, permission });
    return res.status(201).json({
      message: `File shared with ${recipient.email} (${permission})`,
      share,
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/collab/by-me
exports.byMe = async (req, res) => {
  try {
    const shares = await prisma.fileShare.findMany({
      where: { ownerId: req.user.id, file: { deletedAt: null } },
      select: {
        id: true,
        permission: true,
        createdAt: true,
        file: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ count: shares.length, shares });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/collab/with-me
exports.withMe = async (req, res) => {
  try {
    const shares = await prisma.fileShare.findMany({
      where: { recipientId: req.user.id, file: { deletedAt: null } },
      select: {
        id: true,
        permission: true,
        createdAt: true,
        file: { select: { id: true, name: true, size: true, mimeType: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ count: shares.length, shares });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/collab/:id   (the owner revokes it, or the recipient leaves)
exports.revoke = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid share id' });
    }

    const share = await prisma.fileShare.findFirst({
      where: { id, OR: [{ ownerId: req.user.id }, { recipientId: req.user.id }] },
    });
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await prisma.fileShare.delete({ where: { id: share.id } });

    emitToUser(share.recipientId, 'share:removed', { fileId: share.fileId });
    return res.json({ message: 'Access removed' });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/collab/files/:fileId/download
exports.download = async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const access = Number.isInteger(fileId) ? await findAccess(fileId, req.user.id) : null;
    if (!access) {
      return res.status(404).json({ error: 'File not found' });
    }

    // The file lives in the OWNER's folder, not in the recipient's
    const filePath = path.join(UPLOAD_ROOT, String(access.file.userId), access.file.storedName);
    return res.download(filePath, access.file.name, (err) => {
      if (err && !res.headersSent) {
        return res.status(404).json({ error: 'File is missing on disk' });
      }
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/collab/files/:fileId/preview
exports.preview = async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const access = Number.isInteger(fileId) ? await findAccess(fileId, req.user.id) : null;
    if (!access) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!isPreviewable(access.file.mimeType)) {
      return res.status(415).json({ error: 'This file type cannot be previewed. Download it instead' });
    }

    // The file lives in the OWNER's folder
    return sendPreview(res, access.file.userId, access.file);
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/collab/files/:fileId/rename   (needs "edit" permission)
exports.rename = async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const access = Number.isInteger(fileId) ? await findAccess(fileId, req.user.id) : null;
    if (!access) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (access.permission !== 'edit') {
      return res.status(403).json({ error: 'You only have read access to this file' });
    }

    const updated = await prisma.file.update({
      where: { id: access.file.id },
      data: { name },
      select: { id: true, name: true, updatedAt: true },
    });

    return res.json({ message: 'File renamed successfully', file: updated });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};