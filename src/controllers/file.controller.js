const fs = require('fs');
const prisma = require('../config/db');

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