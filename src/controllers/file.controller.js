const fs = require('fs');
const path = require('path');
const prisma = require('../config/db');
const logger = require('../utils/logger');
const { isPreviewable, sendPreview } = require('../utils/preview');
const { emitToUser } = require('../realtime/socket');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send it in a field named "file"' });
    }

    // Storage quota check
    const owner = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageLimit: true },
    });
    if (owner.storageUsed + req.file.size > owner.storageLimit) {
      fs.unlink(req.file.path, () => {});
      return res.status(413).json({ error: 'Storage quota exceeded' });
    }

    // Optional target folder (sent as a form field named "folderId")
    let folderId = null;
    if (req.body.folderId) {
      folderId = Number(req.body.folderId);
      const folder = Number.isInteger(folderId)
        ? await prisma.folder.findFirst({ where: { id: folderId, userId: req.user.id } })
        : null;
      if (!folder) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Target folder not found' });
      }
    }

    // Save file info and update the user's used storage in ONE transaction
    const [file] = await prisma.$transaction([
      prisma.file.create({
        data: {
          name: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          userId: req.user.id,
          folderId,
        },
        select: { id: true, name: true, mimeType: true, size: true, folderId: true, createdAt: true },
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { storageUsed: { increment: req.file.size } },
      }),
    ]);

    emitToUser(req.user.id, 'file:uploaded', file);
    return res.status(201).json({ message: 'File uploaded successfully', file });
  } catch (err) {
    // If the database failed, remove the file from disk so nothing is orphaned
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.user.id, deletedAt: null },
      select: { id: true, name: true, mimeType: true, size: true, folderId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ count: files.length, files });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.storage = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageLimit: true },
    });

    return res.json({
      used: user.storageUsed,
      limit: user.storageLimit,
      remaining: user.storageLimit - user.storageUsed,
      percent: Number(((user.storageUsed / user.storageLimit) * 100).toFixed(2)),
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.download = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    // Only find the file if it belongs to the logged-in user and is not in the trash
    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id, deletedAt: null },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(UPLOAD_ROOT, String(req.user.id), file.storedName);
    return res.download(filePath, file.name, (err) => {
      if (err && !res.headersSent) {
        return res.status(404).json({ error: 'File is missing on disk' });
      }
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/files/:id  ->  move to trash (soft delete)
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id, deletedAt: null },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    emitToUser(req.user.id, 'file:trashed', { id: file.id });
    return res.json({ message: 'File moved to trash' });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/files/trash
exports.trash = async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.user.id, deletedAt: { not: null } },
      select: { id: true, name: true, mimeType: true, size: true, folderId: true, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    });

    return res.json({ count: files.length, files });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/files/:id/restore
exports.restore = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id, deletedAt: { not: null } },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found in trash' });
    }

    const restored = await prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: null },
      select: { id: true, name: true, folderId: true },
    });

    emitToUser(req.user.id, 'file:restored', restored);
    return res.json({ message: 'File restored successfully', file: restored });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/files/:id/permanent  ->  remove for good (record + disk + quota, including old versions)
exports.permanentDelete = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    // Only files that are already in the trash can be deleted permanently
    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id, deletedAt: { not: null } },
      include: { versions: true },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found in trash' });
    }

    const totalSize = file.size + file.versions.reduce((sum, v) => sum + v.size, 0);

    await prisma.$transaction([
      prisma.file.delete({ where: { id: file.id } }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { storageUsed: { decrement: totalSize } },
      }),
    ]);

    // Remove the physical files (current + old versions)
    const userDir = path.join(UPLOAD_ROOT, String(req.user.id));
    fs.unlink(path.join(userDir, file.storedName), () => {});
    for (const v of file.versions) fs.unlink(path.join(userDir, v.storedName), () => {});

    emitToUser(req.user.id, 'file:deleted', { id: file.id });
    return res.json({ message: 'File permanently deleted' });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.rename = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }
    if (!name) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const file = await prisma.file.findFirst({ where: { id, userId: req.user.id, deletedAt: null } });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { name },
      select: { id: true, name: true, folderId: true, updatedAt: true },
    });

    emitToUser(req.user.id, 'file:renamed', updated);
    return res.json({ message: 'File renamed successfully', file: updated });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.move = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    // folderId: number = target folder, null = root
    const raw = req.body.folderId;
    const folderId = raw === null || raw === undefined ? null : Number(raw);
    if (folderId !== null && !Number.isInteger(folderId)) {
      return res.status(400).json({ error: 'Invalid folderId' });
    }

    const file = await prisma.file.findFirst({ where: { id, userId: req.user.id, deletedAt: null } });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (folderId !== null) {
      const target = await prisma.folder.findFirst({ where: { id: folderId, userId: req.user.id } });
      if (!target) {
        return res.status(404).json({ error: 'Target folder not found' });
      }
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { folderId },
      select: { id: true, name: true, folderId: true, updatedAt: true },
    });

    emitToUser(req.user.id, 'file:moved', updated);
    return res.json({ message: 'File moved successfully', file: updated });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/files/:id/preview  ->  show the file inside the browser
exports.preview = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id, deletedAt: null },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!isPreviewable(file.mimeType)) {
      return res.status(415).json({ error: 'This file type cannot be previewed. Download it instead' });
    }

    return sendPreview(res, req.user.id, file);
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};