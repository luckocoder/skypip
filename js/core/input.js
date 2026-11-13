/* Skypip — unified input: pointer (mouse/touch/pen) + keyboard. */
(function (S) {
  'use strict';

  function isButton(el) {
    return el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT');
  }

  /**
   * @param {HTMLElement} surface element that receives "flap" taps (the canvas)
   * @param {object} h handlers: action, pause, confirm, mute, any
   */
  function Input(surface, h) {
    this.h = h;

    surface.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      h.action('pointer');
    }, { passive: false });

    // Unlock audio on the very first gesture anywhere (iOS / autoplay policies).
    var unlock = function () { h.any(); };
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (ev) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    });

    window.addEventListener('keydown', function (e) {
      // Typing in a text field (player name) must never drive the game.
      var t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'text') {
        if (e.code === 'Escape') { t.blur(); h.pause(); }
        return;
      }
      switch (e.code) {
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault();
          if (e.repeat) return;
          if (isButton(document.activeElement)) document.activeElement.blur();
          h.action('key');
          break;
        case 'Escape':
        case 'KeyP':
          e.preventDefault();
          h.pause();
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (isButton(document.activeElement)) return; // let the button click itself
          e.preventDefault();
          h.confirm();
          break;
        case 'KeyM':
          h.mute();
          break;
      }
    });

    window.addEventListener('keyup', function (e) {
      var t = e.target;
      if (e.code === 'Space' && !(t && t.tagName === 'INPUT' && t.type === 'text')) e.preventDefault();
    });

    // No long-press menus / gestures on the game surface.
    document.addEventListener('contextmenu', function (e) {
      if (!isButton(e.target)) e.preventDefault();
    });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  S.Input = Input;
})(window.Skypip = window.Skypip || {});
