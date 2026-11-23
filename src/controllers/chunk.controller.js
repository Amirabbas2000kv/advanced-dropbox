const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');
const prisma = require('../config/db');
const uploadConfig = require('../config/upload.config');
const { emitToUser } = require('../realtime/socket');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const TMP_ROOT = path.join(UPLOAD_ROOT, '.tmp');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sessionDir = (id) => path.join(TMP_ROOT, id);

// Find a session that belongs to the logged-in user (null if not found / invalid id)
const findSession = async (id, userId) => {
  if (!UUID_REGEX.test(id)) return null; // blocks path traversal like "../../x"
  return prisma.uploadSession.findFirst({ where: { id, userId } });
};

// List the chunk indexes that are already on disk
const receivedChunks = async (id) => {
  const names = await fsp.readdir(sessionDir(id)).catch(() => []);
  return names
    .filter((n) => /^\d+\.part$/.test(n))
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b);
};

// Append one file to the end of a write stream
const appendFile = async (out, partPath) => {
  for await (const data of fs.createReadStream(partPath)) {
    if (!out.write(data)) await once(out, 'drain');
  }
};

// 1) Start an upload session
exports.init = async (req, res) => {
  try {
    const fileName = typeof req.body.fileName === 'string' ? req.body.fileName.trim() : '';
    const totalSize = Number(req.body.totalSize);
    const mimeType =
      typeof req.body.mimeType === 'string' && req.body.mimeType
        ? req.body.mimeType
        : 'application/octet-stream';

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }
    if (!Number.isInteger(totalSize) || totalSize <= 0) {
      return res.status(400).json({ error: 'totalSize must be a positive integer (bytes)' });
    }

    const ext = path.extname(fileName).toLowerCase();
    if (uploadConfig.blockedExtensions.includes(ext)) {
      return res.status(415).json({ error: `File type "${ext}" is not allowed` });
    }
    if (totalSize > uploadConfig.maxChunkedFileSize) {
      return res.status(413).json({ error: 'File is too large (max 1 GB)' });
    }

    // Quota check
    const owner = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageLimit: true },
    });
    if (owner.storageUsed + totalSize > owner.storageLimit) {
      return res.status(413).json({ error: 'Storage quota exceeded' });
    }

    // Optional target folder
    let folderId = null;
    if (req.body.folderId !== undefined && req.body.folderId !== null && req.body.folderId !== '') {
      folderId = Number(req.body.folderId);
      const folder = Number.isInteger(folderId)
        ? await prisma.folder.findFirst({ where: { id: folderId, userId: req.user.id } })
        : null;
      if (!folder) {
        return res.status(404).json({ error: 'Target folder not found' });
      }
    }

    const id = crypto.randomUUID();
    const chunkSize = uploadConfig.chunkSize;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    await prisma.uploadSession.create({
      data: { id, userId: req.user.id, fileName, mimeType, totalSize, chunkSize, totalChunks, folderId },
    });
    await fsp.mkdir(sessionDir(id), { recursive: true });

    return res.status(201).json({ uploadId: id, chunkSize, totalChunks });
  } catch (err) {
    console.error('Init upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// 2) Receive one chunk (raw binary body)
exports.uploadChunk = async (req, res) => {
  try {
    const session = await findSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      return res.status(400).json({ error: `Chunk index must be between 0 and ${session.totalChunks - 1}` });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res
        .status(400)
        .json({ error: 'Chunk body is empty. Send raw bytes with Content-Type: application/octet-stream' });
    }

    // Every chunk must be exactly chunkSize, except the last one
    const isLast = index === session.totalChunks - 1;
    const expected = isLast ? session.totalSize - session.chunkSize * (session.totalChunks - 1) : session.chunkSize;
    if (req.body.length !== expected) {
      return res.status(400).json({ error: `Chunk ${index} must be exactly ${expected} bytes (got ${req.body.length})` });
    }

    await fsp.mkdir(sessionDir(session.id), { recursive: true });
    await fsp.writeFile(path.join(sessionDir(session.id), `${index}.part`), req.body);

    return res.json({ message: 'Chunk received', index });
  } catch (err) {
    console.error('Upload chunk error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// 3) Which chunks are already uploaded? (used for resume)
exports.status = async (req, res) => {
  try {
    const session = await findSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    const received = await receivedChunks(session.id);
    return res.json({
      uploadId: session.id,
      fileName: session.fileName,
      totalChunks: session.totalChunks,
      received,
      remaining: session.totalChunks - received.length,
    });
  } catch (err) {
    console.error('Upload status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// 4) Merge all chunks into the final file
exports.complete = async (req, res) => {
  let finalPath = null;
  try {
    const session = await findSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    // Make sure every chunk is here
    const received = await receivedChunks(session.id);
    const have = new Set(received);
    const missing = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!have.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      return res.status(400).json({ error: 'Some chunks are missing', missing: missing.slice(0, 50) });
    }

    // Re-check quota (the user may have uploaded other files meanwhile)
    const owner = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageLimit: true },
    });
    if (owner.storageUsed + session.totalSize > owner.storageLimit) {
      return res.status(413).json({ error: 'Storage quota exceeded' });
    }

    // Re-check the target folder (it may have been deleted)
    if (session.folderId !== null) {
      const folder = await prisma.folder.findFirst({ where: { id: session.folderId, userId: req.user.id } });
      if (!folder) {
        return res.status(404).json({ error: 'Target folder no longer exists' });
      }
    }

    // Merge chunks in order
    const storedName = crypto.randomUUID();
    const userDir = path.join(UPLOAD_ROOT, String(req.user.id));
    await fsp.mkdir(userDir, { recursive: true });
    finalPath = path.join(userDir, storedName);

    const out = fs.createWriteStream(finalPath);
    for (let i = 0; i < session.totalChunks; i++) {
      await appendFile(out, path.join(sessionDir(session.id), `${i}.part`));
    }
    await new Promise((resolve, reject) => {
      out.on('error', reject);
      out.end(resolve);
    });

    // Safety check: final size must match what the client declared
    const stat = await fsp.stat(finalPath);
    if (stat.size !== session.totalSize) {
      await fsp.unlink(finalPath).catch(() => {});
      return res.status(400).json({ error: 'Merged file size does not match the declared size' });
    }

    // Save the record, update storage and close the session in ONE transaction
    const [file] = await prisma.$transaction([
      prisma.file.create({
        data: {
          name: session.fileName,
          storedName,
          mimeType: session.mimeType,
          size: session.totalSize,
          userId: req.user.id,
          folderId: session.folderId,
        },
        select: { id: true, name: true, mimeType: true, size: true, folderId: true, createdAt: true },
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { storageUsed: { increment: session.totalSize } },
      }),
      prisma.uploadSession.delete({ where: { id: session.id } }),
    ]);

    // Remove the temp chunks
    await fsp.rm(sessionDir(session.id), { recursive: true, force: true });

    emitToUser(req.user.id, 'file:uploaded', file);
    return res.status(201).json({ message: 'File uploaded successfully', file });
  } catch (err) {
    if (finalPath) await fsp.unlink(finalPath).catch(() => {});
    console.error('Complete upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// 5) Cancel an upload and delete the temp chunks
exports.abort = async (req, res) => {
  try {
    const session = await findSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    await fsp.rm(sessionDir(session.id), { recursive: true, force: true });
    await prisma.uploadSession.delete({ where: { id: session.id } });

    return res.json({ message: 'Upload cancelled' });
  } catch (err) {
    console.error('Abort upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};