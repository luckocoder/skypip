/* Skypip — obstacle columns: fair procedural generation, difficulty ramp,
 * optional vertical motion at higher scores, collision and rendering. */
(function (S) {
  'use strict';

  var C = S.CONFIG, U = S.U;
  var INSET = (C.CAP_W - C.PIPE_W) / 2;

  function difficulty(score) {
    var t = U.ease.outQuad(U.clamp(score / C.RAMP_SCORE, 0, 1));
    var D = C.DIFF;
    return {
      speed: U.lerp(D.speed[0], D.speed[1], t),
      gap: U.lerp(D.gap[0], D.gap[1], t),
      spacing: U.lerp(D.spacing[0], D.spacing[1], t),
      maxShift: U.lerp(D.maxShift[0], D.maxShift[1], t)
    };
  }

  function Pipes() {
    this.list = [];
    this.free = [];
    this.nextX = 0;
    this.lastGapY = null;
    this.spawned = 0;
    this.time = 0;
    this._gradKey = '';
  }

  Pipes.difficulty = difficulty;

  Pipes.prototype.reset = function () {
    for (var i = 0; i < this.list.length; i++) this.free.push(this.list[i]);
    this.list.length = 0;
    this.lastGapY = null;
    this.spawned = 0;
  };

  /** Called when a run starts: places the first pipe just off (or near) screen. */
  Pipes.prototype.begin = function (cam, W, birdX) {
    this.reset();
    var lead = Math.min(W - birdX + 40, C.FIRST_PIPE_MAX_LEAD);
    this.nextX = cam + birdX + lead;
  };

  Pipes.prototype._spawn = function (cam, W, groundY, score) {
    var d = difficulty(score);
    var p = this.free.pop() || {};
    var gap = d.gap;
    var minY = C.PIPE_MARGIN_TOP + gap / 2;
    var maxY = groundY - C.PIPE_MARGIN_BOTTOM - gap / 2;

    // Moving pipes become possible at higher scores.
    var amp = 0;
    var mv = C.MOVING;
    if (score >= mv.startScore && this.spawned > 2) {
      var k = U.clamp((score - mv.startScore) / (mv.fullScore - mv.startScore), 0, 1);
      if (Math.random() < mv.maxChance * k + 0.12) amp = U.lerp(mv.ampMin, mv.ampMax, Math.random() * (0.4 + 0.6 * k));
    }
    minY += amp;
    maxY -= amp;
    if (maxY < minY) { maxY = minY = (minY + maxY) / 2; }

    var shift = d.maxShift * (amp ? 0.7 : 1);
    var lo = minY, hi = maxY;
    if (this.lastGapY !== null) {
      lo = Math.max(minY, this.lastGapY - shift);
      hi = Math.min(maxY, this.lastGapY + shift);
    } else {
      // First pipe: keep it close to the middle of the play area.
      var mid = (minY + maxY) / 2;
      lo = Math.max(minY, mid - 70);
      hi = Math.min(maxY, mid + 70);
    }
    var gapY = U.rand(lo, hi);

    p.x = this.nextX;
    p.baseY = gapY;
    p.gapY = gapY;
    p.gap = gap;
    p.amp = amp;
    p.phase = Math.random() * U.TAU;
    p.freq = U.rand(1.3, 2.1);
    p.scored = false;
    p.enter = (this.nextX - cam) < W ? 0 : 1; // pipes appearing on-screen slide in
    this.list.push(p);
    this.lastGapY = gapY;
    this.spawned++;
    this.nextX += d.spacing;
  };

  Pipes.prototype.update = function (dt, cam, W, groundY, score) {
    this.time += dt;
    while (this.nextX < cam + W + 140) this._spawn(cam, W, groundY, score);

    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      if (p.x + C.CAP_W < cam - 40) {
        this.free.push(p);
        this.list.splice(i, 1);
        continue;
      }
      if (p.enter < 1) p.enter = Math.min(1, p.enter + dt * 2.2);
      if (p.amp) p.gapY = p.baseY + Math.sin(this.time * p.freq + p.phase) * p.amp;
    }
  };

  /** Returns the pipe the bird just passed (for scoring), or null. */
  Pipes.prototype.checkScore = function (birdWorldX) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      if (!p.scored && birdWorldX > p.x + C.CAP_W / 2) {
        p.scored = true;
        return p;
      }
    }
    return null;
  };

  /** Circle (bird) vs the four rectangles of each nearby column. */
  Pipes.prototype.collides = function (bx, by, r, groundY) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      if (bx + r < p.x || bx - r > p.x + C.CAP_W) continue;
      var top = p.gapY - p.gap / 2, bot = p.gapY + p.gap / 2;
      if (U.circleRect(bx, by, r, p.x, top - C.CAP_H, C.CAP_W, C.CAP_H)) return true;
      if (U.circleRect(bx, by, r, p.x + INSET, -2000, C.PIPE_W, top - C.CAP_H + 2000)) return true;
      if (U.circleRect(bx, by, r, p.x, bot, C.CAP_W, C.CAP_H)) return true;
      if (U.circleRect(bx, by, r, p.x + INSET, bot + C.CAP_H, C.PIPE_W, groundY - bot)) return true;
    }
    return false;
  };

  Pipes.prototype._buildGradients = function (ctx, pal) {
    var bg = ctx.createLinearGradient(0, 0, C.PIPE_W, 0);
    bg.addColorStop(0, pal.pipeDark);
    bg.addColorStop(0.12, pal.pipeMid);
    bg.addColorStop(0.3, pal.pipeLight);
    bg.addColorStop(0.42, pal.pipeMid);
    bg.addColorStop(0.85, pal.pipeDark);
    bg.addColorStop(1, pal.pipeDark);
    var cg = ctx.createLinearGradient(0, 0, C.CAP_W, 0);
    cg.addColorStop(0, pal.pipeDark);
    cg.addColorStop(0.1, pal.pipeCap);
    cg.addColorStop(0.27, pal.pipeLight);
    cg.addColorStop(0.4, pal.pipeCap);
    cg.addColorStop(0.86, pal.pipeDark);
    cg.addColorStop(1, pal.pipeDark);
    this._bodyGrad = bg;
    this._capGrad = cg;
  };

  Pipes.prototype.draw = function (ctx, cam, W, groundY, pal, version) {
    if (!this.list.length) return;
    if (this._gradKey !== version) {
      this._buildGradients(ctx, pal);
      this._gradKey = version;
    }
    var PW = C.PIPE_W, CW = C.CAP_W, CH = C.CAP_H;
    ctx.lineJoin = 'round';

    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      var sx = p.x - cam;
      if (sx > W + 10 || sx + CW < -10) continue;
      var e = p.enter < 1 ? U.ease.outBack(p.enter) : 1;
      var slide = (1 - e) * 420;
      var top = p.gapY - p.gap / 2 - slide;
      var bot = p.gapY + p.gap / 2 + slide;

      ctx.save();
      ctx.translate(Math.round(sx * 4) / 4, 0);

      // --- bodies
      ctx.fillStyle = this._bodyGrad;
      ctx.strokeStyle = pal.pipeOutline;
      ctx.lineWidth = 2.5;
      // top body
      var tb = top - CH;
      ctx.save();
      ctx.translate(INSET, 0);
      ctx.fillRect(0, -40, PW, tb + 40);
      ctx.strokeRect(0, -40, PW, tb + 40);
      // bottom body
      var bb = bot + CH;
      ctx.fillRect(0, bb, PW, groundY - bb + 6);
      ctx.strokeRect(0, bb, PW, groundY - bb + 6);

      // segment joints for texture
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      var jy;
      for (jy = tb - 70; jy > -40; jy -= 96) ctx.fillRect(1.5, jy, PW - 3, 3);
      for (jy = bb + 70; jy < groundY; jy += 96) ctx.fillRect(1.5, jy, PW - 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (jy = tb - 70; jy > -40; jy -= 96) ctx.fillRect(1.5, jy + 3, PW - 3, 2);
      for (jy = bb + 70; jy < groundY; jy += 96) ctx.fillRect(1.5, jy + 3, PW - 3, 2);

      // lip shadows next to the caps
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(1.25, tb - 9, PW - 2.5, 9);
      ctx.fillRect(1.25, bb, PW - 2.5, 9);
      ctx.restore();

      // --- caps
      this._cap(ctx, tb, pal);
      this._cap(ctx, bot, pal);

      ctx.restore();
    }
  };

  Pipes.prototype._cap = function (ctx, y, pal) {
    var CW = C.CAP_W, CH = C.CAP_H;
    U.roundRectPath(ctx, 0, y, CW, CH, 7);
    ctx.fillStyle = this._capGrad;
    ctx.fill();
    ctx.strokeStyle = pal.pipeOutline;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // bevel highlight and shade
    ctx.fillStyle = U.rgba(pal.c.pipeBand, 0.55);
    ctx.fillRect(5, y + 4, CW - 10, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(4, y + CH - 8, CW - 8, 4);
    // a small gloss dot
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(CW * 0.27, y + CH * 0.5, 4, 7, 0, 0, U.TAU);
    ctx.fill();
  };

  S.Pipes = Pipes;
})(window.Skypip = window.Skypip || {});
