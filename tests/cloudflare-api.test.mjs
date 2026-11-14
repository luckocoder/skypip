import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { api } from '../functions/_shared.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

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
