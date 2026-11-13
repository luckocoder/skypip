/* Skypip — global configuration, tuning values and art palettes. */
(function (S) {
  'use strict';

  S.CONFIG = {
    // World leaderboard API. Leave empty to use the server the game is loaded
    // from (server.js). Set a full URL (e.g. 'https://your-host.example/api')
    // when the game files are hosted somewhere else.
    LEADERBOARD_API: '',

    // Logical design resolution. The world scales so at least this area is visible.
    BASE_W: 400,
    BASE_H: 720,
    GROUND_H: 104,

    // Fixed simulation step (seconds). Physics is frame-rate independent.
    STEP: 1 / 120,
    MAX_FRAME: 0.25,

    // Bird physics
    GRAVITY: 1950,
    FLAP_V: -575,
    MAX_FALL: 930,
    BIRD_RADIUS: 14.5, // hitbox (visual body is ~20) — slightly forgiving
    CEILING: -40,

    // Pipes
    PIPE_W: 86,
    CAP_W: 98,
    CAP_H: 34,
    PIPE_MARGIN_TOP: 70,
    PIPE_MARGIN_BOTTOM: 60,
    FIRST_PIPE_MAX_LEAD: 600,

    // World speed in non-play states
    MENU_SPEED: 70,
    READY_SPEED: 150,

    // Difficulty ramps from [start, end] as score goes 0 -> RAMP_SCORE
    RAMP_SCORE: 60,
    DIFF: {
      speed: [190, 255],
      gap: [188, 144],
      spacing: [292, 252],
      maxShift: [150, 205]
    },
    MOVING: { startScore: 20, fullScore: 60, maxChance: 0.5, ampMin: 14, ampMax: 38 },

    // Score thresholds where the sky changes (day -> sunset -> night -> dawn ...)
    PHASE_EVERY: 15,
    PHASE_NAMES: ['Day', 'Sunset', 'Night', 'Dawn'],

    MEDALS: [
      { id: 'platinum', name: 'Platinum', min: 50 },
      { id: 'gold', name: 'Gold', min: 30 },
      { id: 'silver', name: 'Silver', min: 20 },
      { id: 'bronze', name: 'Bronze', min: 10 }
    ],

    medalFor: function (score) {
      var m = S.CONFIG.MEDALS;
      for (var i = 0; i < m.length; i++) if (score >= m[i].min) return m[i];
      return null;
    },

    nextMedal: function (score) {
      var m = S.CONFIG.MEDALS;
      for (var i = m.length - 1; i >= 0; i--) if (score < m[i].min) return m[i];
      return null;
    },

    // Art palettes. Every key is blended smoothly during sky transitions.
    PALETTES: [
      { // 0 — Day
        skyTop: '#3fa9e8', skyMid: '#88d4f2', skyBot: '#fde7c4',
        sunX: 0.78, sunY: 0.2, sunR: 34, sunCore: '#fff8dc', sunGlow: '#fff1b0', sunGlowA: 0.55, moon: 0,
        stars: 0,
        cloudTint: '#ffffff', cloudShade: '#cfe3f5', cloudA: 0.95,
        mtnFarTop: '#a9cbe8', mtnFarBot: '#d2e6f3',
        mtnNearTop: '#7fb3d6', mtnNearBot: '#a9d1e6',
        haze: '#fde7c4', hazeA: 0.55,
        hillTop: '#7acb7b', hillBot: '#4fa765', treeDark: '#3d9a5c', treeLight: '#6cc57a',
        grassTop: '#93e262', grassBot: '#5cbf3e', grassLine: '#2f7a2c', grassHi: '#c8f792',
        dirtTop: '#f0c987', dirtBot: '#d69b5a', dirtLine: '#b97b3e', pebble: '#c58b4f', pebbleHi: '#f7dca8',
        pipeDark: '#b8413a', pipeMid: '#ee6352', pipeLight: '#ffb19e', pipeOutline: '#5b1d24', pipeCap: '#e04f43', pipeBand: '#ffd0a8',
        flock: '#3b5a7a', flockA: 0.45,
        pollenA: 0.38, fireflyA: 0
      },
      { // 1 — Sunset
        skyTop: '#4a4f9e', skyMid: '#e9799a', skyBot: '#ffbe76',
        sunX: 0.26, sunY: 0.74, sunR: 48, sunCore: '#fff0c2', sunGlow: '#ffb066', sunGlowA: 0.7, moon: 0,
        stars: 0.15,
        cloudTint: '#ffe2d2', cloudShade: '#e39aa8', cloudA: 0.9,
        mtnFarTop: '#8f72aa', mtnFarBot: '#cc93aa',
        mtnNearTop: '#6c5a92', mtnNearBot: '#a77ea0',
        haze: '#ffb27a', hazeA: 0.5,
        hillTop: '#5f9a6a', hillBot: '#4a7d5a', treeDark: '#3f6f53', treeLight: '#5f9466',
        grassTop: '#7ccf58', grassBot: '#4fa53a', grassLine: '#2b5f2a', grassHi: '#ffe29a',
        dirtTop: '#e5b079', dirtBot: '#bf8150', dirtLine: '#9c6237', pebble: '#b5784a', pebbleHi: '#f7cf9a',
        pipeDark: '#a33a44', pipeMid: '#e05a5e', pipeLight: '#ffb08e', pipeOutline: '#4c1825', pipeCap: '#cc4a52', pipeBand: '#ffc690',
        flock: '#4a2f55', flockA: 0.5,
        pollenA: 0.25, fireflyA: 0
      },
      { // 2 — Night
        skyTop: '#0b1238', skyMid: '#1f2f6b', skyBot: '#43538f',
        sunX: 0.72, sunY: 0.22, sunR: 26, sunCore: '#f3f1ff', sunGlow: '#9fb3ff', sunGlowA: 0.35, moon: 1,
        stars: 1,
        cloudTint: '#8f9bcb', cloudShade: '#56609a', cloudA: 0.55,
        mtnFarTop: '#2c3c74', mtnFarBot: '#36477f',
        mtnNearTop: '#1f2d5e', mtnNearBot: '#2a3a6c',
        haze: '#43538f', hazeA: 0.4,
        hillTop: '#1f4a4e', hillBot: '#173a40', treeDark: '#123236', treeLight: '#1f4a48',
        grassTop: '#3f8f5a', grassBot: '#2c6e47', grassLine: '#123a2a', grassHi: '#6fc08a',
        dirtTop: '#8a6a5a', dirtBot: '#5e4540', dirtLine: '#4a3433', pebble: '#6e5248', pebbleHi: '#a88a78',
        pipeDark: '#6a2a46', pipeMid: '#9a3f5e', pipeLight: '#d7849a', pipeOutline: '#2a0f22', pipeCap: '#8a3756', pipeBand: '#e6a3b8',
        flock: '#0b1238', flockA: 0,
        pollenA: 0, fireflyA: 0.9
      },
      { // 3 — Dawn
        skyTop: '#6d8fd6', skyMid: '#f2a7c3', skyBot: '#ffe0b0',
        sunX: 0.2, sunY: 0.62, sunR: 38, sunCore: '#fffbe8', sunGlow: '#ffd1a1', sunGlowA: 0.6, moon: 0,
        stars: 0.25,
        cloudTint: '#fff0f5', cloudShade: '#d8b5d6', cloudA: 0.9,
        mtnFarTop: '#9e9ccc', mtnFarBot: '#d7bcd6',
        mtnNearTop: '#7f86bf', mtnNearBot: '#b7a6cf',
        haze: '#ffd7b8', hazeA: 0.55,
        hillTop: '#6fbf86', hillBot: '#4e9c6e', treeDark: '#3f8a62', treeLight: '#64b47e',
        grassTop: '#88dc66', grassBot: '#57b843', grassLine: '#2c6e33', grassHi: '#e9ffb0',
        dirtTop: '#eec08f', dirtBot: '#cf9465', dirtLine: '#ad7447', pebble: '#c08355', pebbleHi: '#f8d9b0',
        pipeDark: '#b04450', pipeMid: '#ea6670', pipeLight: '#ffbcb0', pipeOutline: '#56192a', pipeCap: '#d8525c', pipeBand: '#ffd2b8',
        flock: '#5a4a7a', flockA: 0.4,
        pollenA: 0.3, fireflyA: 0.1
      }
    ]
  };
})(window.Skypip = window.Skypip || {});
