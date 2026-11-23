const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Only these types are shown inline. SVG and HTML are NOT here on purpose (XSS risk).
const PREVIEWABLE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

const isPreviewable = (mimeType) => PREVIEWABLE.has(mimeType);

// Send a stored file so the browser shows it inline (no download)
const sendPreview = (res, ownerId, file) => {
  const filePath = path.join(UPLOAD_ROOT, String(ownerId), file.storedName);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  // Even if something slips through, the file cannot run scripts or load anything
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");

  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File is missing on disk' });
    }
  });
};

module.exports = { isPreviewable, sendPreview };