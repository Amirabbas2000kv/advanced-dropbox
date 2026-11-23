// Security test. Run with: node scripts/test-security.js
// It starts its OWN server on port 3999 with the real limits (10 auth / 300 general),
// so your normal server and .env stay untouched.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3999;
const BASE = `http://localhost:${PORT}/api`;

const check = (label, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      RATE_LIMIT_MAX: '300',
      AUTH_RATE_LIMIT_MAX: '10',
    },
    stdio: 'ignore',
  });
  return child;
}

async function waitUntilUp() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch (e) {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

const post = (url, body) =>
  fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function main() {
  const server = startServer();
  try {
    check('test server started', await waitUntilUp());

    // --- Input validation (uses a few of the 10 auth attempts) ---
    let res = await post('/auth/login', { email: { $ne: null }, password: 'x' });
    check('object instead of email is rejected (400)', res.status === 400);

    res = await post('/auth/register', { email: 'a@b.com', name: 'A'.repeat(101), password: '12345678' });
    check('too long name is rejected (400)', res.status === 400);

    res = await post('/auth/register', { email: 'a@b.com', name: 'A', password: 'x'.repeat(73) });
    check('too long password is rejected (400)', res.status === 400);

    // --- Brute force: 10 attempts total are allowed, the 11th must be blocked ---
    // 3 attempts were used above, so 7 more are allowed
    let blockedAt = null;
    for (let i = 1; i <= 12; i++) {
      res = await post('/auth/login', { email: 'test@example.com', password: `wrong-password-${i}` });
      if (res.status === 429) {
        blockedAt = i;
        break;
      }
    }
    check(`password guessing is blocked with 429 (after ${blockedAt - 1} more attempts)`, blockedAt === 8);

    const body = await res.json();
    check('block message is clear', body.error.includes('Too many'));
    check('RateLimit headers are sent', res.headers.get('ratelimit') !== null || res.headers.get('ratelimit-policy') !== null);

    // Even the CORRECT password is blocked while the limit is active
    res = await post('/auth/login', { email: 'test@example.com', password: '12345678' });
    check('correct password is also blocked during the lockout (429)', res.status === 429);

    // --- General limit does not touch normal endpoints ---
    res = await fetch(`${BASE}/health`);
    check('health endpoint still works (200)', res.status === 200);
  } finally {
    server.kill();
  }

  console.log(process.exitCode ? '\n❌ Some tests FAILED' : '\n🎉 All security tests passed');
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});