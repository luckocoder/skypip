import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { api } from '../functions/_shared.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

class MemoryD1 {
  constructor() {
    this.players = new Map();
  }

  prepare(query) {
    const db = this;
    let values = [];
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async first() {
        if (query === 'SELECT id FROM players WHERE name_key = ? AND id != ?') {
          const [nameKey, playerId] = values;
          for (const player of db.players.values()) {
            if (player.name_key === nameKey && player.id !== playerId) return { id: player.id };
          }
          return null;
        }
        if (query.startsWith('SELECT id, name, name_key, best')) {
          return db.players.get(values[0]) || null;
        }
        if (query === 'SELECT COUNT(*) AS total FROM players') return { total: db.players.size };
        assert.fail('Unexpected first() query: ' + query);
      },
      async run() {
        if (query.startsWith('INSERT INTO players')) {
          const [id, name, name_key, best, best_at, week_key, week_score, week_at] = values;
          db.players.set(id, { id, name, name_key, best, best_at, week_key, week_score, week_at, games: 0 });
          return { meta: { changes: 1 } };
        }
        assert.fail('Unexpected run() query: ' + query);
      }
    };
  }
}

class PresenceD1 {
  constructor() {
    this.activePlayers = new Map();
  }

  prepare(query) {
    const db = this;
    let values = [];
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async first() {
        if (query === 'SELECT COUNT(*) AS players FROM active_players WHERE last_seen >= ?') {
          return { players: Array.from(db.activePlayers.values()).filter((row) => row.last_seen >= values[0]).length };
        }
        assert.fail('Unexpected first() query: ' + query);
      },
      async all() {
        assert.match(query, /FROM active_players/);
        const since = values[0];
        const groups = new Map();
        for (const row of db.activePlayers.values()) {
          if (row.last_seen < since) continue;
          const key = [row.country_code, row.region].join('|');
          const group = groups.get(key) || {
            country: row.country_code,
            region: row.region,
            latitude: 0,
            longitude: 0,
            coordinateCount: 0,
            players: 0
          };
          if (row.latitude !== null && row.longitude !== null) {
            group.latitude += row.latitude;
            group.longitude += row.longitude;
            group.coordinateCount++;
          }
          group.players++;
          groups.set(key, group);
        }
        return {
          results: Array.from(groups.values()).map((group) => ({
            country: group.country,
            region: group.region,
            latitude: group.coordinateCount ? Math.round(group.latitude / group.coordinateCount / 2) * 2 : null,
            longitude: group.coordinateCount ? Math.round(group.longitude / group.coordinateCount / 2) * 2 : null,
            players: group.players
          }))
        };
      },
      async run() {
        if (query === 'DELETE FROM active_players WHERE last_seen < ?') {
          for (const [id, row] of db.activePlayers) {
            if (row.last_seen < values[0]) db.activePlayers.delete(id);
          }
          return { meta: { changes: 1 } };
        }
        if (query === 'DELETE FROM active_players WHERE session_id = ?') {
          db.activePlayers.delete(values[0]);
          return { meta: { changes: 1 } };
        }
        if (query.includes('INSERT INTO active_players')) {
          const [session_id, country_code, region, latitude, longitude, last_seen] = values;
          db.activePlayers.set(session_id, { session_id, country_code, region, latitude, longitude, last_seen });
          return { meta: { changes: 1 } };
        }
        assert.fail('Unexpected run() query: ' + query);
      }
    };
  }
}

function requestWithLocation(url, init, location) {
  const request = new Request(url, init);
  Object.defineProperty(request, 'cf', { value: location });
  return request;
}

test('session endpoint returns a signed run token', async () => {
  const response = await api(
    new Request('https://skypip.example/api/session', { method: 'POST' }),
    { LEADERBOARD_SECRET: 'test-secret' }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.token, /^\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('health endpoint reports the D1 player count', async () => {
  const db = {
    prepare(query) {
      assert.equal(query, 'SELECT COUNT(*) AS players FROM players');
      return { first: async () => ({ players: 7 }) };
    }
  };
  const response = await api(
    new Request('https://skypip.example/api/health'),
    { DB: db }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, players: 7 });
});

test('score endpoint rejects invalid input before touching the database', async () => {
  const db = {
    prepare() {
      assert.fail('database should not be queried for an invalid score');
    }
  };
  const response = await api(
    new Request('https://skypip.example/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: '0123456789abcdef', name: 'Pip', score: 0 })
    }),
    { DB: db, LEADERBOARD_SECRET: 'test-secret' }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid score' });
});

test('username claims are case-insensitively unique', async () => {
  const db = new MemoryD1();
  const claim = (playerId, name) => api(
    new Request('https://skypip.example/api/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, name })
    }),
    { DB: db }
  );

  const first = await claim('player_000000001', 'SkyPip');
  const duplicate = await claim('player_000000002', 'skypip');

  assert.equal(first.status, 200);
  assert.equal(duplicate.status, 409);
  assert.equal(db.players.size, 1);
});

test('live presence stores coarse region aggregates and removes opted-out sessions', async () => {
  const db = new PresenceD1();
  const endpoint = 'https://skypip.example/api/presence';
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  const body = (sessionId, share) => JSON.stringify({ sessionId, share });
  const addPlayer = await api(requestWithLocation(
    endpoint,
    { ...options, body: body('session_presence_0001', true) },
    { country: 'us', region: ' New York ', latitude: 40.7128, longitude: -74.006 }
  ), { DB: db });
  const addSecondPlayer = await api(requestWithLocation(
    endpoint,
    { ...options, body: body('session_presence_0002', true) },
    { country: 'US', region: 'New York', latitude: 42, longitude: -70 }
  ), { DB: db });

  assert.equal(addPlayer.status, 200);
  assert.deepEqual(await addPlayer.json(), { ok: true, located: true });
  assert.equal(addSecondPlayer.status, 200);

  const live = await api(new Request(endpoint), { DB: db });
  assert.deepEqual(await live.json(), {
    available: true,
    players: 2,
    locations: [{ country: 'US', region: 'New York', latitude: 42, longitude: -72, players: 2 }]
  });

  const removePlayer = await api(new Request(endpoint, {
    ...options,
    body: body('session_presence_0001', false)
  }), { DB: db });
  assert.equal(removePlayer.status, 200);
  const remaining = await api(new Request(endpoint), { DB: db });
  assert.deepEqual(await remaining.json(), {
    available: true,
    players: 1,
    locations: [{ country: 'US', region: 'New York', latitude: 42, longitude: -70, players: 1 }]
  });
  await api(new Request(endpoint, { ...options, body: body('session_presence_0002', false) }), { DB: db });
  assert.equal(db.activePlayers.size, 0);
});

test('live presence does not store a location when Cloudflare location data is unavailable', async () => {
  const db = new PresenceD1();
  const response = await api(new Request('https://skypip.example/api/presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session_presence_0002', share: true })
  }), { DB: db });

  assert.deepEqual(await response.json(), { ok: true, located: false });
  assert.equal(db.activePlayers.size, 0);
});

test('live presence excludes expired sessions from the public map', async () => {
  const db = new PresenceD1();
  db.activePlayers.set('session_presence_expired', {
    session_id: 'session_presence_expired',
    country_code: 'US',
    region: 'New York',
    latitude: 40,
    longitude: -74,
    last_seen: Date.now() - 120000
  });

  const response = await api(new Request('https://skypip.example/api/presence'), { DB: db });
  assert.deepEqual(await response.json(), { available: true, players: 0, locations: [] });
});
