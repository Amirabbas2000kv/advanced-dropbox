// End-to-end test for folder delete. Run with: node scripts/test-folders.js
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

const jsonHeaders = (auth) => ({ ...auth, 'Content-Type': 'application/json' });

async function createFolder(auth, name, parentId) {
  const res = await fetch(`${BASE}/folders`, {
    method: 'POST',
    headers: jsonHeaders(auth),
    body: JSON.stringify({ name, parentId }),
  });
  return (await res.json()).folder.id;
}

async function upload(auth, name, content, folderId) {
  const form = new FormData();
  if (folderId) form.append('folderId', String(folderId)); // must come BEFORE the file
  form.append('file', new Blob([content]), name);
  const res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: auth, body: form });
  return (await res.json()).file.id;
}

const storageUsed = async (auth) => (await (await fetch(`${BASE}/files/storage`, { headers: auth })).json()).used;

async function main() {
  const auth = await login('test@example.com');
  const hacker = await login('hacker@example.com');

  const usedAtStart = await storageUsed(auth);

  // Build:  Top / Mid / Deep   with a file in each level
  const top = await createFolder(auth, `top-${Date.now()}`, null);
  const mid = await createFolder(auth, 'mid', top);
  const deep = await createFolder(auth, 'deep', mid);
  const f1 = await upload(auth, 'a.txt', 'aaaaa', top);
  const f2 = await upload(auth, 'b.txt', 'bbbbbbbb', mid);
  const f3 = await upload(auth, 'c.txt', 'ccc', deep);
  check('built a 3-level tree with 3 files', top && mid && deep && f1 && f2 && f3);

  const usedWithFiles = await storageUsed(auth);
  check('storage grew by 16 bytes (5 + 8 + 3)', usedWithFiles - usedAtStart === 16);

  // Another user cannot delete my folder
  let res = await fetch(`${BASE}/folders/${top}`, { method: 'DELETE', headers: hacker });
  check('other user cannot delete my folder (404)', res.status === 404);

  // Trash one file first: it must still be cleaned up with the folder
  await fetch(`${BASE}/files/${f2}`, { method: 'DELETE', headers: auth });

  // Delete the top folder
  res = await fetch(`${BASE}/folders/${top}`, { method: 'DELETE', headers: auth });
  const body = await res.json();
  check('delete top folder works (200)', res.status === 200);
  check('3 folders and 3 files were deleted', body.deletedFolders === 3 && body.deletedFiles === 3);

  // Everything is gone
  res = await fetch(`${BASE}/folders/${mid}`, { headers: auth });
  check('sub-folder no longer exists (404)', res.status === 404);
  res = await fetch(`${BASE}/files/${f3}/download`, { headers: auth });
  check('file inside the deep folder is gone (404)', res.status === 404);

  // Storage is back to the start value
  const usedAtEnd = await storageUsed(auth);
  check('storage is freed', usedAtEnd === usedAtStart);

  // Deleting again must fail
  res = await fetch(`${BASE}/folders/${top}`, { method: 'DELETE', headers: auth });
  check('deleting a deleted folder is rejected (404)', res.status === 404);

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All folder tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});