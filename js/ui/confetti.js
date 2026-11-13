/* Skypip — celebratory confetti on an overlay canvas above the UI. */
(function (S) {
  'use strict';

  var U = S.U;
  var COLORS = ['#ffd45c', '#ff7a59', '#2fc6b6', '#8ec5ff', '#ff9fc2', '#ffffff', '#b78cff'];

  function Confetti(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pieces = [];
    this.w = 0; this.h = 0; this.dpr = 1;
    this._dirty = false;
  }

  Confetti.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  };

  Confetti.prototype._add = function (x, y, vx, vy) {
    this.pieces.push({
      x: x, y: y, vx: vx, vy: vy,
      w: U.rand(6, 11), h: U.rand(9, 15),
      rot: U.rand(0, U.TAU), vr: U.rand(-8, 8),
      flip: U.rand(0, U.TAU), vf: U.rand(6, 12),
      color: U.pick(COLORS),
      life: 0, max: U.rand(2.2, 3.4),
      circle: Math.random() < 0.25
    });
  };

  /** Radial burst from (x, y) in CSS pixels. */
  Confetti.prototype.burst = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = U.rand(-Math.PI, 0), sp = U.rand(250, 720);
      this._add(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120);
    }
  };

  /** Two side cannons. */
  Confetti.prototype.cannons = function (n) {
    for (var i = 0; i < n; i++) {
      var left = i % 2 === 0;
      var a = left ? U.rand(-1.35, -0.9) : U.rand(-2.25, -1.8), sp = U.rand(600, 1050);
      this._add(left ? -10 : this.w + 10, this.h * 0.75, Math.cos(a) * sp, Math.sin(a) * sp);
    }
  };

  Confetti.prototype.clear = function () {
    this.pieces.length = 0;
  };

  Confetti.prototype.frame = function (dt) {
    var ctx = this.ctx, ps = this.pieces;
    if (!ps.length) {
      if (this._dirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this._dirty = false;
      }
      return;
    }
    this._dirty = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.life += dt;
      if (p.life > p.max || p.y > this.h + 40) { ps.splice(i, 1); continue; }
      var drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + 900 * dt;
      if (p.vy > 260) p.vy = U.approach(p.vy, 260, 4, dt);
      p.x += (p.vx + Math.sin(p.life * 4 + p.flip) * 30) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vf * dt;

      var t = p.life / p.max;
      ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));
      if (p.circle) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w * 0.45, 0, U.TAU);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  S.Confetti = Confetti;
})(window.Skypip = window.Skypip || {});
