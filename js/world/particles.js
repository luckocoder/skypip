/* Skypip — pooled particle system (zero allocations while playing). */
(function (S) {
  'use strict';

  var U = S.U, TAU = U.TAU;

  var PUFF = 0, FEATHER = 1, SPARK = 2, RING = 3, DUST = 4;

  function Particles(max) {
    this.pool = [];
    for (var i = 0; i < max; i++) this.pool.push({ on: false });
    this.cursor = 0;
    this.active = 0;
  }

  Particles.TYPES = { PUFF: PUFF, FEATHER: FEATHER, SPARK: SPARK, RING: RING, DUST: DUST };

  Particles.prototype._get = function () {
    var pool = this.pool, n = pool.length;
    for (var i = 0; i < n; i++) {
      var idx = (this.cursor + i) % n;
      if (!pool[idx].on) { this.cursor = (idx + 1) % n; return pool[idx]; }
    }
    // Pool exhausted: recycle the next slot.
    var p = pool[this.cursor];
    this.cursor = (this.cursor + 1) % n;
    return p;
  };

  Particles.prototype.spawn = function (type, x, y, vx, vy, life, size, size1, color, opts) {
    var p = this._get();
    p.on = true;
    p.type = type;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = 0; p.max = life;
    p.size = size; p.size1 = size1;
    p.color = color;
    p.g = opts && opts.g || 0;
    p.drag = opts && opts.drag || 0;
    p.scroll = opts && opts.scroll ? 1 : 0;
    p.front = opts && opts.front ? 1 : 0;
    p.rot = opts && opts.rot || 0;
    p.vr = opts && opts.vr || 0;
    p.a = opts && opts.a !== undefined ? opts.a : 1;
    p.ph = Math.random() * TAU;
    return p;
  };

  Particles.prototype.flapPuff = function (x, y) {
    for (var i = 0; i < 3; i++) {
      this.spawn(PUFF, x - 16 + U.rand(-3, 3), y + 8 + U.rand(-3, 3), U.rand(-60, -20), U.rand(30, 80), U.rand(0.3, 0.45),
        U.rand(3, 5), U.rand(9, 13), 'rgba(255,255,255,1)', { drag: 4, scroll: true, a: 0.55 });
    }
  };

  Particles.prototype.feathers = function (x, y, n) {
    var colors = ['#2fc6b6', '#18a99d', '#86f3e3', '#fff4dc'];
    for (var i = 0; i < n; i++) {
      var a = U.rand(0, TAU), sp = U.rand(90, 260);
      this.spawn(FEATHER, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, U.rand(1.1, 1.8),
        U.rand(4.5, 7), 0, U.pick(colors), { g: 260, drag: 2.6, front: true, rot: U.rand(0, TAU), vr: U.rand(-9, 9) });
    }
  };

  Particles.prototype.sparkles = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = U.rand(0, TAU), sp = U.rand(40, 170);
      this.spawn(SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.35, 0.7),
        U.rand(4, 7.5), 0, color || '#fff6b0', { drag: 3.5, front: true, scroll: true, rot: U.rand(0, 1) });
    }
  };

  Particles.prototype.ring = function (x, y, color) {
    this.spawn(RING, x, y, 0, 0, 0.45, 8, 44, color || 'rgba(255,255,255,1)', { front: true, scroll: true, a: 0.8 });
  };

  Particles.prototype.dust = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      var dir = i % 2 ? 1 : -1;
      this.spawn(DUST, x + U.rand(-6, 6), y, dir * U.rand(40, 140), U.rand(-70, -20), U.rand(0.45, 0.8),
        U.rand(4, 7), U.rand(10, 16), 'rgba(236,206,160,1)', { drag: 3, g: 60, front: true, a: 0.8 });
    }
  };

  Particles.prototype.clear = function () {
    for (var i = 0; i < this.pool.length; i++) this.pool[i].on = false;
  };

  Particles.prototype.update = function (dt, scrollSpeed) {
    var pool = this.pool, count = 0;
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.on) continue;
      p.life += dt;
      if (p.life >= p.max) { p.on = false; continue; }
      count++;
      if (p.drag) {
        var d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt - p.scroll * scrollSpeed * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === FEATHER) p.x += Math.sin(p.life * 6 + p.ph) * 22 * dt;
    }
    this.active = count;
  };

  Particles.prototype.draw = function (ctx, front) {
    if (!this.active) return;
    var pool = this.pool;
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.on || p.front !== front) continue;
      var t = p.life / p.max;
      var size = p.size + (p.size1 - p.size) * t;
      switch (p.type) {
        case PUFF:
        case DUST:
          ctx.globalAlpha = p.a * (1 - t) * (1 - t);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, TAU);
          ctx.fill();
          break;
        case FEATHER:
          ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot + Math.sin(p.life * 5 + p.ph) * 0.6);
          ctx.fillStyle = p.color;
          ctx.strokeStyle = 'rgba(14,74,82,0.9)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(p.size * 0.8, 0);
          ctx.stroke();
          ctx.restore();
          break;
        case SPARK:
          var s = p.size * (1 - t * t);
          ctx.globalAlpha = 1 - t * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          U.sparklePath(ctx, p.x, p.y, s);
          ctx.fill();
          break;
        case RING:
          ctx.globalAlpha = p.a * (1 - t);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4 * (1 - t) + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + (p.size1 - p.size) * U.ease.outCubic(t), 0, TAU);
          ctx.stroke();
          break;
      }
    }
    ctx.globalAlpha = 1;
  };

  S.Particles = Particles;
})(window.Skypip = window.Skypip || {});
