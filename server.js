/*
 * Million Dollar Question — game night server
 * Pure Node.js, zero dependencies. Run with: node server.js
 *
 *   /host     control panel (needs the host key, or open it on this computer)
 *   /display  big screen for the contestant / room
 *   /vote     audience phones for Ask the Audience
 *
 * Sync: each screen holds a Server-Sent Events stream (/events?role=…) that
 * only ever carries what that screen may see. The host drives the game with
 * POST /action; phones can only POST /vote.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createGame } = require('./lib/game');
const { loadQuestions, saveQuestions } = require('./lib/questions');
const qr = require('./lib/qr');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const QUESTIONS_FILE = process.env.QUESTIONS_FILE || path.join(__dirname, 'questions.json');
const KEY_FILE = path.join(__dirname, '.host-key');
const MAX_BODY = 1e6;

// ---- Host key --------------------------------------------------------------
// Keeps phones on the same Wi-Fi from driving the game. Set HOST_KEY to choose
// your own; otherwise one is generated once and remembered in .host-key.
function loadHostKey() {
  if (process.env.HOST_KEY) return process.env.HOST_KEY.trim();
  try {
    const saved = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (saved) return saved;
  } catch (_) { /* first run */ }
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
  const key = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
  try { fs.writeFileSync(KEY_FILE, key + '\n'); } catch (_) { /* still works for this run */ }
  return key;
}
const HOST_KEY = loadHostKey();

function isLoopback(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function keyMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(HOST_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isHost(req, url) {
  return isLoopback(req) || keyMatches(req.headers['x-host-key'] || url.searchParams.get('key'));
}

// ---- Network address -------------------------------------------------------
function lanAddress() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
    }
  }
  // Prefer typical home-network ranges over VPN / container adapters.
  return candidates.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(a))
    || candidates[0] || 'localhost';
}
const BASE_URL = `http://${lanAddress()}:${PORT}`;
const VOTE_URL = `${BASE_URL}/vote`;
const VOTE_QR = qr.toSvg(VOTE_URL);

// ---- Game + live clients ---------------------------------------------------
const clients = new Set(); // { res, role }
let broadcastQueued = false;

function sendEvent(res, payload) {
  try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (_) { /* dropped */ }
}

// Coalesce bursts (e.g. many phones voting at once) into one push per tick.
function broadcast() {
  if (broadcastQueued) return;
  broadcastQueued = true;
  setImmediate(() => {
    broadcastQueued = false;
    const views = {};
    for (const c of clients) {
      views[c.role] = views[c.role] || game.view(c.role);
      sendEvent(c.res, views[c.role]);
    }
  });
}

const game = createGame({
  questions: loadQuestions(QUESTIONS_FILE),
  onChange: broadcast,
  onQuestions: (questions) => saveQuestions(QUESTIONS_FILE, questions),
});

// ---- HTTP helpers ----------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache', // always pick up edits on refresh
    });
    res.end(content);
  });
}

function readJson(req, cb) {
  let body = '';
  let tooBig = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
  });
  req.on('end', () => {
    if (tooBig) return;
    try { cb(null, JSON.parse(body || '{}')); } catch (err) { cb(err); }
  });
}

const PAGES = { '/': 'host.html', '/host': 'host.html', '/display': 'display.html', '/vote': 'vote.html' };

// ---- Routes ----------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (pathname === '/events' && req.method === 'GET') {
    let role = url.searchParams.get('role');
    if (!['host', 'display', 'audience'].includes(role)) role = 'audience';
    if (role === 'host' && !isHost(req, url)) return sendJson(res, 401, { ok: false, error: 'host key required' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    sendEvent(res, game.view(role));
    const client = { res, role };
    clients.add(client);
    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 20000);
    req.on('close', () => { clearInterval(keepAlive); clients.delete(client); });
    return;
  }

  if (pathname === '/action' && req.method === 'POST') {
    if (!isHost(req, url)) return sendJson(res, 401, { ok: false, error: 'host key required' });
    return readJson(req, (err, body) => {
      if (err) return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      const result = game.dispatch(body.type, body.payload);
      sendJson(res, result.ok ? 200 : 400, result);
    });
  }

  if (pathname === '/vote' && req.method === 'POST') {
    return readJson(req, (err, body) => {
      if (err) return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
      const result = game.castVote(body.voterId, body.choice);
      sendJson(res, result.ok ? 200 : 409, result);
    });
  }

  if (pathname === '/api/info' && req.method === 'GET') {
    return sendJson(res, 200, {
      voteUrl: VOTE_URL,
      displayUrl: `${BASE_URL}/display`,
      hostUrl: `${BASE_URL}/host?key=${isHost(req, url) ? HOST_KEY : ''}`,
      isHost: isHost(req, url),
    });
  }

  if (pathname === '/qr/vote.svg') {
    res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'no-cache' });
    return res.end(VOTE_QR);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET' });
    return res.end();
  }

  if (PAGES[pathname]) return serveFile(res, path.join(PUBLIC_DIR, PAGES[pathname]));

  // Static files, confined to public/
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_) { decoded = ''; }
  const filePath = path.join(PUBLIC_DIR, path.normalize(decoded));
  if (!decoded || !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  return serveFile(res, filePath);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try: PORT=${PORT + 1} node server.js\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log('\n  💰 Million Dollar Question — game night\n');
  console.log(`  Host controls   : ${BASE_URL}/host?key=${HOST_KEY}`);
  console.log(`  Big screen      : ${BASE_URL}/display`);
  console.log(`  Audience phones : ${VOTE_URL}`);
  console.log(`\n  On this computer you can also use http://localhost:${PORT}/host (no key needed).`);
  console.log('  Keep the host link to yourself — it lets a device run the game.\n');
});
