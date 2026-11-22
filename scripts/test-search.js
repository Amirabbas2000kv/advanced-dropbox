// End-to-end test for search. Run with: node scripts/test-search.js
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

async function upload(auth, name, type, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  const res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: auth, body: form });
  return (await res.json()).file.id;
}

const search = async (query, auth) => {
  const res = await fetch(`${BASE}/search?${query}`, { headers: auth });
  return { status: res.status, body: await res.json() };
};

async function remove(auth, id) {
  await fetch(`${BASE}/files/${id}`, { method: 'DELETE', headers: auth });
  await fetch(`${BASE}/files/${id}/permanent`, { method: 'DELETE', headers: auth });
}

async function main() {
  const auth = await login('test@example.com');
  const hacker = await login('hacker@example.com');

  const id1 = await upload(auth, 'zebra-report.txt', 'text/plain', 'hello');
  const id2 = await upload(auth, 'zebra-photo.png', 'image/png', 'fakepng');

  // Text search
  let r = await search('q=zebra', auth);
  check('q=zebra finds both files', r.body.files.length === 2);

  r = await search('q=ZEBRA-REPORT', auth);
  check('search is not case-sensitive', r.body.files.some((f) => f.id === id1));

  // Type filter
  r = await search('q=zebra&type=image', auth);
  check('q=zebra&type=image finds only the image', r.body.files.length === 1 && r.body.files[0].id === id2);

  // Other user sees nothing
  r = await search('q=zebra', hacker);
  check('other user finds nothing', r.body.files.length === 0);

  // Trashed file is hidden
  await fetch(`${BASE}/files/${id1}`, { method: 'DELETE', headers: auth });
  r = await search('q=zebra', auth);
  check('trashed file is not in results', r.body.files.length === 1 && r.body.files[0].id === id2);

  // Validation
  r = await search('', auth);
  check('empty search is rejected (400)', r.status === 400);
  r = await search('type=banana', auth);
  check('unknown type is rejected (400)', r.status === 400);

  // Clean up
  await remove(auth, id1);
  await remove(auth, id2);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All search tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});