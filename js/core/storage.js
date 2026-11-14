/* Skypip — persistent settings and records (localStorage, fail-safe). */
(function (S) {
  'use strict';

  var KEY = 'skypip.save.v1';
  var DEFAULTS = {
    best: 0,
    plays: 0,
    sfx: true,
    music: true,
    volume: 0.8,
    shake: true,
    playerId: '', // anonymous random id for the world leaderboard
    name: '',
    nameConfirmed: false,
    shareLocation: true
  };

  function Store() {
    this.data = {};
    for (var k in DEFAULTS) this.data[k] = DEFAULTS[k];
    this.load();
  }

  Store.prototype.load = function () {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      for (var k in DEFAULTS) {
        if (parsed && typeof parsed[k] === typeof DEFAULTS[k]) this.data[k] = parsed[k];
      }
      this.data.best = Math.max(0, Math.floor(this.data.best)) || 0;
      this.data.volume = S.U.clamp(+this.data.volume || 0, 0, 1);
    } catch (e) { /* storage unavailable (private mode) — use defaults */ }
  };

  Store.prototype.save = function () {
    try { window.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  };

  Store.prototype.set = function (key, value) {
    this.data[key] = value;
    this.save();
  };

  S.Store = Store;
})(window.Skypip = window.Skypip || {});
