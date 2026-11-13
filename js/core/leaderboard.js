/* Skypip — world leaderboard client. Talks to the API in server.js.
 * Every run gets a server-issued token so scores can be sanity-checked
 * against how long the run actually lasted. All calls fail soft: the game
 * stays fully playable when the leaderboard cannot be reached. */
(function (S) {
  'use strict';

  var C = S.CONFIG;
  var TIMEOUT = 7000;

  var NAME_RE;
  try { NAME_RE = new RegExp('^[\\p{L}\\p{N} _.\\-]{2,14}$', 'u'); }
  catch (e) { NAME_RE = /^[\w .\-]{2,14}$/; }

  function resolveBase() {
    var b = C.LEADERBOARD_API;
    if (typeof b === 'string' && b) return b.replace(/\/+$/, '');
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin + '/api';
    return 'http://localhost:3000/api'; // opened straight from disk: use a locally running server
  }

  function randomId() {
    var a = new Uint8Array(16), s = '';
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0;
    for (var j = 0; j < a.length; j++) s += (a[j] < 16 ? '0' : '') + a[j].toString(16);
    return s;
  }

  function Leaderboard(store) {
    this.store = store;
    this.base = resolveBase();
    var d = store.data;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(d.playerId)) d.playerId = randomId();
    if (!Leaderboard.cleanName(d.name)) d.name = 'Pip' + (1000 + Math.floor(Math.random() * 9000));
    store.save();
    this._token = null;
    this._tokenReq = null;
  }

  /** Normalised name, or null when it is not acceptable. */
  Leaderboard.cleanName = function (v) {
    if (typeof v !== 'string') return null;
    var n = v;
    try { n = n.normalize('NFKC'); } catch (e) { /* very old browser */ }
    n = n.replace(/\s+/g, ' ').trim();
    return NAME_RE.test(n) ? n : null;
  };

  Leaderboard.prototype.name = function () { return this.store.data.name; };

  Leaderboard.prototype._request = function (method, path, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : 0;
    var opts = { method: method, cache: 'no-store' };
    if (ctrl) opts.signal = ctrl.signal;
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    return fetch(this.base + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }).finally(function () { clearTimeout(timer); });
  };

  /** Call when a run starts. */
  Leaderboard.prototype.startSession = function () {
    var self = this;
    this._token = null;
    var req = this._tokenReq = this._request('POST', '/session').then(function (r) {
      if (self._tokenReq === req) self._token = r.token || null;
    }).catch(function () { /* offline — this run simply will not be ranked */ });
  };

  /** Submits the finished run. Resolves to {ok, rank, ...} or {ok:false, reason}. */
  Leaderboard.prototype.submit = function (score) {
    var self = this, d = this.store.data;
    var wait = this._tokenReq || Promise.resolve();
    return wait.then(function () {
      var token = self._token;
      self._token = null;
      if (!token) return { ok: false, reason: 'offline' };
      return self._request('POST', '/scores', { playerId: d.playerId, name: d.name, score: score, token: token });
    }).catch(function (e) {
      return { ok: false, reason: e.status ? 'rejected' : 'offline' };
    });
  };

  /** Top of a board: 'week' or 'all'. Rejects when unreachable. */
  Leaderboard.prototype.top = function (board) {
    return this._request('GET', '/scores?board=' + (board === 'all' ? 'all' : 'week') +
      '&limit=50&player=' + encodeURIComponent(this.store.data.playerId));
  };

  /** Changes the player's name. Resolves to {ok, name} or {ok:false, reason}. */
  Leaderboard.prototype.rename = function (raw) {
    var self = this;
    var name = Leaderboard.cleanName(raw);
    if (!name) return Promise.resolve({ ok: false, reason: 'invalid' });
    var done = function (synced) {
      self.store.set('name', name);
      return { ok: true, name: name, synced: synced };
    };
    // The name travels with every score, so saving locally is enough when offline.
    return this._request('POST', '/name', { playerId: this.store.data.playerId, name: name })
      .then(function () { return done(true); })
      .catch(function (e) { return e.status === 400 ? { ok: false, reason: 'invalid' } : done(false); });
  };

  S.Leaderboard = Leaderboard;
})(window.Skypip = window.Skypip || {});
