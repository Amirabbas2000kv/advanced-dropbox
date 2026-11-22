const fs = require('fs');
const path = require('path');
const prisma = require('../config/db');

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

    return res.status(201).json({ message: 'File uploaded successfully', file });
  } catch (err) {
    // If the database failed, remove the file from disk so nothing is orphaned
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, mimeType: true, size: true, folderId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ count: files.length, files });
  } catch (err) {
    console.error('List error:', err);
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
    console.error('Storage error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.download = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    // Only find the file if it belongs to the logged-in user
    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id },
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
    console.error('Download error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }

    // Only find the file if it belongs to the logged-in user
    const file = await prisma.file.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the record and free the storage in ONE transaction
    await prisma.$transaction([
      prisma.file.delete({ where: { id: file.id } }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { storageUsed: { decrement: file.size } },
      }),
    ]);

    // Remove the physical file (ignore error if it's already gone)
    const filePath = path.join(UPLOAD_ROOT, String(req.user.id), file.storedName);
    fs.unlink(filePath, () => {});

    return res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
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

    const file = await prisma.file.findFirst({ where: { id, userId: req.user.id } });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { name },
      select: { id: true, name: true, folderId: true, updatedAt: true },
    });

    return res.json({ message: 'File renamed successfully', file: updated });
  } catch (err) {
    console.error('Rename file error:', err);
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

    const file = await prisma.file.findFirst({ where: { id, userId: req.user.id } });
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

    return res.json({ message: 'File moved successfully', file: updated });
  } catch (err) {
    console.error('Move file error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};