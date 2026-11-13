/* Skypip — game core: state machine, fixed-timestep loop, world update and
 * rendering. Knows nothing about the DOM UI; communicates through events:
 *   state(name, prev) · score(n) · milestone(medal) · countdown(n)
 *   gameover(result) · resize(info) · phase(name)                        */
(function (S) {
  'use strict';

  var C = S.CONFIG, U = S.U;

  function Game(canvas, audio, store) {
    U.Emitter.call(this);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio;
    this.store = store;

    this.sprites = new S.Sprites();
    this.bg = new S.Background(this.sprites);
    this.pipes = new S.Pipes();
    this.bird = new S.Bird();
    this.particles = new S.Particles(360);

    this.state = 'menu';
    this.score = 0;
    this.cam = this.prevCam = 0;
    this.speed = C.MENU_SPEED;
    this.time = 0;
    this.stateTime = 0;
    this.shakeT = 0;
    this.shakeDur = 0.0001;
    this.shakeMag = 0;
    this.flash = 0;
    this.countT = 0;
    this.lastCount = 0;
    this.phase = 0;
    this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.maxDpr = 2;
    this.frameHooks = [];
    this._perf = { t: 0, slow: 0, n: 0, done: false };

    this.resize();
    var m = this.menuPos();
    this.bird.reset(m.x, m.y);
    this.bird.setIdle(m.x, m.y);

    this._acc = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  Game.prototype = Object.create(U.Emitter.prototype);
  Game.prototype.constructor = Game;

  // ---------------------------------------------------------------- layout

  Game.prototype.resize = function () {
    var vw = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    var vh = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    var scale = Math.min(vw / C.BASE_W, vh / C.BASE_H);
    var dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    var oldW = this.W, oldGround = this.groundY;

    // Nothing changed (e.g. the on-screen keyboard opened): skip the rebuild.
    if (vw === this._vw && vh === this._vh && dpr === this.dpr) return;
    this._vw = vw;
    this._vh = vh;

    this.scale = scale;
    this.W = vw / scale;
    this.H = vh / scale;
    this.groundY = this.H - C.GROUND_H;
    this.dpr = dpr;
    this.pr = scale * dpr;
    this.canvas.width = Math.round(vw * dpr);
    this.canvas.height = Math.round(vh * dpr);
    this.birdX = U.clamp(this.W * 0.3, 100, 340);

    this.sprites.build(this.pr, this.bg.palettes);
    this.bg.resize(this.W, this.H, this.groundY);
    this.pipes._gradKey = '';

    // Keep the bird in a sensible place after a resize.
    if (oldW && this.bird) {
      if (this.state === 'menu') { var m = this.menuPos(); this.bird.setIdle(m.x, m.y); }
      else if (this.state === 'ready') { var r = this.readyPos(); this.bird.setIdle(r.x, r.y); }
      else {
        this.bird.x = this.bird.prevX = this.birdX;
        if (this.bird.y > this.groundY - 15) this.bird.y = this.bird.prevY = this.groundY - 15;
      }
      if (this.state === 'playing' && Math.abs(oldGround - this.groundY) > 2) this.pause();
    }

    this.emit('resize', { scale: scale, W: this.W, H: this.H, groundY: this.groundY, cssW: vw, cssH: vh, dpr: dpr });
  };

  Game.prototype.menuPos = function () { return { x: this.W / 2, y: this.groundY * 0.48 }; };
  Game.prototype.readyPos = function () { return { x: this.birdX, y: this.groundY * 0.46 }; };

  // ---------------------------------------------------------------- states

  Game.prototype._setState = function (s) {
    var prev = this.state;
    this.state = s;
    this.stateTime = 0;
    this.emit('state', s, prev);
  };

  Game.prototype._resetRun = function () {
    this.score = 0;
    this.pipes.reset();
    this.particles.clear();
    this.phase = 0;
    this.bg.setPhase(0, true);
    this.emit('score', 0, false);
  };

  Game.prototype.goMenu = function () {
    this._resetRun();
    var m = this.menuPos();
    this.bird.reset(m.x, m.y);
    this.bird.setIdle(m.x, m.y);
    this.speed = C.MENU_SPEED;
    this.audio.setIntensity(0);
    this._setState('menu');
  };

  Game.prototype.goReady = function () {
    var fromMenu = this.state === 'menu';
    this._resetRun();
    var r = this.readyPos();
    if (!fromMenu) this.bird.reset(r.x, r.y);
    this.bird.setIdle(r.x, r.y);
    this.audio.setIntensity(0);
    this._setState('ready');
  };

  Game.prototype.start = function () {
    if (this.state !== 'ready') return;
    this.pipes.begin(this.cam, this.W, this.birdX);
    this.audio.setIntensity(1);
    this._setState('playing');
    this.flap();
  };

  Game.prototype.flap = function () {
    this.bird.flap();
    this.audio.play('flap');
    this.particles.flapPuff(this.bird.x, this.bird.y);
  };

  /** Primary input (tap / click / space). */
  Game.prototype.action = function () {
    if (this.state === 'ready') this.start();
    else if (this.state === 'playing') this.flap();
  };

  Game.prototype.pause = function () {
    if (this.state !== 'playing') return false;
    this.audio.play('pause');
    this._setState('paused');
    return true;
  };

  Game.prototype.resume = function () {
    if (this.state !== 'paused') return;
    this.audio.play('resume');
    this.countT = 0;
    this.lastCount = 3;
    this._setState('resuming');
    this.emit('countdown', 3);
    this.audio.play('count');
  };

  Game.prototype._die = function (fromPipe) {
    if (this.state !== 'playing') return;
    this.bird.die(fromPipe);
    this.audio.play('hit');
    this.audio.setIntensity(0);
    this.shake(fromPipe ? 9 : 7, 0.4);
    this.flash = this.reducedMotion ? 0.25 : 0.75;
    this.particles.feathers(this.bird.x, this.bird.y, 12);
    this.particles.sparkles(this.bird.x, this.bird.y, 6, '#ffffff');
    try { if (navigator.vibrate) navigator.vibrate(45); } catch (e) { /* ignore */ }
    this._landed = false;
    this._overDelay = 0;
    this._setState('dying');
  };

  Game.prototype._gameOver = function () {
    var d = this.store.data;
    var prevBest = d.best;
    var isNew = this.score > prevBest;
    if (isNew) d.best = this.score;
    d.plays++;
    this.store.save();
    this._setState('over');
    this.emit('gameover', {
      score: this.score,
      best: d.best,
      prevBest: prevBest,
      isNew: isNew,
      medal: C.medalFor(this.score),
      next: C.nextMedal(this.score)
    });
  };

  Game.prototype.shake = function (mag, dur) {
    if (!this.store.data.shake) return;
    if (this.reducedMotion) mag *= 0.35;
    this.shakeMag = mag;
    this.shakeDur = dur;
    this.shakeT = dur;
  };

  // ---------------------------------------------------------------- update

  Game.prototype._step = function (dt) {
    var bird = this.bird;
    this.time += dt;
    this.stateTime += dt;
    this.prevCam = this.cam;

    switch (this.state) {
      case 'menu':
        this.speed = U.approach(this.speed, C.MENU_SPEED, 3, dt);
        break;
      case 'ready':
        this.speed = U.approach(this.speed, C.READY_SPEED, 3, dt);
        break;
      case 'playing':
        this.speed = U.approach(this.speed, S.Pipes.difficulty(this.score).speed, 2, dt);
        break;
      case 'dying':
      case 'over':
        this.speed = 0;
        break;
      case 'paused':
        this._freeze();
        return;
      case 'resuming':
        this._freeze();
        this.countT += dt;
        var n = 3 - Math.floor(this.countT / 0.55);
        if (n !== this.lastCount) {
          this.lastCount = n;
          if (n > 0) { this.emit('countdown', n); this.audio.play('count'); }
        }
        if (this.countT >= 0.55 * 3) {
          this.audio.play('go');
          this._setState('playing');
          this.emit('countdown', 0);
        }
        return;
    }

    this.cam += this.speed * dt;
    var dCam = this.cam - this.prevCam;

    bird.update(dt, this.groundY);

    if (this.state === 'playing') {
      this.pipes.update(dt, this.cam, this.W, this.groundY, this.score);

      var passed = this.pipes.checkScore(this.cam + bird.x);
      if (passed) this._scored(passed);

      if (bird.y + 15 >= this.groundY) {
        bird.y = this.groundY - 15;
        this._die(false);
      } else if (this.pipes.collides(this.cam + bird.x, bird.y, bird.r, this.groundY)) {
        this._die(true);
      }
    } else if (this.state === 'dying') {
      if (bird.landed && !this._landed) {
        this._landed = true;
        this.audio.play('thud');
        this.shake(4, 0.2);
        this.particles.dust(bird.x, this.groundY - 2, 8);
      }
      if (this._landed) {
        this._overDelay += dt;
        if (this._overDelay > 0.55) this._gameOver();
      }
    }

    this.bg.update(dt, dCam);
    this.particles.update(dt, this.speed);

    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
  };

  Game.prototype._freeze = function () {
    var b = this.bird;
    b.prevX = b.x; b.prevY = b.y; b.prevRot = b.rot; b.prevWing = b.wingAngle;
  };

  Game.prototype._scored = function (pipe) {
    this.score++;
    var s = this.score;
    var gx = pipe.x - this.cam + C.CAP_W / 2;
    this.particles.sparkles(gx, pipe.gapY, 7);
    this.particles.ring(this.bird.x, this.bird.y, 'rgba(255,255,255,1)');

    // Sky phase first so a medal toast (more important) wins if both happen.
    var ph = Math.floor(s / C.PHASE_EVERY) % C.PALETTES.length;
    if (ph !== this.phase) {
      this.phase = ph;
      this.bg.setPhase(ph, false);
      this.emit('phase', C.PHASE_NAMES[ph]);
    }

    var medal = null;
    for (var i = 0; i < C.MEDALS.length; i++) if (C.MEDALS[i].min === s) medal = C.MEDALS[i];

    if (medal) { this.audio.play('milestone'); this.emit('milestone', medal); }
    else if (s % 10 === 0) this.audio.play('score10');
    else this.audio.play('score');

    this.emit('score', s, true);
  };

  // ---------------------------------------------------------------- loop

  Game.prototype._loop = function (ts) {
    requestAnimationFrame(this._loop);
    if (!this._last) this._last = ts;
    var frame = (ts - this._last) / 1000;
    this._last = ts;
    if (frame < 0) frame = 0;
    if (frame > C.MAX_FRAME) frame = C.MAX_FRAME;

    this._acc += frame;
    var steps = 0;
    while (this._acc >= C.STEP && steps < 40) {
      this._step(C.STEP);
      this._acc -= C.STEP;
      steps++;
    }
    var alpha = this._acc / C.STEP;
    this._render(alpha);

    for (var i = 0; i < this.frameHooks.length; i++) this.frameHooks[i](frame);
    this._adaptQuality(frame);
  };

  /** Drops the render resolution once if the device clearly can't keep up. */
  Game.prototype._adaptQuality = function (frame) {
    var p = this._perf;
    if (p.done || this.state !== 'playing' || this.dpr <= 1) return;
    p.t += frame;
    p.n++;
    if (frame > 0.026) p.slow++;
    if (p.t > 4) {
      if (p.slow / p.n > 0.5) {
        this.maxDpr = 1;
        this.resize();
      }
      p.done = true;
    }
  };

  Game.prototype._render = function (alpha) {
    var ctx = this.ctx, pr = this.pr;
    var sx = 0, sy = 0;
    if (this.shakeT > 0) {
      var k = this.shakeT / this.shakeDur;
      var m = this.shakeMag * k * k;
      sx = (Math.random() * 2 - 1) * m;
      sy = (Math.random() * 2 - 1) * m;
    }
    ctx.setTransform(pr, 0, 0, pr, sx * pr, sy * pr);
    ctx.imageSmoothingEnabled = true;

    var cam = U.lerp(this.prevCam, this.cam, alpha);
    var bg = this.bg;
    bg.draw(ctx, cam);
    this.pipes.draw(ctx, cam, this.W, this.groundY, bg.pal, bg.version);
    bg.drawGround(ctx, cam, pr);

    // Soft contact shadow under the bird
    var by = U.lerp(this.bird.prevY, this.bird.y, alpha);
    var bx = U.lerp(this.bird.prevX, this.bird.x, alpha);
    var dist = U.clamp((this.groundY - by) / 260, 0, 1);
    ctx.fillStyle = 'rgba(30,40,20,' + (0.22 * (1 - dist)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(bx, this.groundY + 3, 18 * (1 - dist * 0.5), 4 * (1 - dist * 0.5), 0, 0, U.TAU);
    ctx.fill();

    this.particles.draw(ctx, 0);
    this.bird.draw(ctx, alpha, this.sprites);
    this.particles.draw(ctx, 1);

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-20, -20, this.W + 40, this.H + 40);
      ctx.globalAlpha = 1;
    }
  };

  S.Game = Game;
})(window.Skypip = window.Skypip || {});
