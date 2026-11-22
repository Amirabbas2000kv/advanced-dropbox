// End-to-end test for chunked upload. Run with: node scripts/test-chunked.js
const crypto = require('crypto');

const BASE = 'http://localhost:3000/api';
const EMAIL = 'test@example.com';
const PASSWORD = '12345678';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) process.exitCode = 1;
};

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { token } = await loginRes.json();
  const auth = { Authorization: `Bearer ${token}` };
  const json = { ...auth, 'Content-Type': 'application/json' };

  // ---- Test 1: blocked extension is rejected at init ----
  let res = await fetch(`${BASE}/uploads/init`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ fileName: 'virus.exe', totalSize: 100 }),
  });
  check('init rejects .exe (415)', res.status === 415);

  // ---- Test 2: full upload of a ~12 MB random file ----
  const data = crypto.randomBytes(12 * 1024 * 1024 + 123);
  const originalHash = sha256(data);

  res = await fetch(`${BASE}/uploads/init`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ fileName: 'big-test.bin', totalSize: data.length, mimeType: 'application/octet-stream' }),
  });
  const init = await res.json();
  check(`init OK (uploadId=${init.uploadId}, totalChunks=${init.totalChunks})`, res.status === 201 && init.totalChunks === 3);

  for (let i = 0; i < init.totalChunks; i++) {
    const chunk = data.subarray(i * init.chunkSize, (i + 1) * init.chunkSize);
    res = await fetch(`${BASE}/uploads/${init.uploadId}/chunks/${i}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/octet-stream' },
      body: chunk,
    });
    check(`chunk ${i} uploaded (${chunk.length} bytes)`, res.status === 200);

    if (i === 0) {
      const st = await (await fetch(`${BASE}/uploads/${init.uploadId}`, { headers: auth })).json();
      check(`status after chunk 0: received=[${st.received}] remaining=${st.remaining}`, st.remaining === 2);
    }
  }

  res = await fetch(`${BASE}/uploads/${init.uploadId}/complete`, { method: 'POST', headers: auth });
  const done = await res.json();
  check('complete OK (201)', res.status === 201);

  // Download it back and compare hashes
  res = await fetch(`${BASE}/files/${done.file.id}/download`, { headers: auth });
  const downloaded = Buffer.from(await res.arrayBuffer());
  check('downloaded file has the same SHA-256 as the original', sha256(downloaded) === originalHash);

  // Clean up: move to trash, then delete permanently (frees the quota)
  res = await fetch(`${BASE}/files/${done.file.id}`, { method: 'DELETE', headers: auth });
  check('test file moved to trash', res.status === 200);
  res = await fetch(`${BASE}/files/${done.file.id}/permanent`, { method: 'DELETE', headers: auth });
  check('test file deleted permanently', res.status === 200);

  // ---- Test 3: complete with missing chunks must fail ----
  res = await fetch(`${BASE}/uploads/init`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ fileName: 'partial.bin', totalSize: 6 * 1024 * 1024 }),
  });
  const init2 = await res.json();
  res = await fetch(`${BASE}/uploads/${init2.uploadId}/chunks/0`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/octet-stream' },
    body: crypto.randomBytes(init2.chunkSize),
  });
  res = await fetch(`${BASE}/uploads/${init2.uploadId}/complete`, { method: 'POST', headers: auth });
  const missingBody = await res.json();
  check(`complete with a missing chunk is rejected (missing=[${missingBody.missing}])`, res.status === 400);

  // ---- Test 4: wrong chunk size is rejected ----
  res = await fetch(`${BASE}/uploads/${init2.uploadId}/chunks/1`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/octet-stream' },
    body: crypto.randomBytes(500),
  });
  check('wrong chunk size is rejected (400)', res.status === 400);

  // ---- Test 5: abort ----
  res = await fetch(`${BASE}/uploads/${init2.uploadId}`, { method: 'DELETE', headers: auth });
  check('abort OK (200)', res.status === 200);

  // ---- Test 6: another user cannot touch this session ----
  const res2 = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hacker@example.com', password: PASSWORD }),
  });
  const hackerToken = (await res2.json()).token;
  res = await fetch(`${BASE}/uploads/${init.uploadId}`, { headers: { Authorization: `Bearer ${hackerToken}` } });
  check('session of another user is not accessible (404)', res.status === 404);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All chunked-upload tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});