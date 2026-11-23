// End-to-end test for sharing with other users. Run with: node scripts/test-collab.js
const BASE = 'http://localhost:3000/api';
const PASSWORD = '12345678';
const CONTENT = 'shared with a friend';

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

const jsonReq = (method, url, auth, body) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

const getJson = async (url, auth) => (await fetch(`${BASE}${url}`, { headers: auth })).json();

async function main() {
  const owner = await login('test@example.com');
  const friend = await login('hacker@example.com'); // plays the role of the friend

  // Owner uploads a file
  const form = new FormData();
  form.append('file', new Blob([CONTENT]), 'collab-test.txt');
  let res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: owner, body: form });
  const fileId = (await res.json()).file.id;

  // 1) Before sharing, the friend has no access
  res = await fetch(`${BASE}/collab/files/${fileId}/download`, { headers: friend });
  check('friend cannot download before sharing (404)', res.status === 404);

  // 2) Share with read permission
  res = await jsonReq('POST', '/collab', owner, { fileId, email: 'hacker@example.com', permission: 'read' });
  const created = await res.json();
  check('share with read permission (201)', res.status === 201);

  // 3) Friend downloads
  res = await fetch(`${BASE}/collab/files/${fileId}/download`, { headers: friend });
  const text = await res.text();
  check('friend downloads the shared file, content matches', res.status === 200 && text === CONTENT);

  // 4) The file shows up in "shared with me"
  let withMe = await getJson('/collab/with-me', friend);
  const entry = withMe.shares.find((s) => s.file.id === fileId);
  check('file is listed in with-me as "read"', entry && entry.permission === 'read');

  // 5) Read-only friend cannot rename
  res = await jsonReq('PATCH', `/collab/files/${fileId}/rename`, friend, { name: 'hacked.txt' });
  check('read-only friend cannot rename (403)', res.status === 403);

  // 6) Friend is not the owner, so cannot share it further
  res = await jsonReq('POST', '/collab', friend, { fileId, email: 'test@example.com' });
  check('non-owner cannot share the file (404)', res.status === 404);

  // 7) Upgrade to edit
  res = await jsonReq('POST', '/collab', owner, { fileId, email: 'hacker@example.com', permission: 'edit' });
  check('permission upgraded to edit (201)', res.status === 201);

  // 8) Now the friend can rename
  res = await jsonReq('PATCH', `/collab/files/${fileId}/rename`, friend, { name: 'renamed-by-friend.txt' });
  check('editor can rename (200)', res.status === 200);
  const myFiles = await getJson('/files', owner);
  check('owner sees the new name', myFiles.files.some((f) => f.id === fileId && f.name === 'renamed-by-friend.txt'));

  // 9) by-me list: exactly one share, with "edit"
  const byMe = await getJson('/collab/by-me', owner);
  const mine = byMe.shares.filter((s) => s.file.id === fileId);
  check('by-me shows one share with edit', mine.length === 1 && mine[0].permission === 'edit');

  // 10) Validation
  res = await jsonReq('POST', '/collab', owner, { fileId, email: 'test@example.com' });
  check('sharing with yourself is rejected (400)', res.status === 400);
  res = await jsonReq('POST', '/collab', owner, { fileId, email: 'nobody@example.com' });
  check('unknown email is rejected (404)', res.status === 404);
  res = await jsonReq('POST', '/collab', owner, { fileId, email: 'hacker@example.com', permission: 'admin' });
  check('invalid permission is rejected (400)', res.status === 400);

  // 11) Owner revokes access
  res = await jsonReq('DELETE', `/collab/${created.share.id}`, owner);
  check('owner revokes access (200)', res.status === 200);
  res = await fetch(`${BASE}/collab/files/${fileId}/download`, { headers: friend });
  check('friend loses access after revoke (404)', res.status === 404);

  // 12) Share again, then trash the file: access must stop
  await jsonReq('POST', '/collab', owner, { fileId, email: 'hacker@example.com', permission: 'read' });
  await jsonReq('DELETE', `/files/${fileId}`, owner);
  res = await fetch(`${BASE}/collab/files/${fileId}/download`, { headers: friend });
  check('trashed file is not accessible to the friend (404)', res.status === 404);
  withMe = await getJson('/collab/with-me', friend);
  check('trashed file disappears from with-me', !withMe.shares.some((s) => s.file.id === fileId));

  // Clean up (permanent delete also removes the shares)
  await jsonReq('DELETE', `/files/${fileId}/permanent`, owner);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All collaboration tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});