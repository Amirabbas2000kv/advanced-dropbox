const prisma = require('../config/db');

// Parse an optional id from body/query. Returns null for root, NaN for invalid.
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
    console.error('Create folder error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// List the content of one folder (or the root when no folderId is given)
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
        where: { userId: req.user.id, folderId },
        select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({ current, folders, files });
  } catch (err) {
    console.error('Folder content error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};