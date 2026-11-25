const fs = require('fs');
const path = require('path');
const { isPreviewable } = require('./preview');

const HEAD_SIZE = 4096; // we only read the first 4 KB, never the whole file

const startsWith = (buf, bytes, offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

const ascii = (text) => Array.from(text).map((c) => c.charCodeAt(0));

// Known types. "mime" is only set for types where we trust our own detection.
const TYPES = [
  { name: 'png', mime: 'image/png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { name: 'jpeg', mime: 'image/jpeg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    name: 'gif',
    mime: 'image/gif',
    test: (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')),
  },
  { name: 'webp', mime: 'image/webp', test: (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8) },
  { name: 'pdf', mime: 'application/pdf', test: (b) => startsWith(b, ascii('%PDF-')) },
  // docx, xlsx and pptx are zip files too, so we do not override their MIME type
  {
    name: 'zip',
    mime: null,
    test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]),
  },
];

// If the file name says X, the content must really be X
const EXTENSION_RULES = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.pdf': 'pdf',
  '.zip': 'zip',
  '.docx': 'zip',
  '.xlsx': 'zip',
  '.pptx': 'zip',
};

// Real executable files, no matter what the name says
const isExecutable = (b) => {
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return true; // Linux (ELF)
  if (startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(b, [0xfe, 0xed, 0xfa, 0xcf])) return true; // macOS
  if (startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xcf, 0xfa, 0xed, 0xfe])) return true; // macOS
  if (startsWith(b, [0xca, 0xfe, 0xba, 0xbe])) return true; // Java class / macOS universal

  // Windows (PE): starts with "MZ" and has "PE\0\0" at the offset stored at byte 0x3C
  if (startsWith(b, ascii('MZ')) && b.length >= 0x40) {
    const offset = b.readUInt32LE(0x3c);
    if (offset + 4 <= b.length && startsWith(b, [0x50, 0x45, 0x00, 0x00], offset)) return true;
  }
  return false;
};

const readHead = async (filePath) => {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(HEAD_SIZE);
    const { bytesRead } = await handle.read(buf, 0, HEAD_SIZE, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

// Returns { ok: true, mime } or { ok: false, reason }
const inspectFile = async (filePath, originalName) => {
  const head = await readHead(filePath);

  if (isExecutable(head)) {
    return { ok: false, reason: 'Executable files are not allowed' };
  }

  const detected = TYPES.find((t) => t.test(head)) || null;
  const ext = path.extname(originalName || '').toLowerCase();
  const expected = EXTENSION_RULES[ext];

  if (expected && (!detected || detected.name !== expected)) {
    return { ok: false, reason: `File content does not match its "${ext}" extension` };
  }

  return { ok: true, mime: detected ? detected.mime : null };
};

// Decide which MIME type we store. We never trust the client for "previewable" types.
const resolveMime = (result, claimedMime) => {
  if (result.mime) return result.mime; // detected from the real content
  if (claimedMime !== 'text/plain' && isPreviewable(claimedMime)) {
    return 'application/octet-stream'; // client claimed image/pdf but the content is not
  }
  return claimedMime;
};

module.exports = { inspectFile, resolveMime };