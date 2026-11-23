// End-to-end test for realtime events. Run with: node scripts/test-realtime.js
const { io } = require('socket.io-client');

const HOST = 'http://localhost:3000';
const BASE = `${HOST}/api`;
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
  return token;
}

// Connect and collect every event into an array
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(HOST, { auth: { token }, reconnection: false });
    const events = [];
    socket.onAny((name, data) => events.push({ name, data }));
    socket.on('connect', () => resolve({ socket, events }));
    socket.on('connect_error', (err) => reject(err));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (events, name) => events.some((e) => e.name === name);

async function main() {
  // 1) Bad token must be refused
  try {
    await connect('not-a-real-token');
    check('connection with a bad token is refused', false);
  } catch (err) {
    check('connection with a bad token is refused', err.message === 'Invalid or expired token');
  }

  // 2) No token at all must be refused
  try {
    await connect(undefined);
    check('connection without a token is refused', false);
  } catch (err) {
    check('connection without a token is refused', err.message === 'Authentication token is missing');
  }

  const ownerToken = await login('test@example.com');
  const friendToken = await login('hacker@example.com');
  const auth = { Authorization: `Bearer ${ownerToken}` };
  const json = { ...auth, 'Content-Type': 'application/json' };

  // Two tabs of the owner + one connection of the friend
  const tab1 = await connect(ownerToken);
  const tab2 = await connect(ownerToken);
  const friend = await connect(friendToken);
  check('3 authenticated connections are open', tab1.socket.connected && tab2.socket.connected && friend.socket.connected);

  // 3) Upload -> both owner tabs get "file:uploaded", the friend gets nothing
  const form = new FormData();
  form.append('file', new Blob(['realtime']), 'rt.txt');
  let res = await fetch(`${BASE}/files/upload`, { method: 'POST', headers: auth, body: form });
  const fileId = (await res.json()).file.id;
  await sleep(300);
  check('owner tab 1 got file:uploaded', has(tab1.events, 'file:uploaded'));
  check('owner tab 2 got file:uploaded', has(tab2.events, 'file:uploaded'));
  check('friend got NO events (privacy)', friend.events.length === 0);

  // 4) Rename
  await fetch(`${BASE}/files/${fileId}/rename`, { method: 'PATCH', headers: json, body: JSON.stringify({ name: 'rt2.txt' }) });
  await sleep(200);
  check('owner got file:renamed', has(tab1.events, 'file:renamed'));

  // 5) Share with the friend -> only the friend gets share:received
  await fetch(`${BASE}/collab`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ fileId, email: 'hacker@example.com', permission: 'read' }),
  });
  await sleep(200);
  const received = friend.events.find((e) => e.name === 'share:received');
  check('friend got share:received with the right file', received && received.data.fileId === fileId);
  check('owner did NOT get share:received', !has(tab1.events, 'share:received'));

  // 6) Folder created
  res = await fetch(`${BASE}/folders`, { method: 'POST', headers: json, body: JSON.stringify({ name: `rt-${Date.now()}` }) });
  const folderId = (await res.json()).folder.id;
  await sleep(200);
  check('owner got folder:created', has(tab1.events, 'folder:created'));

  // 7) Folder deleted
  await fetch(`${BASE}/folders/${folderId}`, { method: 'DELETE', headers: auth });
  await sleep(200);
  check('owner got folder:deleted', has(tab1.events, 'folder:deleted'));

  // 8) New version
  const vform = new FormData();
  vform.append('file', new Blob(['v2']), 'rt.txt');
  await fetch(`${BASE}/files/${fileId}/versions`, { method: 'POST', headers: auth, body: vform });
  await sleep(200);
  check('owner got file:version', has(tab1.events, 'file:version'));

  // 9) Trash -> restore -> trash -> delete forever
  await fetch(`${BASE}/files/${fileId}`, { method: 'DELETE', headers: auth });
  await sleep(150);
  check('owner got file:trashed', has(tab1.events, 'file:trashed'));
  await fetch(`${BASE}/files/${fileId}/restore`, { method: 'POST', headers: auth });
  await sleep(150);
  check('owner got file:restored', has(tab1.events, 'file:restored'));
  await fetch(`${BASE}/files/${fileId}`, { method: 'DELETE', headers: auth });
  await fetch(`${BASE}/files/${fileId}/permanent`, { method: 'DELETE', headers: auth });
  await sleep(200);
  check('owner got file:deleted', has(tab1.events, 'file:deleted'));

  tab1.socket.close();
  tab2.socket.close();
  friend.socket.close();

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All realtime tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});