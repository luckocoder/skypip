/* Skypip — fully synthesized audio (WebAudio). No external audio files.
 * SFX are built from oscillators + filtered noise; music is a gentle
 * generative loop scheduled ahead of time with a lookahead scheduler. */
(function (S) {
  'use strict';

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var CHORDS = [
    { bass: 48, pad: [60, 64, 67, 71], mel: [72, 76, 79, 83] }, // Cmaj7
    { bass: 45, pad: [57, 60, 64, 67], mel: [72, 76, 81, 84] }, // Am7
    { bass: 41, pad: [57, 60, 64, 65], mel: [72, 76, 77, 81] }, // Fmaj7
    { bass: 43, pad: [55, 59, 62, 67], mel: [74, 79, 83, 86] }  // G
  ];
  var PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
  var BPM = 96;
  var STEP_DUR = 60 / BPM / 2; // eighth notes
  var STEPS = 32;              // 4 bars of 8ths

  function AudioEngine(store) {
    this.store = store;
    this.ctx = null;
    this.musicOn = false;
    this.intensity = 0;
    this._timer = null;
    this._lastTick = 0;
  }

  AudioEngine.prototype.unlock = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      this._build();
    }
    if (this.ctx.state === 'suspended') {
      var p = this.ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
    if (this.store.data.music && !this.musicOn) this.startMusic();
  };

  AudioEngine.prototype._build = function () {
    var c = this.ctx, d = this.store.data;

    this.master = c.createGain();
    this.master.gain.value = d.volume;

    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(c.destination);

    this.sfx = c.createGain();
    this.sfx.gain.value = d.sfx ? 1 : 0;
    this.sfx.connect(this.master);

    this.music = c.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);

    // Echo for the melody
    this.musicDry = c.createGain();
    this.musicDry.connect(this.music);
    this.echoSend = c.createGain();
    this.echoSend.gain.value = 0.32;
    var delay = c.createDelay(1.5);
    delay.delayTime.value = STEP_DUR * 3;
    var fb = c.createGain();
    fb.gain.value = 0.3;
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.musicDry.connect(this.echoSend);
    this.echoSend.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(this.music);

    // 1s white noise buffer shared by all noise voices
    var len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    var data = this.noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    var self = this;
    document.addEventListener('visibilitychange', function () {
      if (!self.ctx) return;
      if (document.hidden) self.ctx.suspend().catch(function () {});
      else self.ctx.resume().catch(function () {});
    });
  };

  AudioEngine.prototype._running = function () {
    return this.ctx && this.ctx.state === 'running';
  };

  // ---- primitives -------------------------------------------------------

  AudioEngine.prototype._tone = function (type, f0, f1, t, dur, vol, attack, dest) {
    var c = this.ctx;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var a = attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  AudioEngine.prototype._noise = function (t, dur, vol, ftype, f0, f1, q, dest) {
    var c = this.ctx;
    var s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    var f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 1;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  };

  AudioEngine.prototype._notes = function (midis, t, gap, type, dur, vol) {
    for (var i = 0; i < midis.length; i++) {
      var f = mtof(midis[i]);
      this._tone(type, f, f, t + i * gap, dur, vol, 0.006);
      this._tone('sine', f * 2, f * 2, t + i * gap, dur * 0.6, vol * 0.25, 0.006);
    }
  };

  // ---- sound effects ----------------------------------------------------

  AudioEngine.prototype.play = function (name) {
    if (!this._running() || !this.store.data.sfx) return;
    var t = this.ctx.currentTime + 0.004;
    var r = 0.95 + Math.random() * 0.1;
    switch (name) {
      case 'flap':
        this._noise(t, 0.13, 0.32, 'bandpass', 1900 * r, 650, 1.4);
        this._tone('sine', 540 * r, 360 * r, t, 0.08, 0.1);
        break;
      case 'score':
        this._tone('triangle', 1046.5, 1046.5, t, 0.09, 0.22);
        this._tone('triangle', 1568, 1568, t + 0.065, 0.2, 0.2);
        this._tone('sine', 3136, 3136, t + 0.065, 0.12, 0.04);
        break;
      case 'score10':
        this._notes([84, 88, 91, 96], t, 0.06, 'triangle', 0.22, 0.17);
        break;
      case 'hit':
        this._noise(t, 0.2, 0.55, 'lowpass', 3200, 280, 0.8);
        this._tone('sine', 190, 42, t, 0.3, 0.75, 0.002);
        this._tone('square', 120, 60, t, 0.08, 0.06, 0.002);
        break;
      case 'thud':
        this._tone('sine', 130, 38, t, 0.22, 0.55, 0.002);
        this._noise(t, 0.12, 0.25, 'lowpass', 700, 200, 0.7);
        break;
      case 'gameover':
        this._notes([79, 76, 72, 67], t + 0.05, 0.13, 'triangle', 0.26, 0.15);
        break;
      case 'swoosh':
        this._noise(t, 0.28, 0.13, 'bandpass', 380, 2400, 1.2);
        break;
      case 'click':
        this._tone('sine', 880, 620, t, 0.07, 0.18);
        this._tone('triangle', 1760, 1760, t, 0.03, 0.04);
        break;
      case 'hover':
        this._tone('sine', 1250, 1250, t, 0.035, 0.035);
        break;
      case 'tick':
        if (t - this._lastTick < 0.035) return;
        this._lastTick = t;
        this._tone('sine', 1500, 1500, t, 0.03, 0.06);
        break;
      case 'medal':
        this._notes([84, 88, 91, 96, 100], t, 0.07, 'triangle', 0.32, 0.15);
        for (var i = 0; i < 6; i++) this._tone('sine', 3000 + i * 420, 3000 + i * 420, t + 0.35 + i * 0.04, 0.12, 0.025);
        break;
      case 'newbest':
        this._notes([79, 84, 88], t, 0.1, 'triangle', 0.2, 0.16);
        this._notes([91], t + 0.3, 0.1, 'triangle', 0.6, 0.18);
        this._tone('sine', mtof(67), mtof(67), t + 0.3, 0.6, 0.08, 0.02);
        break;
      case 'milestone':
        this._notes([88, 91, 96], t, 0.05, 'triangle', 0.18, 0.12);
        break;
      case 'pause':
        this._tone('sine', 660, 660, t, 0.08, 0.14);
        this._tone('sine', 440, 440, t + 0.08, 0.12, 0.14);
        break;
      case 'resume':
        this._tone('sine', 440, 440, t, 0.08, 0.14);
        this._tone('sine', 660, 660, t + 0.08, 0.12, 0.14);
        break;
      case 'count':
        this._tone('triangle', 880, 880, t, 0.1, 0.14);
        break;
      case 'go':
        this._tone('triangle', 1320, 1320, t, 0.18, 0.16);
        break;
    }
  };

  // ---- settings ----------------------------------------------------------

  AudioEngine.prototype.setVolume = function (v) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  };

  AudioEngine.prototype.setSfx = function (on) {
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
  };

  AudioEngine.prototype.setMusic = function (on) {
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  };

  AudioEngine.prototype.setIntensity = function (v) {
    this.intensity = v;
  };

  // ---- music -------------------------------------------------------------

  AudioEngine.prototype.startMusic = function () {
    if (!this.ctx) return;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    if (this.musicOn) return;
    this.musicOn = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.15;
    this._genMelody();
    var self = this;
    this._timer = setInterval(function () { self._schedule(); }, 50);
  };

  AudioEngine.prototype.stopMusic = function () {
    if (!this.ctx || !this.musicOn) return;
    this.musicOn = false;
    clearInterval(this._timer);
    this._timer = null;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  };

  AudioEngine.prototype._genMelody = function () {
    var m = [];
    for (var b = 0; b < 4; b++) {
      for (var p = 0; p < 8; p++) {
        var strong = p === 0 || p === 4;
        var n = null;
        if (Math.random() < (strong ? 0.7 : 0.3)) {
          var src = strong ? CHORDS[b].mel : PENTA;
          n = src[(Math.random() * src.length) | 0];
        }
        m.push(n);
      }
    }
    this._melody = m;
  };

  AudioEngine.prototype._schedule = function () {
    if (!this._running()) return;
    var now = this.ctx.currentTime;
    if (this._nextTime < now - 0.1) this._nextTime = now + 0.05; // recovered from suspend
    while (this._nextTime < now + 0.3) {
      this._playStep(this._step, this._nextTime);
      this._nextTime += STEP_DUR;
      this._step = (this._step + 1) % STEPS;
      if (this._step === 0) this._genMelody();
    }
  };

  AudioEngine.prototype._playStep = function (s, t) {
    var bar = (s / 8) | 0, pos = s % 8, ch = CHORDS[bar];
    var dest = this.musicDry;
    var i;

    if (pos === 0) {
      this._tone('triangle', mtof(ch.bass), mtof(ch.bass), t, STEP_DUR * 3.5, 0.16, 0.01, this.music);
      for (i = 0; i < ch.pad.length; i++) {
        var f = mtof(ch.pad[i]);
        this._tone('sine', f, f, t, STEP_DUR * 7.6, 0.022, 0.35, this.music);
      }
    } else if (pos === 4) {
      this._tone('triangle', mtof(ch.bass + 7), mtof(ch.bass + 7), t, STEP_DUR * 3, 0.11, 0.01, this.music);
    }

    var n = this._melody[s];
    if (n) {
      var fm = mtof(n);
      this._tone('sine', fm, fm, t, 0.55, 0.05, 0.005, dest);
      this._tone('sine', fm * 3, fm * 3, t, 0.18, 0.008, 0.003, dest);
    }

    if (this.intensity > 0) {
      var off = pos % 2 === 1;
      this._noise(t, 0.045, off ? 0.04 : 0.022, 'highpass', 7000, null, 0.7, this.music);
      if (pos === 0 || pos === 4) this._tone('sine', 110, 48, t, 0.16, 0.13, 0.002, this.music);
    }
  };

  S.AudioEngine = AudioEngine;
})(window.Skypip = window.Skypip || {});
