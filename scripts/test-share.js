// End-to-end test for share links. Run with: node scripts/test-share.js
const BASE = 'http://localhost:3000/api';
const PASSWORD = '12345678';
const CONTENT = 'secret shared content';

const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { token } = await res.json();
  return { Authorization: `Bearer ${token}` };
}

const createShare = async (auth, body) => {
  const res = await fetch(`${BASE}/shares`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const publicGet = (token) => fetch(`${BASE}/public/${token}`); // NOTE: no auth header

async function main() {
  const auth = await login('test@example.com');
  const hacker = await login('hacker@example.com');

  // Upload a file
  const form = new FormData();
  form.append('file', new Blob([CONTENT]), 'share-test.txt');
  let res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: auth, body: form });
  const fileId = (await res.json()).file.id;

  // 1) Create a link
  const s1 = await createShare(auth, { fileId });
  check('share link created (201)', s1.status === 201 && s1.body.share.token.length === 48);
  const token = s1.body.share.token;

  // 2) Download WITHOUT login
  res = await publicGet(token);
  const text = await res.text();
  check('public download works without login and content matches', res.status === 200 && text === CONTENT);

  // 3) Another user cannot share my file
  const s2 = await createShare(hacker, { fileId });
  check('other user cannot create a link for my file (404)', s2.status === 404);

  // 4) The link is in my list, with download count
  const list = await (await fetch(`${BASE}/shares`, { headers: auth })).json();
  const mine = list.shares.find((s) => s.token === token);
  check('link is in my list and downloadCount = 1', mine && mine.downloadCount === 1);

  // 5) Another user cannot revoke my link
  res = await fetch(`${BASE}/shares/${mine.id}`, { method: 'DELETE', headers: hacker });
  check('other user cannot revoke my link (404)', res.status === 404);

  // 6) I revoke it, then it stops working
  res = await fetch(`${BASE}/shares/${mine.id}`, { method: 'DELETE', headers: auth });
  check('revoke works (200)', res.status === 200);
  res = await publicGet(token);
  check('revoked link no longer works (404)', res.status === 404);

  // 7) Expiring link
  const s3 = await createShare(auth, { fileId, expiresInSeconds: 2 });
  res = await publicGet(s3.body.share.token);
  check('link works before it expires (200)', res.status === 200);
  await sleep(3000);
  res = await publicGet(s3.body.share.token);
  check('link is rejected after it expires (410)', res.status === 410);

  // 8) Bad expiry value
  const s4 = await createShare(auth, { fileId, expiresInSeconds: -5 });
  check('negative expiry is rejected (400)', s4.status === 400);

  // 9) A fake token
  res = await publicGet('0'.repeat(48));
  check('unknown token (404)', res.status === 404);
  res = await publicGet('not-a-real-token');
  check('garbage token (404)', res.status === 404);

  // 10) File in trash -> link stops working
  const s5 = await createShare(auth, { fileId });
  await fetch(`${BASE}/files/${fileId}`, { method: 'DELETE', headers: auth });
  res = await publicGet(s5.body.share.token);
  check('link of a trashed file does not work (404)', res.status === 404);

  // Clean up (permanent delete also removes the links)
  await fetch(`${BASE}/files/${fileId}/permanent`, { method: 'DELETE', headers: auth });

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All share tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});