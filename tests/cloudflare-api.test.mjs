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
