const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/db');
const logger = require('../utils/logger');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const MAX_OLD_VERSIONS = 5;

const diskPath = (userId, storedName) => path.join(UPLOAD_ROOT, String(userId), storedName);

// Find a live (not trashed) file that belongs to the user
const findFile = (id, userId) =>
  prisma.file.findFirst({ where: { id, userId, deletedAt: null } });

// POST /api/files/:id/versions   (multipart, field "file")
exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send it in a field named "file"' });
    }
    const removeUploaded = () => fs.unlink(req.file.path, () => {});

    const id = Number(req.params.id);
    const file = Number.isInteger(id) ? await findFile(id, req.user.id) : null;
    if (!file) {
      removeUploaded();
      return res.status(404).json({ error: 'File not found' });
    }

    // Quota check (the old version stays on disk, so the new one adds to the total)
    const owner = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageLimit: true },
    });
    if (owner.storageUsed + req.file.size > owner.storageLimit) {
      removeUploaded();
      return res.status(413).json({ error: 'Storage quota exceeded' });
    }

    // Move the CURRENT file into the history, and make the new upload the current one
    const [, updated] = await prisma.$transaction([
      prisma.fileVersion.create({
        data: {
          fileId: file.id,
          version: file.currentVersion,
          storedName: file.storedName,
          mimeType: file.mimeType,
          size: file.size,
        },
      }),
      prisma.file.update({
        where: { id: file.id },
        data: {
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          currentVersion: { increment: 1 },
        },
        select: { id: true, name: true, size: true, currentVersion: true },
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { storageUsed: { increment: req.file.size } },
      }),
    ]);

    // Keep only the newest MAX_OLD_VERSIONS old versions
    const old = await prisma.fileVersion.findMany({
      where: { fileId: file.id },
      orderBy: { version: 'desc' },
    });
    const extra = old.slice(MAX_OLD_VERSIONS);
    if (extra.length > 0) {
      const freed = extra.reduce((sum, v) => sum + v.size, 0);
      await prisma.$transaction([
        prisma.fileVersion.deleteMany({ where: { id: { in: extra.map((v) => v.id) } } }),
        prisma.user.update({
          where: { id: req.user.id },
          data: { storageUsed: { decrement: freed } },
        }),
      ]);
      for (const v of extra) fs.unlink(diskPath(req.user.id, v.storedName), () => {});
    }

    return res.status(201).json({ message: 'New version uploaded', file: updated });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/files/:id/versions
exports.list = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const file = Number.isInteger(id) ? await findFile(id, req.user.id) : null;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const old = await prisma.fileVersion.findMany({
      where: { fileId: file.id },
      select: { version: true, size: true, mimeType: true, createdAt: true },
      orderBy: { version: 'desc' },
    });

    const versions = [
      { version: file.currentVersion, size: file.size, mimeType: file.mimeType, isCurrent: true },
      ...old.map((v) => ({ ...v, isCurrent: false })),
    ];

    return res.json({ fileId: file.id, name: file.name, count: versions.length, versions });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/files/:id/versions/:n/download
exports.download = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const n = Number(req.params.n);
    const file = Number.isInteger(id) && Number.isInteger(n) ? await findFile(id, req.user.id) : null;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    let storedName = null;
    if (n === file.currentVersion) {
      storedName = file.storedName;
    } else {
      const v = await prisma.fileVersion.findUnique({
        where: { fileId_version: { fileId: file.id, version: n } },
      });
      if (v) storedName = v.storedName;
    }
    if (!storedName) {
      return res.status(404).json({ error: 'Version not found' });
    }

    return res.download(diskPath(req.user.id, storedName), file.name, (err) => {
      if (err && !res.headersSent) {
        return res.status(404).json({ error: 'File is missing on disk' });
      }
    });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/files/:id/versions/:n/restore
// Restoring makes a NEW version with the content of version n (history is never rewritten)
exports.restore = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const n = Number(req.params.n);
    const file = Number.isInteger(id) && Number.isInteger(n) ? await findFile(id, req.user.id) : null;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (n === file.currentVersion) {
      return res.status(400).json({ error: 'This is already the current version' });
    }

    const target = await prisma.fileVersion.findUnique({
      where: { fileId_version: { fileId: file.id, version: n } },
    });
    if (!target) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Quota check (we copy the old content into a new file)
    const owner = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageLimit: true },
    });
    if (owner.storageUsed + target.size > owner.storageLimit) {
      return res.status(413).json({ error: 'Storage quota exceeded' });
    }

    // Copy the old content into a new file on disk
    const newStoredName = crypto.randomUUID();
    await fs.promises.copyFile(
      diskPath(req.user.id, target.storedName),
      diskPath(req.user.id, newStoredName)
    );

    try {
      const [, updated] = await prisma.$transaction([
        prisma.fileVersion.create({
          data: {
            fileId: file.id,
            version: file.currentVersion,
            storedName: file.storedName,
            mimeType: file.mimeType,
            size: file.size,
          },
        }),
        prisma.file.update({
          where: { id: file.id },
          data: {
            storedName: newStoredName,
            mimeType: target.mimeType,
            size: target.size,
            currentVersion: { increment: 1 },
          },
          select: { id: true, name: true, size: true, currentVersion: true },
        }),
        prisma.user.update({
          where: { id: req.user.id },
          data: { storageUsed: { increment: target.size } },
        }),
      ]);

      return res.json({ message: `Restored content of version ${n} as a new version`, file: updated });
    } catch (err) {
      fs.unlink(diskPath(req.user.id, newStoredName), () => {});
      throw err;
    }
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};