/* Skypip — game + world leaderboard server.
 * Zero dependencies (Node 18+). Serves the game and a small JSON API:
 *
 *   GET  /api/health
 *   POST /api/session                     -> { token }            (call when a run starts)
 *   POST /api/scores  {playerId,name,score,token}
 *                                         -> { ok, best, weekBest, improved, rank:{all,week} }
 *   POST /api/name    {playerId,name}     -> { ok, name }
 *   GET  /api/scores?board=all|week&limit=50&player=ID
 *                                         -> { board, week, total, entries:[{rank,name,score,you}], you }
 *   GET  /api/presence                       -> { available, players, locations }
 *   POST /api/presence {sessionId,share}     -> { ok, located }
 *
 * Environment:
 *   PORT                 (default 3000)
 *   DATA_DIR             where scores.json lives (default ./data) — use a persistent disk in production
 *   ALLOW_ORIGIN         CORS origin allowed to call the API (default *)
 *   TRUST_PROXY=1        read the client IP from X-Forwarded-For (set this behind a host's proxy)
 *   LEADERBOARD_SECRET   HMAC secret for run tokens (default: generated and stored in DATA_DIR)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'scores.json');
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const MAX_SCORE = 9999;
const MAX_PLAYERS = 200000;
const TOKEN_MAX_AGE = 6 * 60 * 60 * 1000;
const MAX_BODY = 2048;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const NAME_RE = /^[\p{L}\p{N} _.\-]{2,14}$/u;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ------------------------------------------------------------------ secret
function loadSecret() {
  if (process.env.LEADERBOARD_SECRET) return process.env.LEADERBOARD_SECRET;
  const file = path.join(DATA_DIR, 'secret.key');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch (e) { /* first boot */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

// ------------------------------------------------------------------ storage
let db = { players: {} };
try {
  const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (parsed && typeof parsed.players === 'object' && parsed.players) db = parsed;
} catch (e) {
  if (e.code !== 'ENOENT') {
    // Never overwrite a file we could not read: keep it aside and start fresh.
    const bad = DB_FILE + '.corrupt-' + Date.now();
    try { fs.renameSync(DB_FILE, bad); console.error('scores.json unreadable, moved to', bad); } catch (e2) { /* ignore */ }
  }
}

const nameOwners = new Map();
for (const id of Object.keys(db.players)) {
  const p = db.players[id];
  if (p && typeof p.name === 'string') {
    const key = nameKey(cleanName(p.name) || p.name);
    if (!nameOwners.has(key)) nameOwners.set(key, id);
  }
}

let saveTimer = null;
function saveNow() {
  saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // atomic replace
}
function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(() => { try { saveNow(); } catch (e) { console.error('save failed', e); } }, 400);
}

// ------------------------------------------------------------------ boards
function weekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

const cache = { all: null, week: null, weekKey: '' };
function invalidate() { cache.all = cache.week = null; }

function byScore(a, b) { return b.score - a.score || a.at - b.at; }

function board(kind) {
  const wk = weekKey(new Date());
  if (kind === 'week') {
    if (cache.week && cache.weekKey === wk) return cache.week;
    const list = [];
    for (const id in db.players) {
      const p = db.players[id];
      if (p.week && p.week.key === wk) list.push({ id, name: p.name, score: p.week.score, at: p.week.at });
    }
    cache.week = list.sort(byScore);
    cache.weekKey = wk;
    return cache.week;
  }
  if (cache.all) return cache.all;
  const list = [];
  for (const id in db.players) {
    const p = db.players[id];
    if (p.best > 0) list.push({ id, name: p.name, score: p.best, at: p.bestAt });
  }
  cache.all = list.sort(byScore);
  return cache.all;
}

function rankOf(kind, id) {
  const list = board(kind);
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return i + 1;
  return null;
}

// ------------------------------------------------------------------ run tokens
function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
function newToken() {
  const payload = Date.now() + '.' + crypto.randomBytes(9).toString('base64url');
  return payload + '.' + sign(payload);
}
const usedNonces = new Map(); // nonce -> expiry

/** Returns the run's start time, or null when the token is invalid/reused. */
function consumeToken(token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[0] + '.' + parts[1];
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const started = Number(parts[0]);
  const age = Date.now() - started;
  if (!Number.isFinite(started) || age < 0 || age > TOKEN_MAX_AGE) return null;
  if (usedNonces.has(parts[1])) return null;
  usedNonces.set(parts[1], started + TOKEN_MAX_AGE);
  return started;
}

/** Fastest a legit run can reach `score`: ~1.9s to the first pipe, then ~1s per pipe. */
function minRunMs(score) {
  return 1200 + (score - 1) * 880;
}

// ------------------------------------------------------------------ rate limit
const hits = new Map(); // ip -> { n, reset }
function limited(ip, cost) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(ip, h); }
  h.n += cost;
  return h.n > 300;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 60000).unref();

// ------------------------------------------------------------------ helpers
function cleanName(v) {
  if (typeof v !== 'string') return null;
  const n = v.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(n) ? n : null;
}

function nameKey(name) {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function nameTaken(name, id) {
  const owner = nameOwners.get(nameKey(name));
  return !!owner && owner !== id;
}

function claimName(id, name) {
  const key = nameKey(name);
  const owner = nameOwners.get(key);
  if (owner && owner !== id) return false;
  const p = db.players[id];
  if (p && typeof p.name === 'string') {
    const previousKey = nameKey(cleanName(p.name) || p.name);
    if (nameOwners.get(previousKey) === id) nameOwners.delete(previousKey);
  }
  nameOwners.set(key, id);
  return true;
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || 'unknown';
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

// ------------------------------------------------------------------ API
async function api(req, res, url) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (limited(clientIp(req), req.method === 'POST' ? 5 : 1)) return send(res, 429, { error: 'Too many requests' });

  const route = req.method + ' ' + url.pathname;

  if (route === 'GET /api/health') return send(res, 200, { ok: true, players: Object.keys(db.players).length });

  if (route === 'POST /api/session') return send(res, 200, { token: newToken() });

  if (route === 'GET /api/presence') {
    return send(res, 200, { available: false, players: 0, locations: [] });
  }

  if (route === 'POST /api/presence') {
    let body;
    try { body = await readJson(req); } catch (e) { return send(res, 400, { error: 'Bad request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(body.sessionId) ||
        typeof body.share !== 'boolean') {
      return send(res, 400, { error: 'Bad request' });
    }
    return send(res, 200, { ok: true, located: false });
  }

  if (route === 'GET /api/scores') {
    const kind = url.searchParams.get('board') === 'all' ? 'all' : 'week';
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 50));
    const me = url.searchParams.get('player') || '';
    const list = board(kind);
    const entries = [];
    for (let i = 0; i < list.length && i < limit; i++) {
      entries.push({ rank: i + 1, name: list[i].name, score: list[i].score, you: list[i].id === me });
    }
    let you = null;
    if (ID_RE.test(me)) {
      const r = rankOf(kind, me);
      if (r) you = { rank: r, name: list[r - 1].name, score: list[r - 1].score };
    }
    return send(res, 200, { board: kind, week: weekKey(new Date()), total: list.length, entries, you });
  }

  if (route === 'POST /api/scores') {
    let body;
    try { body = await readJson(req); } catch (e) { return send(res, 400, { error: 'Bad request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'Bad request' });
    const id = body.playerId, score = body.score;
    const name = cleanName(body.name);
    if (typeof id !== 'string' || !ID_RE.test(id)) return send(res, 400, { error: 'Invalid player' });
    if (!name) return send(res, 400, { error: 'Invalid name' });
    if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return send(res, 400, { error: 'Invalid score' });
    if (nameTaken(name, id)) return send(res, 409, { error: 'Username already taken' });

    const started = consumeToken(body.token);
    if (started === null) return send(res, 403, { error: 'Invalid run token' });
    if (Date.now() - started < minRunMs(score)) return send(res, 422, { error: 'Score rejected' });

    let p = db.players[id];
    if (!p) {
      if (Object.keys(db.players).length >= MAX_PLAYERS) return send(res, 503, { error: 'Leaderboard full' });
    }
    if (!claimName(id, name)) return send(res, 409, { error: 'Username already taken' });
    if (!p) {
      p = db.players[id] = { name, best: 0, bestAt: 0, week: null, games: 0 };
    }
    const now = Date.now(), wk = weekKey(new Date());
    let improved = false;
    p.name = name;
    p.games = (p.games || 0) + 1;
    if (score > p.best) { p.best = score; p.bestAt = now; improved = true; }
    if (!p.week || p.week.key !== wk || score > p.week.score) p.week = { key: wk, score, at: now };
    invalidate();
    scheduleSave();
    return send(res, 200, {
      ok: true, best: p.best, weekBest: p.week.score, improved,
      rank: { all: rankOf('all', id), week: rankOf('week', id) },
      total: { all: board('all').length, week: board('week').length }
    });
  }

  if (route === 'POST /api/name') {
    let body;
    try { body = await readJson(req); } catch (e) { return send(res, 400, { error: 'Bad request' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'Bad request' });
    const name = cleanName(body.name);
    if (typeof body.playerId !== 'string' || !ID_RE.test(body.playerId)) return send(res, 400, { error: 'Invalid player' });
    if (!name) return send(res, 400, { error: 'Invalid name' });
    if (nameTaken(name, body.playerId)) return send(res, 409, { error: 'Username already taken' });
    let p = db.players[body.playerId];
    if (!p && Object.keys(db.players).length >= MAX_PLAYERS) return send(res, 503, { error: 'Leaderboard full' });
    if (!claimName(body.playerId, name)) return send(res, 409, { error: 'Username already taken' });
    if (!p) {
      p = db.players[body.playerId] = { name, best: 0, bestAt: 0, week: null, games: 0 };
      scheduleSave();
    } else if (p.name !== name) {
      p.name = name;
      invalidate();
      scheduleSave();
    }
    return send(res, 200, { ok: true, name });
  }

  return send(res, 404, { error: 'Not found' });
}

// ------------------------------------------------------------------ static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (pathname === '/') pathname = '/index.html';
  // Only the game itself is public — never the data directory or this file.
  const allowed = pathname === '/index.html' || /^\/(css|js)\/[A-Za-z0-9_\-/]+\.(css|js)$/.test(pathname);
  const file = path.join(ROOT, pathname);
  if (!allowed || !file.startsWith(ROOT + path.sep)) { res.writeHead(404); res.end('Not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

// ------------------------------------------------------------------ server
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => {
      console.error('api error', e);
      if (!res.headersSent) send(res, 500, { error: 'Server error' });
    });
  } else {
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    serveStatic(req, res, pathname);
  }
});

server.listen(PORT, () => {
  console.log('Skypip is flying at http://localhost:' + PORT);
});

function shutdown() {
  try { if (saveTimer) { clearTimeout(saveTimer); saveNow(); } } catch (e) { console.error('final save failed', e); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
