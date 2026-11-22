const fs = require('fs');
const prisma = require('../config/db');
const path = require('path');

exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send it in a field named "file"' });
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
        },
        select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
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

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

exports.list = async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ count: files.length, files });
  } catch (err) {
    console.error('List error:', err);
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