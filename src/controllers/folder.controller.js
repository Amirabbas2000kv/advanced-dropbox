const prisma = require('../config/db');
const logger = require('../utils/logger');

// Parse an optional id from body/params. Returns null for root, NaN for invalid.
const parseOptionalId = (value) => {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
};

exports.create = async (req, res) => {
  try {
    const { name } = req.body;
    const parentId = parseOptionalId(req.body.parentId);

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    if (Number.isNaN(parentId)) {
      return res.status(400).json({ error: 'Invalid parentId' });
    }

    // If a parent is given, it must belong to the same user
    if (parentId !== null) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, userId: req.user.id },
      });
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }

    // No duplicate names inside the same folder
    const duplicate = await prisma.folder.findFirst({
      where: { name: name.trim(), parentId, userId: req.user.id },
    });
    if (duplicate) {
      return res.status(409).json({ error: 'A folder with this name already exists here' });
    }

    const folder = await prisma.folder.create({
      data: { name: name.trim(), parentId, userId: req.user.id },
      select: { id: true, name: true, parentId: true, createdAt: true },
    });

    return res.status(201).json({ message: 'Folder created successfully', folder });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// List the content of one folder (or the root when no id is given)
exports.content = async (req, res) => {
  try {
    const folderId = parseOptionalId(req.params.id);
    if (Number.isNaN(folderId)) {
      return res.status(400).json({ error: 'Invalid folder id' });
    }

    let current = null;
    if (folderId !== null) {
      current = await prisma.folder.findFirst({
        where: { id: folderId, userId: req.user.id },
        select: { id: true, name: true, parentId: true },
      });
      if (!current) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { userId: req.user.id, parentId: folderId },
        select: { id: true, name: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      prisma.file.findMany({
        where: { userId: req.user.id, folderId, deletedAt: null },
        select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({ current, folders, files });
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
      return res.status(400).json({ error: 'Invalid folder id' });
    }
    if (!name) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const folder = await prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const duplicate = await prisma.folder.findFirst({
      where: { name, parentId: folder.parentId, userId: req.user.id, NOT: { id: folder.id } },
    });
    if (duplicate) {
      return res.status(409).json({ error: 'A folder with this name already exists here' });
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { name },
      select: { id: true, name: true, parentId: true, updatedAt: true },
    });

    return res.json({ message: 'Folder renamed successfully', folder: updated });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.move = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid folder id' });
    }

    // parentId: number = target folder, null = root
    const raw = req.body.parentId;
    const parentId = raw === null || raw === undefined ? null : Number(raw);
    if (parentId !== null && !Number.isInteger(parentId)) {
      return res.status(400).json({ error: 'Invalid parentId' });
    }

    const folder = await prisma.folder.findFirst({ where: { id, userId: req.user.id } });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (parentId !== null) {
      const target = await prisma.folder.findFirst({ where: { id: parentId, userId: req.user.id } });
      if (!target) {
        return res.status(404).json({ error: 'Target folder not found' });
      }

      // Cycle check: walk up from the target. If we meet the folder itself, the move is illegal.
      let cursor = target;
      while (cursor) {
        if (cursor.id === folder.id) {
          return res.status(400).json({ error: 'Cannot move a folder into itself or its subfolder' });
        }
        cursor = cursor.parentId
          ? await prisma.folder.findUnique({ where: { id: cursor.parentId } })
          : null;
      }
    }

    const duplicate = await prisma.folder.findFirst({
      where: { name: folder.name, parentId, userId: req.user.id, NOT: { id: folder.id } },
    });
    if (duplicate) {
      return res.status(409).json({ error: 'A folder with this name already exists in the target' });
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { parentId },
      select: { id: true, name: true, parentId: true, updatedAt: true },
    });

    return res.json({ message: 'Folder moved successfully', folder: updated });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};