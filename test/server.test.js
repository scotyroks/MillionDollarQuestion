const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let tmp;

// Reads the first SSE payload from a stream.
async function firstEvent(url) {
  const controller = new AbortController();
  const res = await fetch(url, { signal: controller.signal });
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('data: ')) text += new TextDecoder().decode((await reader.read()).value);
  while (!/data: .*\n\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  return JSON.parse(text.match(/data: (.*)\n\n/)[1]);
}

const post = (p, body) => fetch(BASE + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test.before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdq-'));
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST_KEY: 'k', QUESTIONS_FILE: path.join(tmp, 'q.json') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('Host controls')) resolve(); }));
});

test.after(() => {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('serves the three screens', async () => {
  for (const p of ['/host', '/display', '/vote']) {
    const res = await fetch(BASE + p);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
  assert.equal((await fetch(`${BASE}/nope.txt`)).status, 404);
});

test('creates the question file and keeps answers off the big screen', async () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'q.json'), 'utf8')).length, 15);
  const d = await firstEvent(`${BASE}/events?role=display`);
  assert.equal(d.questions, undefined);
  assert.equal(d.question.correct, null);
});

test('phones can vote only while voting is open', async () => {
  assert.equal((await post('/vote', { voterId: 'x', choice: 1 })).status, 409);
  assert.equal((await post('/action', { type: 'start_game' })).body.ok, true); // loopback = host
  await post('/action', { type: 'open_vote' });
  assert.equal((await post('/vote', { voterId: 'x', choice: 1 })).body.ok, true);
  const a = await firstEvent(`${BASE}/events?role=audience`);
  assert.equal(a.open, true);
  assert.equal(a.total, 1);
  assert.equal(a.correct, undefined);
});

test('rejects bad actions and serves the QR code', async () => {
  assert.equal((await post('/action', { type: 'explode' })).status, 400);
  const qr = await fetch(`${BASE}/qr/vote.svg`);
  assert.match(await qr.text(), /^<svg/);
});
