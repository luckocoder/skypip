/* Skypip — "Pip", the hero bird: physics, animation and rendering. */
(function (S) {
  'use strict';

  var C = S.CONFIG, U = S.U, TAU = U.TAU;

  function Bird() {
    this.r = C.BIRD_RADIUS;
    this.reset(0, 0);
  }

  Bird.prototype.reset = function (x, y) {
    this.x = this.prevX = this.targetX = x;
    this.y = this.prevY = this.baseY = y;
    this.vy = 0;
    this.rot = this.prevRot = 0;
    this.mode = 'idle'; // idle | fly | dead
    this.t = Math.random() * 10;
    this.wingPhase = 0;
    this.wingAngle = 0;
    this.prevWing = 0;
    this.flapKick = 0;
    this.squash = 0;
    this.blink = 0;
    this.blinkTimer = U.rand(1.5, 3.5);
    this.landed = false;
  };

  /** Floats gently around (x, y). The bird glides there smoothly. */
  Bird.prototype.setIdle = function (x, y) {
    this.mode = 'idle';
    this.targetX = x;
    this.baseY = y;
    this.vy = 0;
    this.landed = false;
  };

  Bird.prototype.flap = function () {
    this.mode = 'fly';
    this.vy = C.FLAP_V;
    this.flapKick = 1;
    this.squash = 1;
    this.wingPhase = Math.PI * 0.5; // start from wings-up, sweep down hard
  };

  Bird.prototype.die = function (fromPipe) {
    this.mode = 'dead';
    this.vy = fromPipe ? Math.min(this.vy * 0.3, -240) : 0;
    this.squash = -1;
  };

  Bird.prototype.update = function (dt, groundY) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevRot = this.rot;
    this.prevWing = this.wingAngle;
    this.t += dt;

    // Blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = U.rand(2, 4.5);
    }
    this.blink = Math.max(0, this.blink - dt * 7);

    var wingSpeed = 13;
    var wingCenter = 0.15, wingAmp = 0.72;

    if (this.mode === 'idle') {
      this.x = U.approach(this.x, this.targetX, 5, dt);
      var bob = Math.sin(this.t * 3.3) * 7;
      this.y = U.approach(this.y, this.baseY + bob, 10, dt);
      this.rot = U.approach(this.rot, Math.sin(this.t * 3.3 + 1.2) * 0.07, 8, dt);
      wingSpeed = 14;
    } else if (this.mode === 'fly') {
      this.vy = Math.min(this.vy + C.GRAVITY * dt, C.MAX_FALL);
      this.y += this.vy * dt;
      if (this.y < C.CEILING) { this.y = C.CEILING; if (this.vy < 0) this.vy = 0; }

      var target;
      if (this.vy < 140) target = -0.4;
      else {
        var k = U.clamp((this.vy - 140) / 700, 0, 1);
        target = U.lerp(-0.4, 1.45, k * k);
      }
      this.rot = U.approach(this.rot, target, target < this.rot ? 20 : 5.5, dt);

      if (this.vy > 380) { wingSpeed = 6; wingCenter = 0.55; wingAmp = 0.22; } // gliding down
      else wingSpeed = 15;
    } else { // dead
      if (!this.landed) {
        this.vy = Math.min(this.vy + C.GRAVITY * 1.15 * dt, C.MAX_FALL * 1.2);
        this.y += this.vy * dt;
        this.rot = U.approach(this.rot, Math.PI * 0.5, 7, dt);
        if (this.y + 15 >= groundY) {
          this.y = groundY - 15;
          this.vy = 0;
          this.landed = true;
        }
      }
      wingSpeed = 0;
      wingCenter = -0.25;
      wingAmp = 0;
    }

    // Wings — a flap gives a short, fast power stroke
    this.flapKick = Math.max(0, this.flapKick - dt * 5);
    this.wingPhase += (wingSpeed + this.flapKick * 34) * dt;
    var targetWing = wingCenter + Math.sin(this.wingPhase) * wingAmp;
    this.wingAngle = this.mode === 'dead' ? U.approach(this.wingAngle, targetWing, 6, dt) : targetWing;

    this.squash = U.approach(this.squash, 0, 9, dt);
  };

  Bird.prototype.draw = function (ctx, alpha, sprites) {
    var x = U.lerp(this.prevX, this.x, alpha);
    var y = U.lerp(this.prevY, this.y, alpha);
    var rot = U.lerp(this.prevRot, this.rot, alpha);
    var wing = U.lerp(this.prevWing, this.wingAngle, alpha);
    var INK = S.BIRD_INK;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    var s = this.squash;
    ctx.scale(1 + s * 0.12, 1 - s * 0.12);

    var spr = sprites.bird;
    ctx.drawImage(spr, -36, -34, 72, 64);

    // Eye
    var dead = this.mode === 'dead';
    ctx.lineCap = 'round';
    if (dead) {
      ctx.strokeStyle = '#1b2333';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(5.5, -9.5); ctx.lineTo(12, -3);
      ctx.moveTo(12, -9.5); ctx.lineTo(5.5, -3);
      ctx.stroke();
    } else {
      var open = 1 - Math.sin(Math.min(1, this.blink) * Math.PI) * 0.92;
      ctx.save();
      ctx.translate(9, -6);
      ctx.scale(1, open);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.4, 7, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      var look = this.mode === 'fly' ? U.clamp(this.vy / 900, -0.4, 0.6) * 2 : 0;
      ctx.fillStyle = '#1b2333';
      ctx.beginPath();
      ctx.arc(1.8, 0.4 + look, 3.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(3, -1.3 + look, 1.35, 0, TAU);
      ctx.arc(0.6, 2 + look, 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Wing
    ctx.save();
    ctx.translate(-4, 2);
    ctx.rotate(wing);
    ctx.fillStyle = '#18a99d';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(3, -3);
    ctx.quadraticCurveTo(-8, -11, -20, -5);
    ctx.quadraticCurveTo(-15.5, -1.5, -18.5, 2);
    ctx.quadraticCurveTo(-13, 3, -15.5, 6.5);
    ctx.quadraticCurveTo(-6, 8.5, 3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(-8, -7, -15, -4);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  };

  S.Bird = Bird;
})(window.Skypip = window.Skypip || {});
