/* Skypip — bootstrap: wires store, audio, game, UI and input together. */
(function (S) {
  'use strict';

  function boot() {
    var store = new S.Store();
    var audio = new S.AudioEngine(store);
    var canvas = document.getElementById('game');
    var game = new S.Game(canvas, audio, store);
    var confetti = new S.Confetti(document.getElementById('fx'));
    game.frameHooks.push(function (dt) { confetti.frame(dt); });
    var board = new S.Leaderboard(store);
    var ui = new S.UI(game, audio, store, confetti, board);

    new S.Input(canvas, {
      action: function (source) {
        if (ui.anyModal() || ui.fading) return;
        if (game.state === 'over') { if (source === 'key') ui.tryRestart(); }
        else if (game.state === 'menu') { if (source === 'key') ui.play(); }
        else game.action();
      },
      pause: function () { ui.togglePause(); },
      confirm: function () { ui.confirm(); },
      mute: function () { ui.toggleMute(); },
      any: function () { audio.unlock(); }
    });

    var pending = false;
    function onResize() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; game.resize(); });
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    // Never let the bird fall while the player is away.
    document.addEventListener('visibilitychange', function () { if (document.hidden) game.pause(); });
    window.addEventListener('blur', function () { game.pause(); });

    document.documentElement.classList.add('ready');
    S.app = { game: game, ui: ui, audio: audio, store: store, board: board };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.Skypip = window.Skypip || {});
