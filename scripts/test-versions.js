// End-to-end test for file versions. Run with: node scripts/test-versions.js
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

const storageUsed = async (auth) => (await (await fetch(`${BASE}/files/storage`, { headers: auth })).json()).used;

async function sendFile(auth, url, content, name = 'doc.txt') {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return fetch(`${BASE}${url}`, { method: 'POST', headers: auth, body: form });
}

const downloadText = async (auth, url) => {
  const res = await fetch(`${BASE}${url}`, { headers: auth });
  return { status: res.status, text: await res.text() };
};

async function main() {
  const auth = await login('test@example.com');
  const hacker = await login('hacker@example.com');
  const usedAtStart = await storageUsed(auth);

  // v1
  let res = await sendFile(auth, '/files/upload', 'version-one');
  const id = (await res.json()).file.id;

  // v2, v3
  res = await sendFile(auth, `/files/${id}/versions`, 'version-two!');
  let body = await res.json();
  check('upload new version (201), currentVersion = 2', res.status === 201 && body.file.currentVersion === 2);
  res = await sendFile(auth, `/files/${id}/versions`, 'version-three!!');
  body = await res.json();
  check('upload another version, currentVersion = 3', body.file.currentVersion === 3);

  // Normal download returns the latest content
  let d = await downloadText(auth, `/files/${id}/download`);
  check('normal download returns the newest content', d.text === 'version-three!!');

  // List
  const list = await (await fetch(`${BASE}/files/${id}/versions`, { headers: auth })).json();
  check('list shows 3 versions, newest is current', list.count === 3 && list.versions[0].isCurrent === true);

  // Old versions are downloadable
  d = await downloadText(auth, `/files/${id}/versions/1/download`);
  check('version 1 content is preserved', d.text === 'version-one');
  d = await downloadText(auth, `/files/${id}/versions/2/download`);
  check('version 2 content is preserved', d.text === 'version-two!');

  // Storage counts all versions: 11 + 12 + 15 = 38
  const usedWith = await storageUsed(auth);
  check('storage counts every version (38 bytes)', usedWith - usedAtStart === 38);

  // Restore version 1 -> becomes version 4
  res = await fetch(`${BASE}/files/${id}/versions/1/restore`, { method: 'POST', headers: auth });
  body = await res.json();
  check('restore v1 creates version 4', res.status === 200 && body.file.currentVersion === 4);
  d = await downloadText(auth, `/files/${id}/download`);
  check('after restore, normal download returns v1 content', d.text === 'version-one');

  // Restoring the current version is rejected
  res = await fetch(`${BASE}/files/${id}/versions/4/restore`, { method: 'POST', headers: auth });
  check('restoring the current version is rejected (400)', res.status === 400);

  // Unknown version
  res = await fetch(`${BASE}/files/${id}/versions/99/download`, { headers: auth });
  check('unknown version (404)', res.status === 404);

  // Other user has no access
  res = await fetch(`${BASE}/files/${id}/versions`, { headers: hacker });
  check('other user cannot list versions (404)', res.status === 404);
  res = await sendFile(hacker, `/files/${id}/versions`, 'evil');
  check('other user cannot upload a version (404)', res.status === 404);

  // Add 3 more versions (v5, v6, v7): current + at most 5 old ones = 6 in total
  for (let i = 0; i < 3; i++) await sendFile(auth, `/files/${id}/versions`, `extra-${i}`);
  const list2 = await (await fetch(`${BASE}/files/${id}/versions`, { headers: auth })).json();
  check('at most 5 old versions are kept (6 in total)', list2.count === 6);

  // Delete for good: everything (all versions) must be freed
  await fetch(`${BASE}/files/${id}`, { method: 'DELETE', headers: auth });
  await fetch(`${BASE}/files/${id}/permanent`, { method: 'DELETE', headers: auth });
  const usedEnd = await storageUsed(auth);
  check('permanent delete frees ALL versions', usedEnd === usedAtStart);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All version tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});