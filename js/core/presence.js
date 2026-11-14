/* Skypip — short-lived, approximate live-player presence. */
(function (S) {
  'use strict';

  var TIMEOUT = 7000;
  var HEARTBEAT_MS = 30000;

  function resolveBase() {
    var b = S.CONFIG.LEADERBOARD_API;
    if (typeof b === 'string' && b) return b.replace(/\/+$/, '');
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin + '/api';
    return 'http://localhost:3000/api';
  }

  function randomId() {
    var bytes = new Uint8Array(16), id = '';
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    for (var j = 0; j < bytes.length; j++) id += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
    return id;
  }

  function Presence(store) {
    this.store = store;
    this.base = resolveBase();
    this.sessionId = randomId();
    this.enabled = store.data.shareLocation !== false;
    this.playing = false;
    this.timer = 0;
    this._pending = Promise.resolve();
    this.lastError = false;
  }

  Presence.prototype._request = function (method, path, body) {
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
          var error = new Error(data.error || 'Request failed');
          error.status = res.status;
          throw error;
        }
        return data;
      });
    }).finally(function () { clearTimeout(timer); });
  };

  Presence.prototype._post = function (share) {
    var self = this;
    this._pending = this._pending.catch(function () {}).then(function () {
      return self._request('POST', '/presence', { sessionId: self.sessionId, share: share });
    });
    return this._pending;
  };

  Presence.prototype._heartbeat = function () {
    var self = this;
    this._post(true).then(function (result) {
      self.lastError = !result.located;
    }).catch(function () {
      self.lastError = true;
    });
  };

  Presence.prototype._sync = function () {
    var shouldShare = this.enabled && this.playing && !document.hidden;
    if (shouldShare && !this.timer) {
      this._heartbeat();
      this.timer = window.setInterval(this._heartbeat.bind(this), HEARTBEAT_MS);
    } else if (!shouldShare && this.timer) {
      window.clearInterval(this.timer);
      this.timer = 0;
      var self = this;
      this._post(false).then(function () { self.lastError = false; }).catch(function () { self.lastError = true; });
    }
  };

  Presence.prototype.setPlaying = function (playing) {
    this.playing = !!playing;
    this._sync();
  };

  Presence.prototype.setEnabled = function (enabled) {
    this.enabled = !!enabled;
    this.store.set('shareLocation', this.enabled);
    if (!this.enabled) this.lastError = false;
    this._sync();
  };

  Presence.prototype.locations = function () {
    return this._request('GET', '/presence');
  };

  S.Presence = Presence;
})(window.Skypip = window.Skypip || {});
