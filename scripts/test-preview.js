// End-to-end test for file preview. Run with: node scripts/test-preview.js
const BASE = 'http://localhost:3000/api';
const PASSWORD = '12345678';

// A tiny valid 1x1 PNG image
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

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

async function upload(auth, name, type, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  const res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: auth, body: form });
  return (await res.json()).file.id;
}

const jsonReq = (method, url, auth, body) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

async function main() {
  const owner = await login('test@example.com');
  const friend = await login('hacker@example.com');

  const pngId = await upload(owner, 'pixel.png', 'image/png', PNG);
  const txtId = await upload(owner, 'note.txt', 'text/plain', 'hello preview');
  const svgId = await upload(owner, 'evil.svg', 'image/svg+xml', '<svg onload="alert(1)"></svg>');
  const htmlId = await upload(owner, 'evil.html', 'text/html', '<script>alert(1)</script>');

  // 1) PNG preview
  let res = await fetch(`${BASE}/files/${pngId}/preview`, { headers: owner });
  const bytes = Buffer.from(await res.arrayBuffer());
  check('PNG preview works (200, image/png)', res.status === 200 && res.headers.get('content-type').startsWith('image/png'));
  check('PNG bytes are identical to the original', bytes.equals(PNG));

  // 2) Security headers
  check('header nosniff is set', res.headers.get('x-content-type-options') === 'nosniff');
  check('Content-Disposition is inline', (res.headers.get('content-disposition') || '').startsWith('inline'));
  check('CSP sandbox header is set', (res.headers.get('content-security-policy') || '').includes('sandbox'));

  // 3) Text preview
  res = await fetch(`${BASE}/files/${txtId}/preview`, { headers: owner });
  check('text preview works', res.status === 200 && (await res.text()) === 'hello preview');

  // 4) Dangerous types are refused
  res = await fetch(`${BASE}/files/${svgId}/preview`, { headers: owner });
  check('SVG preview is refused (415)', res.status === 415);
  res = await fetch(`${BASE}/files/${htmlId}/preview`, { headers: owner });
  check('HTML preview is refused (415)', res.status === 415);

  // 5) Other user has no access
  res = await fetch(`${BASE}/files/${pngId}/preview`, { headers: friend });
  check('other user cannot preview my file (404)', res.status === 404);
  res = await fetch(`${BASE}/collab/files/${pngId}/preview`, { headers: friend });
  check('friend cannot preview before sharing (404)', res.status === 404);

  // 6) Shared user can preview
  await jsonReq('POST', '/collab', owner, { fileId: pngId, email: 'hacker@example.com', permission: 'read' });
  res = await fetch(`${BASE}/collab/files/${pngId}/preview`, { headers: friend });
  check('shared user can preview (200)', res.status === 200);
  res = await fetch(`${BASE}/collab/files/${svgId}/preview`, { headers: friend });
  check('shared user cannot preview SVG (404, not shared)', res.status === 404);

  // 7) Trashed file cannot be previewed
  await fetch(`${BASE}/files/${txtId}`, { method: 'DELETE', headers: owner });
  res = await fetch(`${BASE}/files/${txtId}/preview`, { headers: owner });
  check('trashed file cannot be previewed (404)', res.status === 404);

  // 8) Invalid id
  res = await fetch(`${BASE}/files/abc/preview`, { headers: owner });
  check('invalid id is rejected (400)', res.status === 400);

  // Clean up
  for (const id of [pngId, txtId, svgId, htmlId]) {
    await fetch(`${BASE}/files/${id}`, { method: 'DELETE', headers: owner });
    await fetch(`${BASE}/files/${id}/permanent`, { method: 'DELETE', headers: owner });
  }

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All preview tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});