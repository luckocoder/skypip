/* Skypip — math, color and canvas helpers. */
(function (S) {
  'use strict';

  var TAU = Math.PI * 2;

  var U = {
    TAU: TAU,

    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    invLerp: function (a, b, v) { return (v - a) / (b - a); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[(Math.random() * arr.length) | 0]; },

    /** Frame-rate independent exponential smoothing toward a target. */
    approach: function (cur, target, rate, dt) {
      return cur + (target - cur) * (1 - Math.exp(-rate * dt));
    },

    ease: {
      outQuad: function (t) { return t * (2 - t); },
      outCubic: function (t) { var u = 1 - t; return 1 - u * u * u; },
      inOutSine: function (t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); },
      outBack: function (t) { var c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
    },

    /** Deterministic PRNG (mulberry32) so procedural scenery is stable. */
    seeded: function (seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    hexToRgb: function (hex) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    rgbStr: function (c) {
      return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    },

    rgba: function (c, a) {
      return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')';
    },

    /** Converts a palette of hex strings into {rgb arrays, numbers}. */
    preparePalette: function (p) {
      var out = { _rgb: {}, _num: {} };
      for (var k in p) {
        if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
        if (typeof p[k] === 'string' && p[k].charAt(0) === '#') out._rgb[k] = U.hexToRgb(p[k]);
        else out._num[k] = p[k];
      }
      return out;
    },

    /** Blends two prepared palettes into `out` (strings + rgb arrays + numbers). */
    blendPalettes: function (a, b, t, out) {
      out = out || {};
      out.c = out.c || {};
      var k, ca, cb, c;
      for (k in a._rgb) {
        ca = a._rgb[k]; cb = b._rgb[k];
        c = out.c[k] || (out.c[k] = [0, 0, 0]);
        c[0] = ca[0] + (cb[0] - ca[0]) * t;
        c[1] = ca[1] + (cb[1] - ca[1]) * t;
        c[2] = ca[2] + (cb[2] - ca[2]) * t;
        out[k] = U.rgbStr(c);
      }
      for (k in a._num) out[k] = a._num[k] + (b._num[k] - a._num[k]) * t;
      return out;
    },

    circleRect: function (cx, cy, r, x, y, w, h) {
      var nx = cx < x ? x : cx > x + w ? x + w : cx;
      var ny = cy < y ? y : cy > y + h ? y + h : cy;
      var dx = cx - nx, dy = cy - ny;
      return dx * dx + dy * dy < r * r;
    },

    roundRectPath: function (ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },

    /** 4-point sparkle path. */
    sparklePath: function (ctx, x, y, r) {
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
    },

    /**
     * Creates an offscreen canvas of logical size w×h rendered at `scale`
     * device pixels per logical unit. lw/lh hold the exact logical size.
     */
    makeCanvas: function (w, h, scale, draw, exact) {
      var cv = document.createElement('canvas');
      var pw = Math.max(1, exact ? Math.round(w * scale) : Math.ceil(w * scale));
      var ph = Math.max(1, Math.ceil(h * scale));
      cv.width = pw;
      cv.height = ph;
      var c = cv.getContext('2d');
      c.scale(pw / w, ph / h);
      draw(c, w, h);
      cv.lw = exact ? pw / scale : w;
      cv.lh = h;
      return cv;
    },

    /** Tiny event emitter. */
    Emitter: (function () {
      function Emitter() { this._ev = {}; }
      Emitter.prototype.on = function (name, fn) {
        (this._ev[name] || (this._ev[name] = [])).push(fn);
        return this;
      };
      Emitter.prototype.emit = function (name) {
        var list = this._ev[name];
        if (!list) return;
        var args = Array.prototype.slice.call(arguments, 1);
        for (var i = 0; i < list.length; i++) list[i].apply(null, args);
      };
      return Emitter;
    })()
  };

  S.U = U;
})(window.Skypip = window.Skypip || {});
