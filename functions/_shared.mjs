const MAX_SCORE = 9999;
const MAX_PLAYERS = 200000;
const TOKEN_MAX_AGE = 6 * 60 * 60 * 1000;
const MAX_BODY = 2048;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const NAME_RE = /^[\p{L}\p{N} _.\-]{2,14}$/u;
const encoder = new TextEncoder();
const hits = new Map();
let lastHitCleanup = 0;

function response(status, data = null) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
  if (data === null) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(data), { status, headers });
}

function weekKey(date) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return thursday.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(name) ? name : null;
}

function nameKey(name) {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function limited(request, cost) {
  const now = Date.now();
  if (now - lastHitCleanup > 60000) {
    for (const [ip, hit] of hits) if (hit.reset < now) hits.delete(ip);
    lastHitCleanup = now;
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  let hit = hits.get(ip);
  if (!hit || now > hit.reset) {
    hit = { count: 0, reset: now + 60000 };
    hits.set(ip, hit);
  }
  hit.count += cost;
  return hit.count > 300;
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signingKey(secret) {
  if (typeof secret !== 'string' || !secret) throw new Error('LEADERBOARD_SECRET is not configured');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function newToken(secret) {
  const nonce = new Uint8Array(9);
  crypto.getRandomValues(nonce);
  const payload = Date.now() + '.' + encodeBase64Url(nonce);
  const key = await signingKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return payload + '.' + encodeBase64Url(new Uint8Array(signature));
}

async function consumeToken(token, secret, db) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const started = Number(parts[0]);
  const age = Date.now() - started;
  if (!Number.isFinite(started) || age < 0 || age > TOKEN_MAX_AGE) return null;

  let valid;
  try {
    const key = await signingKey(secret);
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(parts[2]),
      encoder.encode(parts[0] + '.' + parts[1])
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const now = Date.now();
  await db.prepare('DELETE FROM used_nonces WHERE expires_at < ?').bind(now).run();
  const inserted = await db.prepare(
    'INSERT OR IGNORE INTO used_nonces (nonce, expires_at) VALUES (?, ?)'
  ).bind(parts[1], started + TOKEN_MAX_AGE).run();
  return inserted.meta.changes === 1 ? started : null;
}

async function readJson(request) {
  const reader = request.body && request.body.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes) || '{}');
}

async function getPlayer(db, id) {
  return db.prepare(
    'SELECT id, name, name_key, best, best_at, week_key, week_score, week_at, games FROM players WHERE id = ?'
  ).bind(id).first();
}

async function rankOf(db, kind, id, currentWeek) {
  const fields = kind === 'week'
    ? 'id, name, week_score AS score, ROW_NUMBER() OVER (ORDER BY week_score DESC, week_at ASC) AS position FROM players WHERE week_key = ?'
    : 'id, name, best AS score, ROW_NUMBER() OVER (ORDER BY best DESC, best_at ASC) AS position FROM players WHERE best > 0';
  const query = `SELECT position, name, score FROM (SELECT ${fields}) WHERE id = ?`;
  const result = kind === 'week'
    ? await db.prepare(query).bind(currentWeek, id).first()
    : await db.prepare(query).bind(id).first();
  return result || null;
}

async function getBoard(db, kind, currentWeek, playerId, limit) {
  const isWeek = kind === 'week';
  const where = isWeek ? ' WHERE week_key = ?' : ' WHERE best > 0';
  const scoreField = isWeek ? 'week_score' : 'best';
  const atField = isWeek ? 'week_at' : 'best_at';
  const rankSql = `SELECT id, name, ${scoreField} AS score, ${atField} AS at, ROW_NUMBER() OVER (ORDER BY ${scoreField} DESC, ${atField} ASC) AS position FROM players${where}`;
  const countQuery = isWeek
    ? await db.prepare('SELECT COUNT(*) AS total FROM players WHERE week_key = ?').bind(currentWeek).first()
    : await db.prepare('SELECT COUNT(*) AS total FROM players WHERE best > 0').first();
  const rows = isWeek
    ? await db.prepare(`SELECT * FROM (${rankSql}) ORDER BY score DESC, at ASC LIMIT ?`).bind(currentWeek, limit).all()
    : await db.prepare(`SELECT * FROM (${rankSql}) ORDER BY score DESC, at ASC LIMIT ?`).bind(limit).all();
  const entries = rows.results.map((row) => ({
    rank: row.position,
    name: row.name,
    score: row.score,
    you: row.id === playerId
  }));
  let you = null;
  if (ID_RE.test(playerId)) {
    const row = await rankOf(db, kind, playerId, currentWeek);
    if (row) you = { rank: row.position, name: row.name, score: row.score };
  }
  return { entries, total: countQuery.total, you };
}

export async function api(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return response(204);
  if (limited(request, request.method === 'POST' ? 5 : 1)) {
    return response(429, { error: 'Too many requests' });
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      if (!env.DB) return response(503, { error: 'D1 binding DB is not configured' });
      const count = await env.DB.prepare('SELECT COUNT(*) AS players FROM players').first();
      return response(200, { ok: true, players: count.players });
    }

    if (request.method === 'POST' && url.pathname === '/api/session') {
      if (!env.LEADERBOARD_SECRET) return response(503, { error: 'LEADERBOARD_SECRET is not configured' });
      return response(200, { token: await newToken(env.LEADERBOARD_SECRET) });
    }

    if (request.method === 'GET' && url.pathname === '/api/scores') {
      if (!env.DB) return response(503, { error: 'D1 binding DB is not configured' });
      const kind = url.searchParams.get('board') === 'all' ? 'all' : 'week';
      const parsedLimit = parseInt(url.searchParams.get('limit'), 10) || 50;
      const limit = Math.min(100, Math.max(1, parsedLimit));
      const playerId = url.searchParams.get('player') || '';
      const currentWeek = weekKey(new Date());
      const result = await getBoard(env.DB, kind, currentWeek, playerId, limit);
      return response(200, {
        board: kind,
        week: currentWeek,
        total: result.total,
        entries: result.entries,
        you: result.you
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/scores') {
      if (!env.DB) return response(503, { error: 'D1 binding DB is not configured' });
      let body;
      try {
        body = await readJson(request);
      } catch {
        return response(400, { error: 'Bad request' });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return response(400, { error: 'Bad request' });
      const { playerId, score } = body;
      const name = cleanName(body.name);
      if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return response(400, { error: 'Invalid player' });
      if (!name) return response(400, { error: 'Invalid name' });
      if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return response(400, { error: 'Invalid score' });
      if (!env.LEADERBOARD_SECRET) return response(503, { error: 'LEADERBOARD_SECRET is not configured' });
      const key = nameKey(name);
      const owner = await env.DB.prepare('SELECT id FROM players WHERE name_key = ? AND id != ?')
        .bind(key, playerId).first();
      if (owner) return response(409, { error: 'Username already taken' });

      const started = await consumeToken(body.token, env.LEADERBOARD_SECRET, env.DB);
      if (started === null) return response(403, { error: 'Invalid run token' });
      if (Date.now() - started < 1200 + (score - 1) * 880) return response(422, { error: 'Score rejected' });

      const previous = await getPlayer(env.DB, playerId);
      if (!previous) {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM players').first();
        if (count.total >= MAX_PLAYERS) return response(503, { error: 'Leaderboard full' });
      }
      const now = Date.now();
      const currentWeek = weekKey(new Date(now));
      const improved = !previous || score > previous.best;
      await env.DB.prepare(
        `INSERT INTO players (id, name, name_key, best, best_at, week_key, week_score, week_at, games)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           name_key = excluded.name_key,
           best = MAX(players.best, excluded.best),
           best_at = CASE WHEN excluded.best > players.best THEN excluded.best_at ELSE players.best_at END,
           week_score = CASE
             WHEN players.week_key IS NOT excluded.week_key THEN excluded.week_score
             WHEN excluded.week_score > players.week_score THEN excluded.week_score
             ELSE players.week_score
           END,
           week_at = CASE
             WHEN players.week_key IS NOT excluded.week_key THEN excluded.week_at
             WHEN excluded.week_score > players.week_score THEN excluded.week_at
             ELSE players.week_at
           END,
           week_key = excluded.week_key,
           games = players.games + 1`
      ).bind(playerId, name, key, score, now, currentWeek, score, now).run();

      const player = await getPlayer(env.DB, playerId);
      const allRank = await rankOf(env.DB, 'all', playerId, currentWeek);
      const weekRank = await rankOf(env.DB, 'week', playerId, currentWeek);
      const totals = await env.DB.prepare(
        'SELECT COUNT(*) AS all_total, SUM(CASE WHEN week_key = ? THEN 1 ELSE 0 END) AS week_total FROM players'
      ).bind(currentWeek).first();
      return response(200, {
        ok: true,
        best: player.best,
        weekBest: player.week_score,
        improved,
        rank: { all: allRank.position, week: weekRank.position },
        total: { all: totals.all_total, week: totals.week_total }
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/name') {
      if (!env.DB) return response(503, { error: 'D1 binding DB is not configured' });
      let body;
      try {
        body = await readJson(request);
      } catch {
        return response(400, { error: 'Bad request' });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return response(400, { error: 'Bad request' });
      const name = cleanName(body.name);
      if (typeof body.playerId !== 'string' || !ID_RE.test(body.playerId)) return response(400, { error: 'Invalid player' });
      if (!name) return response(400, { error: 'Invalid name' });
      const key = nameKey(name);
      const owner = await env.DB.prepare('SELECT id FROM players WHERE name_key = ? AND id != ?')
        .bind(key, body.playerId).first();
      if (owner) return response(409, { error: 'Username already taken' });
      const player = await getPlayer(env.DB, body.playerId);
      if (!player) {
        const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM players').first();
        if (count.total >= MAX_PLAYERS) return response(503, { error: 'Leaderboard full' });
        await env.DB.prepare(
          `INSERT INTO players (id, name, name_key, best, best_at, week_key, week_score, week_at, games)
           VALUES (?, ?, ?, 0, 0, NULL, NULL, NULL, 0)`
        ).bind(body.playerId, name, key).run();
      } else if (player.name !== name || player.name_key !== key) {
        await env.DB.prepare('UPDATE players SET name = ?, name_key = ? WHERE id = ?')
          .bind(name, key, body.playerId).run();
      }
      return response(200, { ok: true, name });
    }

    return response(404, { error: 'Not found' });
  } catch (error) {
    console.error('api error', error);
    if (error && typeof error.message === 'string' &&
        error.message.includes('UNIQUE constraint failed: players.name_key')) {
      return response(409, { error: 'Username already taken' });
    }
    return response(500, { error: 'Server error' });
  }
}
