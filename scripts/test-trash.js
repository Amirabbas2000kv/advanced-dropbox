// End-to-end test for the trash feature. Run with: node scripts/test-trash.js
const BASE = 'http://localhost:3000/api';
const PASSWORD = '12345678';

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

const getJson = async (url, auth) => (await fetch(`${BASE}${url}`, { headers: auth })).json();
const send = (method, url, auth) => fetch(`${BASE}${url}`, { method, headers: auth });

async function main() {
  const auth = await login('test@example.com');
  const hacker = await login('hacker@example.com');

  const usedAtStart = (await getJson('/files/storage', auth)).used;

  // 1) Upload a small file
  const form = new FormData();
  form.append('file', new Blob(['trash me please']), 'trash-test.txt');
  let res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: auth, body: form });
  const uploaded = await res.json();
  const id = uploaded.file.id;
  check(`uploaded trash-test.txt (id=${id})`, res.status === 201);

  // 2) Delete -> goes to trash
  res = await send('DELETE', `/files/${id}`, auth);
  check('delete moves the file to trash (200)', res.status === 200);

  // 3) It must NOT be in the normal list
  let list = await getJson('/files', auth);
  check('file is NOT in the normal list', !list.files.some((f) => f.id === id));

  // 4) It must be in the trash list
  let trash = await getJson('/files/trash', auth);
  check('file IS in the trash list', trash.files.some((f) => f.id === id));

  // 5) Download must fail while in trash
  res = await send('GET', `/files/${id}/download`, auth);
  check('download of a trashed file is rejected (404)', res.status === 404);

  // 6) Storage is NOT freed yet
  let used = (await getJson('/files/storage', auth)).used;
  check('storage is still used while file is in trash', used > usedAtStart);

  // 7) Another user cannot restore or permanently delete it
  res = await send('POST', `/files/${id}/restore`, hacker);
  check('other user cannot restore it (404)', res.status === 404);
  res = await send('DELETE', `/files/${id}/permanent`, hacker);
  check('other user cannot delete it permanently (404)', res.status === 404);

  // 8) Restore
  res = await send('POST', `/files/${id}/restore`, auth);
  check('restore works (200)', res.status === 200);
  list = await getJson('/files', auth);
  check('file is back in the normal list', list.files.some((f) => f.id === id));

  // 9) Permanent delete of a file that is NOT in trash must fail
  res = await send('DELETE', `/files/${id}/permanent`, auth);
  check('permanent delete of a non-trashed file is rejected (404)', res.status === 404);

  // 10) Trash again, then delete for good
  await send('DELETE', `/files/${id}`, auth);
  res = await send('DELETE', `/files/${id}/permanent`, auth);
  check('permanent delete works (200)', res.status === 200);

  // 11) Storage is back to the start value
  used = (await getJson('/files/storage', auth)).used;
  check('storage is freed after permanent delete', used === usedAtStart);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All trash tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});