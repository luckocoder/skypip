/* Skypip — layered parallax environment with a smooth day/night cycle:
 * sky, stars, sun/moon, clouds, two mountain ranges, haze, distant flocks,
 * tree-covered hills, floating pollen / fireflies, and the scrolling ground. */
(function (S) {
  'use strict';

  var C = S.CONFIG, U = S.U, TAU = U.TAU;

  function makeProfile(period, step, waves, ridged) {
    var n = Math.round(period / step);
    var h = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / n) * TAU, v = 0;
      for (var w = 0; w < waves.length; w++) {
        var s = Math.sin(x * waves[w][0] + waves[w][2]);
        v += waves[w][1] * (ridged ? Math.pow(1 - Math.abs(s), 1.6) : s * 0.5 + 0.5);
      }
      h[i] = v;
    }
    return { period: n * step, step: step, h: h, n: n };
  }

  function sampleProfile(p, x) {
    var fx = ((x % p.period) + p.period) % p.period / p.step;
    var i = Math.floor(fx), t = fx - i;
    return p.h[i % p.n] * (1 - t) + p.h[(i + 1) % p.n] * t;
  }

  function Background(sprites) {
    this.sprites = sprites;
    this.palettes = C.PALETTES.map(U.preparePalette);
    this.from = 0;
    this.to = 0;
    this.blend = 1;
    this.pal = {};
    this.version = 0;
    U.blendPalettes(this.palettes[0], this.palettes[0], 0, this.pal);

    this.far = makeProfile(1800, 12, [[3, 70, 0.3], [7, 42, 1.1], [13, 18, 2.2], [23, 8, 0.7]], true);
    this.near = makeProfile(1400, 12, [[2, 46, 1.0], [5, 30, 2.5], [11, 13, 0.2], [19, 5, 1.3]], false);
    this.hills = makeProfile(1100, 10, [[4, 16, 0.5], [9, 10, 1.7], [17, 5, 3.0]], false);

    var rnd = U.seeded(42);
    this.trees = [];
    for (var x = 0; x < this.hills.period; x += 14 + rnd() * 30) {
      this.trees.push({ x: x, r: 9 + rnd() * 9, dx: rnd() * 6 - 3 });
      if (rnd() < 0.45) this.trees.push({ x: x + 8 + rnd() * 6, r: 6 + rnd() * 6, dx: 0 });
    }

    this.stars = [];
    for (var i = 0; i < 90; i++) {
      this.stars.push({ x: rnd(), y: rnd() * 0.62, s: rnd() < 0.15 ? 2.2 : 1.2 + rnd() * 0.6, sp: 1 + rnd() * 3, ph: rnd() * TAU });
    }

    this.clouds = [];
    this.motes = [];
    this.flocks = [];
    this.flockTimer = 3;
    this.time = 0;
    this.W = 0; this.H = 0; this.groundY = 0;
    this._skyKey = '';
  }

  Background.prototype.resize = function (W, H, groundY) {
    var first = this.W === 0;
    this.W = W; this.H = H; this.groundY = groundY;
    this._skyKey = '';
    if (first) this._initAmbient();
    else {
      // Keep existing clouds, top up if the screen got wider.
      this._fillClouds();
      for (var i = 0; i < this.motes.length; i++) {
        var m = this.motes[i];
        if (m.x > W) m.x = Math.random() * W;
        if (m.y > groundY) m.y = groundY * U.rand(0.35, 0.95);
      }
    }
  };

  Background.prototype._newCloud = function (layer, x) {
    var gy = this.groundY;
    return {
      layer: layer,
      x: x,
      y: layer ? gy * U.rand(0.1, 0.5) : gy * U.rand(0.06, 0.38),
      s: layer ? U.rand(0.85, 1.25) : U.rand(0.5, 0.8),
      v: (Math.random() * 3) | 0,
      par: layer ? 0.12 : 0.045,
      drift: layer ? U.rand(9, 15) : U.rand(4, 7)
    };
  };

  Background.prototype._fillClouds = function () {
    var W = this.W;
    var want = [Math.ceil(W / 200) + 2, Math.ceil(W / 300) + 2];
    var have = [0, 0];
    for (var i = 0; i < this.clouds.length; i++) have[this.clouds[i].layer]++;
    for (var l = 0; l < 2; l++) {
      for (var k = have[l]; k < want[l]; k++) this.clouds.push(this._newCloud(l, U.rand(-100, W + 100)));
    }
    this.clouds.sort(function (a, b) { return a.layer - b.layer; });
  };

  Background.prototype._initAmbient = function () {
    this.clouds.length = 0;
    this._fillClouds();
    this.motes.length = 0;
    for (var i = 0; i < 26; i++) {
      this.motes.push({
        x: Math.random() * this.W,
        y: this.groundY * U.rand(0.35, 0.95),
        vx: U.rand(-14, -4), vy: U.rand(-6, 6),
        ph: Math.random() * TAU, sp: U.rand(0.6, 1.6), s: U.rand(0.6, 1.2)
      });
    }
  };

  /** Smoothly transitions to palette `i` (or instantly). */
  Background.prototype.setPhase = function (i, instant) {
    i = i % this.palettes.length;
    if (instant) {
      this.from = this.to = i;
      this.blend = 1;
      U.blendPalettes(this.palettes[i], this.palettes[i], 0, this.pal);
      this.version++;
      return;
    }
    if (i === this.to) return;
    // Start from wherever we currently are.
    this.from = this.blend >= 0.5 ? this.to : this.from;
    this.to = i;
    this.blend = 0;
  };

  Background.prototype.update = function (dt, dCam) {
    this.time += dt;
    var W = this.W, gy = this.groundY;

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 3.2);
      U.blendPalettes(this.palettes[this.from], this.palettes[this.to], U.ease.inOutSine(this.blend), this.pal);
      this.version++;
    }

    var i, c;
    for (i = 0; i < this.clouds.length; i++) {
      c = this.clouds[i];
      c.x -= c.drift * dt + dCam * c.par;
      var cw = this.sprites.CLOUD_SHAPES[c.v].w * c.s;
      if (c.x + cw < -20) {
        var nc = this._newCloud(c.layer, W + U.rand(20, 220));
        c.x = nc.x; c.y = nc.y; c.s = nc.s; c.v = nc.v; c.drift = nc.drift;
      }
    }

    for (i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      m.x += (m.vx + Math.sin(this.time * m.sp + m.ph) * 10) * dt - dCam * 0.5;
      m.y += (m.vy + Math.cos(this.time * m.sp * 1.3 + m.ph) * 8) * dt;
      if (m.x < -20) { m.x = W + 20; m.y = gy * U.rand(0.35, 0.95); }
      if (m.x > W + 20) m.x = -20;
      if (m.y < gy * 0.25) m.vy = Math.abs(m.vy);
      if (m.y > gy - 10) m.vy = -Math.abs(m.vy);
    }

    // Distant flocks
    this.flockTimer -= dt;
    if (this.flockTimer <= 0) {
      this.flockTimer = U.rand(8, 15);
      if (this.pal.flockA > 0.05 && this.flocks.length < 2) {
        var dir = Math.random() < 0.7 ? 1 : -1, n = U.randInt(3, 6), birds = [];
        for (var b = 0; b < n; b++) birds.push({ dx: -b * U.rand(10, 16), dy: (b % 2 ? 1 : -1) * Math.ceil(b / 2) * U.rand(5, 8), ph: Math.random() * TAU });
        this.flocks.push({ x: dir > 0 ? -40 : W + 100, y: gy * U.rand(0.15, 0.42), dir: dir, sp: U.rand(26, 40), s: U.rand(0.7, 1.1), birds: birds });
      }
    }
    for (i = this.flocks.length - 1; i >= 0; i--) {
      var f = this.flocks[i];
      f.x += f.dir * f.sp * dt - dCam * 0.08;
      f.y += Math.sin(this.time * 0.8 + i) * 4 * dt;
      if (f.x < -200 || f.x > W + 200) this.flocks.splice(i, 1);
    }
  };

  Background.prototype._drawProfile = function (ctx, prof, scroll, baseY, bottom, top, colTop, colBot) {
    var W = this.W, step = prof.step, n = prof.n;
    var off = ((scroll % prof.period) + prof.period) % prof.period;
    var start = Math.floor(off / step), frac = off - start * step;
    var g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, colTop);
    g.addColorStop(1, colBot);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-frac - 20, bottom);
    for (var i = 0, x = -frac - step; x <= W + step * 2; i++, x += step) {
      ctx.lineTo(x, baseY - prof.h[(start - 1 + i + n) % n]);
    }
    ctx.lineTo(W + step * 2, bottom);
    ctx.closePath();
    ctx.fill();
  };

  /** Everything behind the pipes. */
  Background.prototype.draw = function (ctx, cam) {
    var W = this.W, gy = this.groundY, p = this.pal, t = this.time, i;

    // Sky
    var key = this.version + ':' + gy;
    if (key !== this._skyKey) {
      var sg = ctx.createLinearGradient(0, 0, 0, gy);
      sg.addColorStop(0, p.skyTop);
      sg.addColorStop(0.55, p.skyMid);
      sg.addColorStop(1, p.skyBot);
      this._skyGrad = sg;
      this._skyKey = key;
    }
    ctx.fillStyle = this._skyGrad;
    ctx.fillRect(-20, -20, W + 40, gy + 40);

    // Stars
    if (p.stars > 0.01) {
      ctx.fillStyle = '#ffffff';
      for (i = 0; i < this.stars.length; i++) {
        var st = this.stars[i];
        ctx.globalAlpha = p.stars * (0.55 + 0.45 * Math.sin(t * st.sp + st.ph));
        ctx.fillRect(st.x * W, st.y * gy, st.s, st.s);
      }
      ctx.globalAlpha = 1;
    }

    // Sun / moon
    var sx = p.sunX * W, sy = p.sunY * gy, sr = p.sunR;
    var glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4.2);
    glow.addColorStop(0, U.rgba(p.c.sunGlow, p.sunGlowA));
    glow.addColorStop(1, U.rgba(p.c.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sx - sr * 4.2, sy - sr * 4.2, sr * 8.4, sr * 8.4);
    ctx.fillStyle = U.rgba(p.c.sunCore, 0.35);
    ctx.beginPath();
    ctx.arc(sx, sy, sr * 1.18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.sunCore;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
    if (p.moon > 0.02) {
      ctx.fillStyle = 'rgba(150,160,210,' + (0.35 * p.moon).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx - sr * 0.3, sy - sr * 0.2, sr * 0.22, 0, TAU);
      ctx.arc(sx + sr * 0.35, sy + sr * 0.3, sr * 0.16, 0, TAU);
      ctx.arc(sx + sr * 0.15, sy - sr * 0.45, sr * 0.1, 0, TAU);
      ctx.fill();
    }

    // Clouds — far layer
    this._drawClouds(ctx, 0);

    // Far mountains + haze
    this._drawProfile(ctx, this.far, cam * 0.06, gy - 62, gy, gy - 200, p.mtnFarTop, p.mtnFarBot);
    var hz = ctx.createLinearGradient(0, gy - 150, 0, gy);
    hz.addColorStop(0, U.rgba(p.c.haze, 0));
    hz.addColorStop(1, U.rgba(p.c.haze, p.hazeA));
    ctx.fillStyle = hz;
    ctx.fillRect(-20, gy - 150, W + 40, 150);

    // Flocks
    if (this.flocks.length && p.flockA > 0.01) {
      ctx.strokeStyle = U.rgba(p.c.flock, p.flockA);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = 0; i < this.flocks.length; i++) {
        var f = this.flocks[i];
        for (var b = 0; b < f.birds.length; b++) {
          var fb = f.birds[b];
          var bx = f.x + fb.dx * f.dir, by = f.y + fb.dy;
          var w = Math.sin(t * 9 + fb.ph) * 3 * f.s, span = 5.5 * f.s;
          ctx.moveTo(bx - span, by - w);
          ctx.quadraticCurveTo(bx - span * 0.4, by - w * 0.2 - 1, bx, by);
          ctx.quadraticCurveTo(bx + span * 0.4, by - w * 0.2 - 1, bx + span, by - w);
        }
      }
      ctx.stroke();
    }

    // Near mountains
    this._drawProfile(ctx, this.near, cam * 0.14, gy - 34, gy, gy - 120, p.mtnNearTop, p.mtnNearBot);

    // Clouds — near layer
    this._drawClouds(ctx, 1);

    var hz2 = ctx.createLinearGradient(0, gy - 70, 0, gy);
    hz2.addColorStop(0, U.rgba(p.c.haze, 0));
    hz2.addColorStop(1, U.rgba(p.c.haze, p.hazeA * 0.6));
    ctx.fillStyle = hz2;
    ctx.fillRect(-20, gy - 70, W + 40, 70);

    // Tree-covered hills
    var hs = cam * 0.32;
    var hillBase = gy - 18;
    this._drawTrees(ctx, hs, hillBase, p.treeDark, 0, 1);
    this._drawProfile(ctx, this.hills, hs, hillBase, gy + 2, gy - 50, p.hillTop, p.hillBot);
    this._drawTrees(ctx, hs, hillBase, p.treeLight, 1, 0.55);

    // Pollen (day) / fireflies (night)
    this._drawMotes(ctx);
  };

  Background.prototype._drawClouds = function (ctx, layer) {
    var p = this.pal, sp = this.sprites;
    var A = p.cloudA * (layer ? 1 : 0.8);
    var from = sp.clouds[this.from], to = sp.clouds[this.to];
    var bt = this.blend >= 1 ? 1 : U.ease.inOutSine(this.blend);
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      if (c.layer !== layer) continue;
      var img = to[c.v], w = img.lw * c.s, h = img.lh * c.s;
      if (c.x > this.W + 10 || c.x + w < -10) continue;
      if (bt < 1 && from !== to) {
        ctx.globalAlpha = A * (1 - bt);
        ctx.drawImage(from[c.v], c.x, c.y, w, h);
      }
      ctx.globalAlpha = A * (bt < 1 && from !== to ? bt : 1);
      ctx.drawImage(img, c.x, c.y, w, h);
    }
    ctx.globalAlpha = 1;
  };

  Background.prototype._drawTrees = function (ctx, scroll, baseY, color, highlight, scale) {
    var W = this.W, P = this.hills.period;
    var off = ((scroll % P) + P) % P;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var rep = 0; rep < 3; rep++) {
      var base = rep * P - off;
      if (base > W + 40) break;
      for (var i = 0; i < this.trees.length; i++) {
        var tr = this.trees[i];
        var x = base + tr.x;
        if (x < -30 || x > W + 30) continue;
        var hy = baseY - sampleProfile(this.hills, x + off);
        var r = tr.r * scale;
        var cx = x + tr.dx - (highlight ? tr.r * 0.22 : 0);
        var cy = hy - tr.r * 0.55 - (highlight ? tr.r * 0.28 : 0);
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, TAU);
        if (!highlight) {
          ctx.moveTo(cx + r * 0.7 + 4, cy + r * 0.35);
          ctx.arc(cx + 4, cy + r * 0.35, r * 0.7, 0, TAU);
        }
      }
    }
    ctx.fill();
  };

  Background.prototype._drawMotes = function (ctx) {
    var p = this.pal, sp = this.sprites, t = this.time;
    var kinds = [[sp.pollen, p.pollenA, 0.8], [sp.firefly, p.fireflyA, 1]];
    for (var k = 0; k < 2; k++) {
      var img = kinds[k][0], A = kinds[k][1];
      if (A < 0.01) continue;
      for (var i = 0; i < this.motes.length; i++) {
        var m = this.motes[i];
        var tw = k ? Math.max(0, Math.sin(t * m.sp * 2.2 + m.ph)) : 0.6 + 0.4 * Math.sin(t * m.sp + m.ph);
        var a = A * tw;
        if (a < 0.02) continue;
        var s = img.lw * m.s * kinds[k][2];
        ctx.globalAlpha = a;
        ctx.drawImage(img, m.x - s / 2, m.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  };

  /** The scrolling ground strip in front of the pipes. */
  Background.prototype.drawGround = function (ctx, cam, pr) {
    var gy = this.groundY, sp = this.sprites;
    var from = sp.ground[this.from], to = sp.ground[this.to];
    var bt = this.blend >= 1 ? 1 : U.ease.inOutSine(this.blend);
    var y = gy - sp.LIP;

    // Fill below the screen edge too (covers screen shake)
    ctx.fillStyle = this.pal.dirtBot;
    ctx.fillRect(-20, gy + 20, this.W + 40, this.H - gy + 20);

    if (bt < 1 && from !== to) {
      this._groundTiles(ctx, from, cam, y, pr, 1);
      this._groundTiles(ctx, to, cam, y, pr, bt);
    } else {
      this._groundTiles(ctx, to, cam, y, pr, 1);
    }
  };

  Background.prototype._groundTiles = function (ctx, img, cam, y, pr, alpha) {
    var tw = img.lw, th = img.lh, W = this.W;
    var devW = img.width;
    var off = ((cam % tw) + tw) % tw;
    var x0 = Math.round(-off * pr) / pr - tw;
    ctx.globalAlpha = alpha;
    for (var k = 0, x = x0; x < W + 20; k++, x = x0 + (k * devW) / pr) {
      ctx.drawImage(img, x, y, tw, th);
    }
    ctx.globalAlpha = 1;
  };

  S.Background = Background;
})(window.Skypip = window.Skypip || {});
