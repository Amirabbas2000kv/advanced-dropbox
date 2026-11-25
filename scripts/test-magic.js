// End-to-end test for the real-content (magic bytes) check. Run with: node scripts/test-magic.js
const BASE = 'http://localhost:3000/api';
const PASSWORD = '12345678';

// ---- Fake file contents, built from raw bytes ----
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

// A minimal Windows executable header: "MZ" ... and "PE\0\0" at the offset stored at byte 0x3C
const WINDOWS_EXE = Buffer.alloc(128);
WINDOWS_EXE.write('MZ', 0, 'latin1');
WINDOWS_EXE.writeUInt32LE(0x40, 0x3c);
WINDOWS_EXE.write('PE\0\0', 0x40, 'latin1');

// A minimal Linux executable header
const LINUX_ELF = Buffer.alloc(64);
Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]).copy(LINUX_ELF);

const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) process.exitCode = 1;
};

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { token } = await res.json();
  return { Authorization: `Bearer ${token}` };
}

async function sendFile(auth, url, name, type, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers: auth, body: form });
  return { status: res.status, body: await res.json() };
}

const storageUsed = async (auth) => (await (await fetch(`${BASE}/files/storage`, { headers: auth })).json()).used;
const jsonHeaders = (auth) => ({ ...auth, 'Content-Type': 'application/json' });

async function chunkedUpload(auth, fileName, mimeType, content) {
  let res = await fetch(`${BASE}/uploads/init`, {
    method: 'POST',
    headers: jsonHeaders(auth),
    body: JSON.stringify({ fileName, totalSize: content.length, mimeType }),
  });
  const init = await res.json();
  await fetch(`${BASE}/uploads/${init.uploadId}/chunks/0`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/octet-stream' },
    body: content,
  });
  res = await fetch(`${BASE}/uploads/${init.uploadId}/complete`, { method: 'POST', headers: auth });
  return { uploadId: init.uploadId, status: res.status, body: await res.json() };
}

async function main() {
  const auth = await login('test@example.com');
  const usedAtStart = await storageUsed(auth);
  const created = []; // ids of files that must be cleaned up at the end

  // 1) A real PNG is accepted and gets the right type
  let r = await sendFile(auth, '/files/upload', 'pixel.png', 'image/png', PNG);
  check('real PNG is accepted (201)', r.status === 201);
  check('stored type is image/png', r.body.file && r.body.file.mimeType === 'image/png');
  if (r.body.file) created.push(r.body.file.id);

  // 2) A Windows executable renamed to .png
  r = await sendFile(auth, '/files/upload', 'photo.png', 'image/png', WINDOWS_EXE);
  check('Windows .exe renamed to .png is rejected (415)', r.status === 415);

  // 3) The same executable renamed to .txt (executables are blocked whatever the name is)
  r = await sendFile(auth, '/files/upload', 'notes.txt', 'text/plain', WINDOWS_EXE);
  check('Windows .exe renamed to .txt is rejected (415)', r.status === 415);

  // 4) A Linux executable with a harmless name
  r = await sendFile(auth, '/files/upload', 'data.bin', 'application/octet-stream', LINUX_ELF);
  check('Linux executable named .bin is rejected (415)', r.status === 415);

  // 5) A text file pretending to be a PNG
  r = await sendFile(auth, '/files/upload', 'fake.png', 'image/png', 'I am not an image');
  check('text file named .png is rejected (415)', r.status === 415);

  // 6) A real PDF
  r = await sendFile(auth, '/files/upload', 'doc.pdf', 'application/pdf', PDF);
  check('real PDF is accepted (201)', r.status === 201);
  if (r.body.file) created.push(r.body.file.id);

  // 7) A text file that LIES about its type (sends image/png in the header)
  r = await sendFile(auth, '/files/upload', 'page.txt', 'image/png', 'just some text');
  check('lying type is accepted but stored as application/octet-stream', r.status === 201 && r.body.file.mimeType === 'application/octet-stream');
  if (r.body.file) {
    created.push(r.body.file.id);
    const res = await fetch(`${BASE}/files/${r.body.file.id}/preview`, { headers: auth });
    check('the lying file cannot be previewed (415)', res.status === 415);
  }

  // 8) A real PNG with a wrong name gets its TRUE type
  r = await sendFile(auth, '/files/upload', 'image.txt', 'text/plain', PNG);
  check('PNG named .txt is stored as image/png', r.status === 201 && r.body.file.mimeType === 'image/png');
  if (r.body.file) created.push(r.body.file.id);

  // 9) New version with an executable inside
  r = await sendFile(auth, '/files/upload', 'versioned.txt', 'text/plain', 'version one');
  const versionedId = r.body.file.id;
  created.push(versionedId);
  r = await sendFile(auth, `/files/${versionedId}/versions`, 'versioned.txt', 'text/plain', WINDOWS_EXE);
  check('new version containing an executable is rejected (415)', r.status === 415);
  const list = await (await fetch(`${BASE}/files/${versionedId}/versions`, { headers: auth })).json();
  check('the file still has only 1 version', list.count === 1);

  // 10) Chunked upload: fake PNG is rejected when merging, and the session is cleaned
  const fakeChunked = await chunkedUpload(auth, 'trick.png', 'image/png', Buffer.from('x'.repeat(100)));
  check('chunked upload of a fake PNG is rejected (415)', fakeChunked.status === 415);
  const st = await fetch(`${BASE}/uploads/${fakeChunked.uploadId}`, { headers: auth });
  check('the rejected upload session is removed (404)', st.status === 404);

  // 11) Chunked upload: a real PNG is accepted
  const goodChunked = await chunkedUpload(auth, 'real.png', 'image/png', PNG);
  check('chunked upload of a real PNG is accepted (201)', goodChunked.status === 201);
  if (goodChunked.body.file) created.push(goodChunked.body.file.id);

  // Clean up everything we created, then storage must be back to the start value
  for (const id of created) {
    await fetch(`${BASE}/files/${id}`, { method: 'DELETE', headers: auth });
    await fetch(`${BASE}/files/${id}/permanent`, { method: 'DELETE', headers: auth });
  }
  const usedAtEnd = await storageUsed(auth);
  check('rejected files left no trace in the storage counter', usedAtEnd === usedAtStart);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All content-check tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});