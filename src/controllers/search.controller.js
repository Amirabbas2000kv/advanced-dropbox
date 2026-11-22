const prisma = require('../config/db');
const logger = require('../utils/logger');

// Map a friendly "type" to a MIME type prefix
const TYPE_FILTERS = {
  image: 'image/',
  video: 'video/',
  audio: 'audio/',
  text: 'text/',
  pdf: 'application/pdf',
};

exports.search = async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.toLowerCase() : '';

    if (!q && !type) {
      return res.status(400).json({ error: 'Provide at least "q" (text) or "type"' });
    }
    if (q.length > 100) {
      return res.status(400).json({ error: 'Search text is too long (max 100 characters)' });
    }
    if (type && !TYPE_FILTERS[type]) {
      return res.status(400).json({ error: `type must be one of: ${Object.keys(TYPE_FILTERS).join(', ')}` });
    }

    const fileWhere = { userId: req.user.id, deletedAt: null };
    if (q) fileWhere.name = { contains: q };
    if (type) fileWhere.mimeType = { startsWith: TYPE_FILTERS[type] };

    const files = await prisma.file.findMany({
      where: fileWhere,
      select: { id: true, name: true, mimeType: true, size: true, folderId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Folders have no "type", so they are searched only when a text query is given
    const folders = q && !type
      ? await prisma.folder.findMany({
          where: { userId: req.user.id, name: { contains: q } },
          select: { id: true, name: true, parentId: true },
          orderBy: { name: 'asc' },
          take: 50,
        })
      : [];

    return res.json({ query: q, type: type || null, folders, files });
  } catch (err) {
    logger.error(err.stack || err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};