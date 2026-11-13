/* Skypip — procedural art, pre-rendered to offscreen canvases at device
 * resolution. Rebuilt on resize so everything stays crisp. */
(function (S) {
  'use strict';

  var U = S.U, C = S.CONFIG, TAU = U.TAU;
  var INK = '#0e4a52';

  // ---------------------------------------------------------------- bird body
  function drawBirdBody(c) {
    c.lineJoin = 'round';
    c.lineCap = 'round';

    // Tail feathers
    c.fillStyle = '#149085';
    c.strokeStyle = INK;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(-13, -3);
    c.quadraticCurveTo(-25, -14, -31, -8);
    c.quadraticCurveTo(-26, -4, -28, 0);
    c.quadraticCurveTo(-23, 3, -29, 8);
    c.quadraticCurveTo(-20, 11, -12, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-15, -2);
    c.quadraticCurveTo(-21, -6, -26, -6);
    c.moveTo(-15, 3);
    c.quadraticCurveTo(-21, 4, -25, 6);
    c.stroke();

    // Head crest (behind the body)
    c.fillStyle = '#1fb3a6';
    c.strokeStyle = INK;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(-5, -15);
    c.quadraticCurveTo(-10, -27, -1, -28);
    c.quadraticCurveTo(-4, -21, 2, -17);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(1, -16);
    c.quadraticCurveTo(3, -25, 9, -24);
    c.quadraticCurveTo(5, -20, 6, -15);
    c.closePath();
    c.fill();
    c.stroke();

    // Body
    var g = c.createRadialGradient(-6, -9, 2, 0, 0, 25);
    g.addColorStop(0, '#86f3e3');
    g.addColorStop(0.42, '#2fc6b6');
    g.addColorStop(1, '#108680');
    c.beginPath();
    c.ellipse(0, 0, 20, 17.5, 0, 0, TAU);
    c.fillStyle = g;
    c.fill();

    c.save();
    c.clip();
    // Belly
    var bg = c.createLinearGradient(0, -2, 0, 19);
    bg.addColorStop(0, '#fffbf2');
    bg.addColorStop(1, '#ffdca6');
    c.beginPath();
    c.ellipse(5, 9.5, 15.5, 11, -0.18, 0, TAU);
    c.fillStyle = bg;
    c.fill();
    // Soft underside shadow
    c.beginPath();
    c.ellipse(-2, 23, 28, 10, 0, 0, TAU);
    c.fillStyle = 'rgba(8,60,70,0.16)';
    c.fill();
    // Top specular
    c.beginPath();
    c.ellipse(-6, -11, 8.5, 4, -0.35, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fill();
    c.restore();

    c.beginPath();
    c.ellipse(0, 0, 20, 17.5, 0, 0, TAU);
    c.strokeStyle = INK;
    c.lineWidth = 2.4;
    c.stroke();

    // Cheek blush
    c.fillStyle = 'rgba(255,120,145,0.55)';
    c.beginPath();
    c.ellipse(11, 5, 4.4, 2.7, 0, 0, TAU);
    c.fill();

    // Beak
    var bk = c.createLinearGradient(14, -5, 26, 5);
    bk.addColorStop(0, '#ffd866');
    bk.addColorStop(1, '#ff9c1a');
    c.fillStyle = bk;
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(14, -4);
    c.quadraticCurveTo(24, -5.5, 29, 0);
    c.quadraticCurveTo(22, 2.2, 14, 2);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ef8410';
    c.beginPath();
    c.moveTo(14, 2);
    c.quadraticCurveTo(22, 2.2, 26, 3);
    c.quadraticCurveTo(21, 7.5, 14, 6.2);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.ellipse(19, -2.4, 3, 1, -0.1, 0, TAU);
    c.fill();
  }

  // ---------------------------------------------------------------- clouds
  var CLOUD_SHAPES = [
    { w: 180, h: 84, base: [20, 54, 140, 22], puffs: [[44, 54, 24], [74, 38, 31], [110, 40, 28], [138, 54, 21], [92, 58, 24]] },
    { w: 140, h: 70, base: [18, 44, 104, 20], puffs: [[40, 44, 20], [64, 32, 25], [92, 38, 21], [112, 48, 15]] },
    { w: 220, h: 92, base: [22, 60, 176, 24], puffs: [[48, 60, 26], [80, 44, 30], [118, 34, 36], [156, 48, 27], [182, 62, 18], [104, 64, 24]] }
  ];

  function cloudPath(c, sh, dy) {
    c.beginPath();
    var b = sh.base;
    U.roundRectPath(c, b[0], b[1] + dy, b[2], b[3], b[3] / 2);
    for (var i = 0; i < sh.puffs.length; i++) {
      var p = sh.puffs[i];
      c.moveTo(p[0] + p[2], p[1] + dy);
      c.arc(p[0], p[1] + dy, p[2], 0, TAU);
    }
  }

  function drawCloud(c, sh, pal) {
    var tint = pal._rgb.cloudTint, shade = pal._rgb.cloudShade;
    c.fillStyle = U.rgba(shade, 0.85);
    cloudPath(c, sh, 5);
    c.fill();
    var g = c.createLinearGradient(0, 4, 0, sh.h - 6);
    g.addColorStop(0, U.rgbStr(tint));
    g.addColorStop(0.65, U.rgbStr(tint));
    g.addColorStop(1, U.rgbStr([
      U.lerp(tint[0], shade[0], 0.45), U.lerp(tint[1], shade[1], 0.45), U.lerp(tint[2], shade[2], 0.45)
    ]));
    c.fillStyle = g;
    cloudPath(c, sh, 0);
    c.fill();
    // Highlights
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (var i = 1; i < sh.puffs.length - 1; i++) {
      var p = sh.puffs[i];
      c.beginPath();
      c.ellipse(p[0] - p[2] * 0.25, p[1] - p[2] * 0.45, p[2] * 0.45, p[2] * 0.22, -0.3, 0, TAU);
      c.fill();
    }
  }

  // ---------------------------------------------------------------- ground
  var TILE_W = 240;
  var LIP = 14; // grass bumps rise above groundY by up to this much

  function drawGroundTile(c, pal, TW, GT) {
    var R = pal._rgb;
    var top = LIP;
    var rnd = U.seeded(1337);

    // Dirt
    var g = c.createLinearGradient(0, top, 0, GT);
    g.addColorStop(0, U.rgbStr(R.dirtTop));
    g.addColorStop(1, U.rgbStr(R.dirtBot));
    c.fillStyle = g;
    c.fillRect(0, top + 8, TW, GT - top - 8);

    var pebbles = [];
    for (var i = 0; i < 16; i++) {
      pebbles.push([rnd() * TW, top + 36 + rnd() * (GT - top - 46), 2 + rnd() * 3.5, rnd() * 0.6 - 0.3]);
    }
    var tufts = [];
    for (i = 0; i < 7; i++) tufts.push([rnd() * TW, 0.7 + rnd() * 0.6]);
    var flowers = [];
    for (i = 0; i < 4; i++) flowers.push([rnd() * TW, top + 4 + rnd() * 6, (rnd() * 3) | 0]);

    for (var o = -TW; o <= TW; o += TW) {
      c.save();
      c.translate(o, 0);

      // Strata bands
      c.fillStyle = U.rgba(R.dirtLine, 0.28);
      for (var band = 0; band < 2; band++) {
        var by = top + 52 + band * 28;
        c.beginPath();
        c.moveTo(0, by);
        for (var x = 0; x <= TW; x += 8) c.lineTo(x, by + Math.sin((x / TW) * TAU * (2 + band) + band) * 3);
        for (x = TW; x >= 0; x -= 8) c.lineTo(x, by + 5 + Math.sin((x / TW) * TAU * (3 + band) + 1.7) * 2);
        c.closePath();
        c.fill();
      }

      // Pebbles
      for (i = 0; i < pebbles.length; i++) {
        var pb = pebbles[i];
        c.fillStyle = U.rgbStr(R.pebble);
        c.beginPath();
        c.ellipse(pb[0], pb[1], pb[2] * 1.4, pb[2], pb[3], 0, TAU);
        c.fill();
        c.fillStyle = U.rgba(R.pebbleHi, 0.7);
        c.beginPath();
        c.ellipse(pb[0] - pb[2] * 0.35, pb[1] - pb[2] * 0.35, pb[2] * 0.55, pb[2] * 0.35, pb[3], 0, TAU);
        c.fill();
      }

      // Grass body: scalloped top, dripping bottom edge
      var gg = c.createLinearGradient(0, top - 9, 0, top + 30);
      gg.addColorStop(0, U.rgbStr(R.grassTop));
      gg.addColorStop(1, U.rgbStr(R.grassBot));
      c.fillStyle = gg;
      c.beginPath();
      c.moveTo(0, top);
      for (x = 0; x < TW; x += 20) c.quadraticCurveTo(x + 10, top - 9, x + 20, top);
      c.lineTo(TW, top + 20);
      var k = 0;
      for (x = TW; x > 0; x -= 24, k++) c.quadraticCurveTo(x - 12, top + 20 + (k % 2 ? 11 : 5), x - 24, top + 20);
      c.closePath();
      c.fill();

      // Shadow under the grass lip
      c.strokeStyle = U.rgba(R.dirtLine, 0.45);
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(TW, top + 21.5);
      k = 0;
      for (x = TW; x > 0; x -= 24, k++) c.quadraticCurveTo(x - 12, top + 21.5 + (k % 2 ? 11 : 5), x - 24, top + 21.5);
      c.stroke();

      // Highlight + outline on the scallops
      c.strokeStyle = U.rgba(R.grassHi, 0.75);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, top + 3.5);
      for (x = 0; x < TW; x += 20) c.quadraticCurveTo(x + 10, top - 5, x + 20, top + 3.5);
      c.stroke();
      c.strokeStyle = U.rgbStr(R.grassLine);
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(0, top);
      for (x = 0; x < TW; x += 20) c.quadraticCurveTo(x + 10, top - 9, x + 20, top);
      c.stroke();

      // Grass tufts: three pointed, leaning blades each
      for (i = 0; i < tufts.length; i++) {
        var tx = tufts[i][0], ts = tufts[i][1];
        var ty = top - 4;
        var blades = [[-3.2, -6, 8.5], [0, 1, 12], [3.2, 6, 9]];
        for (var bl = 0; bl < 3; bl++) {
          var bx = tx + blades[bl][0] * ts, lean = blades[bl][1] * ts, hgt = blades[bl][2] * ts;
          c.fillStyle = bl === 1 ? U.rgbStr(R.grassTop) : U.rgbStr(R.grassBot);
          c.beginPath();
          c.moveTo(bx - 2.2 * ts, ty + 3);
          c.quadraticCurveTo(bx - 1 * ts + lean * 0.3, ty - hgt * 0.5, bx + lean, ty - hgt);
          c.quadraticCurveTo(bx + 1 * ts + lean * 0.3, ty - hgt * 0.5, bx + 2.2 * ts, ty + 3);
          c.closePath();
          c.fill();
        }
      }

      // Tiny flowers
      var petals = [[255, 255, 255], [255, 170, 190], [255, 226, 120]];
      for (i = 0; i < flowers.length; i++) {
        var f = flowers[i];
        c.fillStyle = U.rgba(petals[f[2]], 0.95);
        for (var pp = 0; pp < 5; pp++) {
          var a = (pp / 5) * TAU;
          c.beginPath();
          c.arc(f[0] + Math.cos(a) * 2.2, f[1] + Math.sin(a) * 2.2, 1.6, 0, TAU);
          c.fill();
        }
        c.fillStyle = '#ffb627';
        c.beginPath();
        c.arc(f[0], f[1], 1.3, 0, TAU);
        c.fill();
      }
      c.restore();
    }
  }

  // ---------------------------------------------------------------- glows
  function drawGlow(c, size, rgb, core) {
    var r = size / 2;
    var g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, U.rgba(core, 1));
    g.addColorStop(0.25, U.rgba(rgb, 0.85));
    g.addColorStop(1, U.rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }

  // ---------------------------------------------------------------- Sprites
  function Sprites() {
    this.pr = 0;
    this.TILE_W = TILE_W;
    this.LIP = LIP;
    this.CLOUD_SHAPES = CLOUD_SHAPES;
  }

  Sprites.prototype.build = function (pr, palettes) {
    this.pr = pr;
    var bs = pr * 1.15; // a bit of headroom for squash & stretch
    this.bird = U.makeCanvas(72, 64, bs, function (c) { c.translate(36, 34); drawBirdBody(c); });

    var cs = pr * 1.3;
    this.clouds = palettes.map(function (p) {
      return CLOUD_SHAPES.map(function (sh) {
        return U.makeCanvas(sh.w, sh.h, cs, function (c) { drawCloud(c, sh, p); });
      });
    });

    var GT = C.GROUND_H + LIP;
    this.ground = palettes.map(function (p) {
      return U.makeCanvas(TILE_W, GT, pr, function (c, w, h) { drawGroundTile(c, p, w, h); }, true);
    });

    this.pollen = U.makeCanvas(14, 14, pr, function (c) { drawGlow(c, 14, [255, 255, 240], [255, 255, 255]); });
    this.firefly = U.makeCanvas(30, 30, pr, function (c) { drawGlow(c, 30, [190, 255, 120], [255, 255, 210]); });
  };

  S.Sprites = Sprites;
  S.BIRD_INK = INK;
})(window.Skypip = window.Skypip || {});
