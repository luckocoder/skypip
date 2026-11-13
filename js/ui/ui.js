/* Skypip — DOM interface: screens, HUD, transitions, settings, game-over
 * sequence and medal celebration. Talks to the game only via its public
 * methods and events. */
(function (S) {
  'use strict';

  var C = S.CONFIG;

  var ICON = {
    sfx: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.8" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.8" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    shake: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3.5" width="10" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 8v8M21 8v8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M3.4 12h17.2M12 3.4c3.2 3 3.2 14.2 0 17.2M12 3.4c-3.2 3-3.2 14.2 0 17.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
  };

  var MEDAL_COLORS = {
    bronze: { hi: '#ffd2a6', mid: '#e0904f', lo: '#9b5524', rib1: '#ff7a59', rib2: '#d9503a' },
    silver: { hi: '#ffffff', mid: '#c9d3dd', lo: '#7d8b9a', rib1: '#4fb6e8', rib2: '#2f8cc0' },
    gold: { hi: '#fff3a6', mid: '#ffc52e', lo: '#b37400', rib1: '#ff5e6c', rib2: '#cf3346' },
    platinum: { hi: '#ffffff', mid: '#a9f0ff', lo: '#4a9fc4', rib1: '#9b7bff', rib2: '#6a4fd6' }
  };

  function starPath(cx, cy, ro, ri) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = -Math.PI / 2 + (i * Math.PI) / 5;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2);
    }
    return d + 'Z';
  }

  function medalSVG(id) {
    var c = MEDAL_COLORS[id];
    var g = 'mg-' + id, gi = 'mi-' + id;
    return '<svg viewBox="0 0 100 124" class="medal-svg" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c.hi + '"/><stop offset=".5" stop-color="' + c.mid + '"/><stop offset="1" stop-color="' + c.lo + '"/></linearGradient>' +
      '<linearGradient id="' + gi + '" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="' + c.hi + '"/><stop offset=".55" stop-color="' + c.mid + '"/><stop offset="1" stop-color="' + c.lo + '"/></linearGradient>' +
      '</defs>' +
      '<path d="M28 2h18l12 44H40z" fill="' + c.rib1 + '" stroke="#10394a" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<path d="M72 2H54L42 46h18z" fill="' + c.rib2 + '" stroke="#10394a" stroke-width="3.5" stroke-linejoin="round"/>' +
      '<circle cx="50" cy="80" r="38" fill="url(#' + g + ')" stroke="#10394a" stroke-width="4"/>' +
      '<circle cx="50" cy="80" r="28.5" fill="url(#' + gi + ')" stroke="' + c.lo + '" stroke-width="2.5"/>' +
      '<path d="' + starPath(50, 81, 16, 7) + '" fill="' + c.hi + '" stroke="' + c.lo + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M22 66a31 31 0 0 1 24-21" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="4.5" stroke-linecap="round"/>' +
      '</svg>';
  }

  function UI(game, audio, store, confetti, lb) {
    this.game = game;
    this.audio = audio;
    this.store = store;
    this.confetti = confetti;
    this.lb = lb;
    this.boardOpen = false;
    this.boardKind = 'week';
    this._boardReq = 0;
    this._runId = 0;
    this.timers = [];
    this.overReady = false;
    this.fading = false;

    var $ = function (id) { return document.getElementById(id); };
    this.$ = $;
    this.root = $('ui');
    this.app = $('app');
    this.curtain = $('curtain');
    this.hud = $('hud');
    this.scoreEl = $('score');
    this.toastEl = $('toast');
    this.screens = {
      menu: $('screen-menu'),
      ready: $('screen-ready'),
      count: $('screen-count'),
      over: $('screen-over'),
      pause: $('screen-pause')
    };
    this.settingsEl = $('screen-settings');
    this.boardEl = $('screen-board');
    this.current = null;

    this._buildSoundControls();
    this._bind();
    this._syncSettings();
    this._refreshBest();

    var self = this;
    game.on('state', function (s, prev) { self._onState(s, prev); });
    game.on('score', function (n, pop) { self._setScore(n, pop); });
    game.on('gameover', function (r) { self._showGameOver(r); });
    game.on('countdown', function (n) { self._countdown(n); });
    game.on('milestone', function (m) { self._toast(m.name + ' medal!', m.id); });
    var PHASE_TEXT = { Day: 'A brand new day', Sunset: 'Golden hour', Night: 'Night flight', Dawn: 'Dawn breaks' };
    game.on('phase', function (name) { self._toast(PHASE_TEXT[name] || name, 'phase'); });
    game.on('resize', function (info) { self._layout(info); });

    this._layout({ scale: game.scale, W: game.W, H: game.H, groundY: game.groundY, cssW: game.canvas.clientWidth, cssH: game.canvas.clientHeight, dpr: game.dpr });
    this._show('menu');
  }

  // ---------------------------------------------------------------- layout

  UI.prototype._layout = function (info) {
    var st = this.root.style;
    st.setProperty('--u', info.scale + 'px');
    st.setProperty('--gy', (info.groundY * info.scale) + 'px');
    st.setProperty('--bird-x', (this.game.birdX * info.scale) + 'px');
    if (this.confetti) this.confetti.resize(info.cssW, info.cssH, Math.min(info.dpr, 2));
  };

  // ---------------------------------------------------------------- bindings

  UI.prototype._bind = function () {
    var self = this, $ = this.$, g = this.game;

    function on(id, fn) {
      var el = $(id);
      el.addEventListener('click', function (e) {
        e.preventDefault();
        self.audio.play('click');
        fn();
        el.blur();
      });
    }

    // Hover / press feedback sounds for every button.
    this.root.addEventListener('pointerover', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (b && e.pointerType === 'mouse' && b !== self._hovered) { self._hovered = b; self.audio.play('hover'); }
    });
    this.root.addEventListener('pointerout', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (b && !b.contains(e.relatedTarget)) self._hovered = null;
    });

    on('btn-play', function () { self.play(); });
    on('btn-settings', function () { self.openSettings(); });
    on('btn-settings-close', function () { self.closeSettings(); });
    on('btn-sound-quick', function () { self.toggleMute(); });
    on('btn-pause', function () { g.pause(); });
    on('btn-resume', function () { g.resume(); });
    on('btn-pause-restart', function () { self.restart(); });
    on('btn-pause-menu', function () { self.toMenu(); });
    on('btn-restart', function () { self.restart(); });
    on('btn-over-menu', function () { self.toMenu(); });

    this.settingsEl.addEventListener('pointerdown', function (e) {
      if (e.target === self.settingsEl) self.closeSettings();
    });

    // World ranking
    on('btn-board', function () { self.openBoard(); });
    on('btn-over-board', function () { self.openBoard(); });
    on('btn-board-close', function () { self.closeBoard(); });
    this.boardEl.addEventListener('pointerdown', function (e) {
      if (e.target === self.boardEl) self.closeBoard();
    });
    this.boardEl.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var tab = e.target.closest('.tab');
      if (tab) {
        self.audio.play('click');
        self._setBoard(tab.getAttribute('data-board'));
        tab.blur();
        return;
      }
      if (e.target.closest('[data-retry]')) { self.audio.play('click'); self._loadBoard(); }
    });
    $('name-form').addEventListener('submit', function (e) {
      e.preventDefault();
      self.audio.play('click');
      self._saveName();
    });
  };

  // ---------------------------------------------------------------- actions

  UI.prototype.play = function () {
    if (this.game.state !== 'menu') return;
    this.closeSettings();
    this.closeBoard();
    this.audio.play('swoosh');
    this.game.goReady();
  };

  UI.prototype.restart = function () {
    var g = this.game;
    this._fade(function () { g.goReady(); });
  };

  UI.prototype.toMenu = function () {
    var g = this.game;
    this._fade(function () { g.goMenu(); });
  };

  /** Keyboard Space/Up while on the game-over screen. */
  UI.prototype.tryRestart = function () {
    if (this.game.state === 'over' && this.overReady) { this.audio.play('click'); this.restart(); }
  };

  UI.prototype.confirm = function () {
    var s = this.game.state;
    if (this.settingsOpen) this.closeSettings();
    else if (this.boardOpen) this.closeBoard();
    else if (s === 'menu') this.play();
    else if (s === 'over') this.tryRestart();
    else if (s === 'paused') this.game.resume();
    else this.game.action();
  };

  UI.prototype.togglePause = function () {
    var g = this.game;
    if (this.settingsOpen) { this.closeSettings(); return; }
    if (this.boardOpen) { this.closeBoard(); return; }
    if (g.state === 'playing') g.pause();
    else if (g.state === 'paused') g.resume();
  };

  UI.prototype.toggleMute = function () {
    var d = this.store.data;
    var on = !(d.sfx || d.music);
    this.store.data.sfx = on;
    this.store.data.music = on;
    this.store.save();
    this.audio.setSfx(on);
    this.audio.setMusic(on);
    this._syncSettings();
  };

  UI.prototype._fade = function (fn) {
    if (this.fading) return;
    this.fading = true;
    var self = this;
    this.curtain.classList.add('on');
    setTimeout(function () {
      fn();
      requestAnimationFrame(function () {
        self.curtain.classList.remove('on');
        self.fading = false;
      });
    }, 240);
  };

  // ---------------------------------------------------------------- screens

  UI.prototype._show = function (name) {
    for (var k in this.screens) {
      var on = k === name;
      var el = this.screens[k];
      if (on !== el.classList.contains('active')) {
        el.classList.toggle('active', on);
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
      }
    }
    this.current = name;
  };

  UI.prototype._onState = function (s, prev) {
    this._clearTimers();
    this._runId++; // any pending rank reply now belongs to an old screen
    if (s === 'playing' && prev === 'ready') this.lb.startSession();
    var hud = this.hud;
    hud.classList.toggle('visible', s === 'ready' || s === 'playing' || s === 'dying' || s === 'paused' || s === 'resuming');
    hud.classList.toggle('can-pause', s === 'playing');

    switch (s) {
      case 'menu':
        this._refreshBest();
        this.confetti.clear();
        this._show('menu');
        break;
      case 'ready':
        this.confetti.clear();
        this._show('ready');
        break;
      case 'playing':
        this._show(null);
        break;
      case 'dying':
        this._show(null);
        break;
      case 'paused':
        this._show('pause');
        break;
      case 'resuming':
        this._show('count');
        break;
      case 'over':
        break; // handled by _showGameOver
    }
  };

  UI.prototype._setScore = function (n, pop) {
    this.scoreEl.textContent = n;
    if (pop && this.scoreEl.animate) {
      this.scoreEl.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.38)', offset: 0.35 },
        { transform: 'scale(1)' }
      ], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    }
  };

  UI.prototype._countdown = function (n) {
    var el = this.$('count-num');
    if (n <= 0) return;
    el.textContent = n;
    if (el.animate) {
      el.animate([
        { transform: 'scale(2.2)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1, offset: 0.35 },
        { transform: 'scale(0.9)', opacity: 1, offset: 0.8 },
        { transform: 'scale(0.6)', opacity: 0 }
      ], { duration: 550, easing: 'ease-out', fill: 'both' });
    }
  };

  UI.prototype._toast = function (text, kind) {
    var el = this.toastEl;
    el.textContent = text;
    el.className = 'toast toast-' + kind;
    void el.offsetWidth; // restart animation
    el.classList.add('show');
  };

  UI.prototype._refreshBest = function () {
    this.$('menu-best').textContent = this.store.data.best;
  };

  // ---------------------------------------------------------------- settings

  UI.prototype._buildSoundControls = function () {
    var html =
      '<div class="setting-row"><span class="setting-label">' + ICON.sfx + 'Sound FX</span>' +
      '<button type="button" class="switch" role="switch" data-key="sfx" aria-label="Sound effects"><span class="knob"></span></button></div>' +
      '<div class="setting-row"><span class="setting-label">' + ICON.music + 'Music</span>' +
      '<button type="button" class="switch" role="switch" data-key="music" aria-label="Music"><span class="knob"></span></button></div>' +
      '<div class="setting-row setting-volume"><span class="setting-label">' + ICON.volume + 'Volume</span>' +
      '<input class="slider" type="range" min="0" max="100" step="1" data-key="volume" aria-label="Volume"></div>';
    var nodes = document.querySelectorAll('[data-sound-controls]');
    var self = this;
    for (var i = 0; i < nodes.length; i++) nodes[i].innerHTML = html;

    var sh = this.$('shake-row');
    if (sh) {
      sh.innerHTML = '<span class="setting-label">' + ICON.shake + 'Screen shake</span>' +
        '<button type="button" class="switch" role="switch" data-key="shake" aria-label="Screen shake"><span class="knob"></span></button>';
    }

    this.root.addEventListener('click', function (e) {
      var sw = e.target.closest && e.target.closest('.switch');
      if (!sw) return;
      var key = sw.getAttribute('data-key');
      var val = !self.store.data[key];
      self.store.set(key, val);
      if (key === 'sfx') self.audio.setSfx(val);
      if (key === 'music') self.audio.setMusic(val);
      self._syncSettings();
      self.audio.play('click');
      sw.blur();
    });

    this.root.addEventListener('input', function (e) {
      if (!e.target.matches || !e.target.matches('.slider')) return;
      var v = +e.target.value / 100;
      self.store.data.volume = v;
      self.audio.setVolume(v);
      self._syncSettings();
    });
    this.root.addEventListener('change', function (e) {
      if (e.target.matches && e.target.matches('.slider')) { self.store.save(); self.audio.play('tick'); }
    });
  };

  UI.prototype._syncSettings = function () {
    var d = this.store.data, i;
    var sws = this.root.querySelectorAll('.switch');
    for (i = 0; i < sws.length; i++) {
      var on = !!d[sws[i].getAttribute('data-key')];
      sws[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    var sl = this.root.querySelectorAll('.slider');
    for (i = 0; i < sl.length; i++) {
      var v = Math.round(d.volume * 100);
      if (+sl[i].value !== v) sl[i].value = v;
      sl[i].style.setProperty('--val', v + '%');
    }
    var muted = !d.sfx && !d.music;
    var q = this.$('btn-sound-quick');
    q.innerHTML = muted ? ICON.mute : ICON.sfx;
    q.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    q.classList.toggle('is-off', muted);
  };

  UI.prototype.openSettings = function () {
    this.settingsOpen = true;
    this.settingsEl.classList.add('active');
    this.settingsEl.setAttribute('aria-hidden', 'false');
  };

  UI.prototype.closeSettings = function () {
    if (!this.settingsOpen) return;
    this.settingsOpen = false;
    this.settingsEl.classList.remove('active');
    this.settingsEl.setAttribute('aria-hidden', 'true');
  };

  // ---------------------------------------------------------------- world ranking

  UI.prototype.anyModal = function () {
    return this.settingsOpen || this.boardOpen;
  };

  UI.prototype.openBoard = function () {
    if (this.boardOpen) return;
    this.closeSettings();
    this.boardOpen = true;
    this.boardEl.classList.add('active');
    this.boardEl.setAttribute('aria-hidden', 'false');
    this.$('name-input').value = this.lb.name();
    this._nameStatus('', '');
    this._loadBoard();
  };

  UI.prototype.closeBoard = function () {
    if (!this.boardOpen) return;
    this.boardOpen = false;
    this._boardReq++;
    this.$('name-input').blur();
    this.boardEl.classList.remove('active');
    this.boardEl.setAttribute('aria-hidden', 'true');
  };

  UI.prototype._setBoard = function (kind) {
    this.boardKind = kind === 'all' ? 'all' : 'week';
    var tabs = this.boardEl.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-board') === this.boardKind;
      tabs[i].classList.toggle('active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    this._loadBoard();
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // never innerHTML: names come from other players
    return n;
  }

  function boardRow(e, isYou) {
    var row = el('div', 'row' + (e.rank <= 3 ? ' top' + e.rank : '') + (isYou ? ' you' : ''));
    row.setAttribute('role', 'listitem');
    row.appendChild(el('span', 'rk', e.rank));
    row.appendChild(el('span', 'nm', e.name + (isYou ? '  (you)' : '')));
    row.appendChild(el('span', 'sc', e.score));
    return row;
  }

  UI.prototype._boardMessage = function (text, retry, spinner) {
    var list = this.$('board-list');
    list.textContent = '';
    var box = el('div', 'board-msg');
    if (spinner) box.appendChild(el('div', 'spinner'));
    box.appendChild(el('div', '', text));
    if (retry) {
      var b = el('button', 'btn btn-secondary btn-small');
      b.type = 'button';
      b.setAttribute('data-retry', '1');
      b.appendChild(el('span', '', 'TRY AGAIN'));
      box.appendChild(b);
    }
    list.appendChild(box);
  };

  UI.prototype._loadBoard = function () {
    var self = this, req = ++this._boardReq, kind = this.boardKind;
    var you = this.$('board-you');
    you.textContent = '';
    this._boardMessage('Loading the ranking…', false, true);

    this.lb.top(kind).then(function (data) {
      if (req !== self._boardReq) return;
      var list = self.$('board-list');
      list.textContent = '';
      var entries = data.entries || [];
      if (!entries.length) {
        self._boardMessage(kind === 'week' ? 'No scores yet this week. Be the first!' : 'No scores yet. Be the first!');
      } else {
        var frag = document.createDocumentFragment(), mine = null;
        for (var i = 0; i < entries.length; i++) {
          var r = boardRow(entries[i], !!entries[i].you);
          if (entries[i].you) mine = r;
          frag.appendChild(r);
        }
        list.appendChild(frag);
        list.scrollTop = 0;
        if (mine && mine.offsetTop + mine.offsetHeight > list.clientHeight) list.scrollTop = mine.offsetTop - list.clientHeight / 2;
      }
      // Pinned row when the player is ranked below the visible list.
      if (data.you && data.you.rank > entries.length) {
        you.appendChild(boardRow(data.you, true));
      } else if (!data.you) {
        you.appendChild(el('div', 'board-note', kind === 'week' ? 'Score a point this week to enter the ranking.' : 'Score a point to enter the ranking.'));
      }
    }).catch(function () {
      if (req !== self._boardReq) return;
      self._boardMessage('The ranking can’t be reached right now.', true);
    });
  };

  UI.prototype._nameStatus = function (text, kind) {
    var s = this.$('name-status');
    s.textContent = text;
    s.className = 'name-status' + (kind ? ' ' + kind : '');
  };

  UI.prototype._saveName = function () {
    var self = this, input = this.$('name-input');
    if (S.Leaderboard.cleanName(input.value) === this.lb.name()) { input.blur(); return; }
    this._nameStatus('Saving…', '');
    this.lb.rename(input.value).then(function (r) {
      if (!r.ok) {
        self._nameStatus('Use 2–14 letters, numbers, spaces, or _ . -', 'err');
        return;
      }
      input.value = r.name;
      input.blur();
      self._nameStatus(r.synced ? 'Name saved' : 'Saved here; it will update with your next score', 'ok');
      if (self.boardOpen && r.synced) self._loadBoard();
    });
  };

  /** Shows the player's world rank on the game-over panel. */
  UI.prototype._submitRank = function (r) {
    var self = this, box = this.$('over-rank'), run = this._runId;
    box.textContent = '';
    box.className = 'over-rank';
    if (r.score < 1) return;
    box.appendChild(el('span', 'rank-text', 'Sending score…'));

    this.lb.submit(r.score).then(function (res) {
      if (run !== self._runId) return;
      box.textContent = '';
      if (!res.ok) {
        box.className = 'over-rank muted';
        box.appendChild(el('span', 'rank-text', res.reason === 'rejected' ? 'Score not accepted by the ranking' : 'World ranking offline'));
        return;
      }
      box.className = 'over-rank show';
      var icon = el('span', 'rank-icon');
      icon.innerHTML = ICON.globe; // static markup, not user data
      box.appendChild(icon);
      var txt = 'Week #' + res.rank.week + '  ·  All time #' + res.rank.all;
      box.appendChild(el('span', 'rank-text', txt));
      if (res.rank.week <= 3) self.audio.play('milestone');
    });
  };

  // ---------------------------------------------------------------- game over

  UI.prototype._later = function (ms, fn) {
    this.timers.push(setTimeout(fn, ms));
  };

  UI.prototype._clearTimers = function () {
    for (var i = 0; i < this.timers.length; i++) clearTimeout(this.timers[i]);
    this.timers.length = 0;
    if (this._countRaf) cancelAnimationFrame(this._countRaf);
    this._countRaf = 0;
  };

  UI.prototype._showGameOver = function (r) {
    var self = this, $ = this.$;
    var scoreEl = $('over-score'), bestEl = $('over-best');
    var slot = $('medal-slot'), medalEl = $('medal'), nameEl = $('medal-name');
    var badge = $('badge-new'), hint = $('over-hint');

    this.overReady = false;
    scoreEl.textContent = '0';
    bestEl.textContent = r.prevBest;
    badge.classList.remove('show');
    bestEl.classList.remove('pop');
    slot.className = 'medal-slot';
    medalEl.innerHTML = '';
    nameEl.textContent = '';

    if (r.medal && r.medal.id === 'platinum') hint.textContent = 'Legendary flying!';
    else if (r.next) {
      var diff = r.next.min - r.score;
      hint.textContent = r.medal || r.score > 0
        ? diff + ' more for ' + r.next.name
        : 'Score ' + r.next.min + ' to earn ' + r.next.name;
    }

    this._show('over');
    this.audio.play('gameover');
    this._submitRank(r);

    // 1. Count the score up
    this._later(520, function () {
      var dur = Math.min(900, 160 + r.score * 45);
      var t0 = performance.now(), last = -1;
      var stepFn = function (now) {
        var k = Math.min(1, (now - t0) / dur);
        var v = Math.round(r.score * (1 - Math.pow(1 - k, 2)));
        if (v !== last) { scoreEl.textContent = v; if (v > 0) self.audio.play('tick'); last = v; }
        if (k < 1) self._countRaf = requestAnimationFrame(stepFn);
        else self._countDone(r);
      };
      self._countRaf = requestAnimationFrame(stepFn);
    });

    this._later(800, function () { self.overReady = true; });
  };

  UI.prototype._countDone = function (r) {
    var self = this, $ = this.$;
    this._countRaf = 0;
    var delay = 120;

    if (r.isNew && r.score > 0) {
      this._later(delay, function () {
        $('over-best').textContent = r.best;
        $('over-best').classList.add('pop');
        $('badge-new').classList.add('show');
        self.audio.play('newbest');
        self.confetti.cannons(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 110);
      });
      delay += 450;
    }

    if (r.medal) {
      this._later(delay, function () {
        var slot = $('medal-slot');
        $('medal').innerHTML = medalSVG(r.medal.id);
        $('medal-name').textContent = r.medal.name;
        slot.className = 'medal-slot has-medal tier-' + r.medal.id;
        void slot.offsetWidth;
        slot.classList.add('show');
        self.audio.play('medal');
        if (r.medal.id === 'gold' || r.medal.id === 'platinum') {
          var rect = slot.getBoundingClientRect(), app = self.app.getBoundingClientRect();
          self.confetti.burst(rect.left - app.left + rect.width / 2, rect.top - app.top + rect.height / 2, 70);
        }
      });
    }
  };

  S.UI = UI;
})(window.Skypip = window.Skypip || {});
