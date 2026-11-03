// 动画：落子弹跳、消除闪白和缩小、粒子、震屏、飘字、飞回托盘。
(function () {
  'use strict';

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  class Animator {
    constructor() {
      this.cfg = BG.Config.anim;
      this.pops = [];
      this.ghosts = [];
      this.particles = [];
      this.floats = [];
      this.comboFx = null;
      this.shakeT = 0;
      this.flybacks = [];
      this.relicFlashes = {};
      this.stamps = [];
    }

    // 大号印章：先放大再淡出，不挡操作
    stamp(text, name, x, y) {
      this.stamps.push({ text: text, name: name, x: x, y: y, t: 0 });
    }

    pop(cells) {
      cells.forEach(function (c) {
        this.pops.push({ r: c.r, c: c.c, t: 0 });
      }, this);
    }

    popScale(r, c) {
      for (let i = 0; i < this.pops.length; i++) {
        const p = this.pops[i];
        if (p.r === r && p.c === c) {
          const k = p.t / this.cfg.placePop;
          return k < 0.4 ? lerp(0.84, 1.1, k / 0.4) : lerp(1.1, 1, (k - 0.4) / 0.6);
        }
      }
      return 1;
    }

    // 被消的格子：从消除中心往外依次闪白、缩小，同时迸发粒子
    clear(removed, board) {
      if (removed.length === 0) return;
      let sumR = 0;
      let sumC = 0;
      removed.forEach(function (p) { sumR += p.r; sumC += p.c; });
      const cr = sumR / removed.length;
      const cc = sumC / removed.length;
      removed.forEach(function (p) {
        const dist = Math.abs(p.r - cr) + Math.abs(p.c - cc);
        this.ghosts.push({ r: p.r, c: p.c, color: p.color, t: -dist * this.cfg.clearStagger });
        const x = board.x + (p.c + 0.5) * board.cell;
        const y = board.y + (p.r + 0.5) * board.cell;
        for (let i = 0; i < this.cfg.particlesPerCell; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 40 + Math.random() * 110;
          this.particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 40,
            size: 3 + Math.random() * 4,
            color: BG.Theme.pieces[p.color].base,
            t: 0
          });
        }
      }, this);
    }

    shake() {
      this.shakeT = this.cfg.shakeTime;
    }

    shakeOffset() {
      if (this.shakeT <= 0) return { x: 0, y: 0 };
      const amp = this.cfg.shakeAmp * (this.shakeT / this.cfg.shakeTime);
      return { x: (Math.random() * 2 - 1) * amp, y: (Math.random() * 2 - 1) * amp };
    }

    float(text, x, y, opts) {
      const o = opts || {};
      this.floats.push({
        text: text, x: x, y: y, t: 0,
        size: o.size || 24,
        color: o.color || BG.Theme.text,
        life: o.life || this.cfg.floatLife,
        rise: o.rise === undefined ? 56 : o.rise
      });
    }

    combo(n) {
      this.comboFx = { n: n, t: 0 };
    }

    flyBack(pieceInfo, from, to) {
      this.flybacks.push({ piece: pieceInfo, from: from, to: to, t: 0 });
    }

    flashRelic(id) {
      this.relicFlashes[id] = 0;
    }

    // 返回图标当前的放大倍数和闪光强度
    relicFlash(id) {
      const t = this.relicFlashes[id];
      if (t === undefined) return { scale: 1, flash: 0 };
      const wave = Math.sin(Math.PI * t / this.cfg.relicFlash);
      return { scale: 1 + this.cfg.relicFlashScale * wave, flash: 0.4 * wave };
    }

    update(dt) {
      const cfg = this.cfg;
      Object.keys(this.relicFlashes).forEach(function (id) {
        this.relicFlashes[id] += dt;
        if (this.relicFlashes[id] >= cfg.relicFlash) delete this.relicFlashes[id];
      }, this);
      const step = function (list, life) {
        for (let i = list.length - 1; i >= 0; i--) {
          list[i].t += dt;
          if (list[i].t >= life) list.splice(i, 1);
        }
      };
      step(this.pops, cfg.placePop);
      step(this.ghosts, cfg.clearFlash + cfg.clearShrink);
      for (let i = this.floats.length - 1; i >= 0; i--) {
        this.floats[i].t += dt;
        if (this.floats[i].t >= this.floats[i].life) this.floats.splice(i, 1);
      }
      step(this.stamps, cfg.stampLife);
      step(this.flybacks, cfg.flyBack);
      const sec = dt / 1000;
      this.particles.forEach(function (p) {
        p.x += p.vx * sec;
        p.y += p.vy * sec;
        p.vy += 420 * sec;
      });
      step(this.particles, cfg.particleLife);
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.comboFx) {
        this.comboFx.t += dt;
        if (this.comboFx.t >= cfg.comboLife) this.comboFx = null;
      }
    }

    drawGhosts(ctx, board) {
      const cfg = this.cfg;
      this.ghosts.forEach(function (g) {
        const x = board.x + g.c * board.cell;
        const y = board.y + g.r * board.cell;
        if (g.t < 0) {
          BG.Draw.tile(ctx, x, y, board.cell, g.color);
        } else if (g.t < cfg.clearFlash) {
          BG.Draw.tile(ctx, x, y, board.cell, g.color, { flash: 0.5 + 0.5 * g.t / cfg.clearFlash });
        } else {
          const k = (g.t - cfg.clearFlash) / cfg.clearShrink;
          BG.Draw.tile(ctx, x, y, board.cell, g.color, { scale: 1 - easeOut(k), flash: 1 - k });
        }
      });
    }

    drawParticles(ctx) {
      const life = this.cfg.particleLife;
      this.particles.forEach(function (p) {
        ctx.save();
        ctx.globalAlpha = 1 - p.t / life;
        BG.Draw.fillRound(ctx, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, 1.5, p.color);
        ctx.restore();
      });
    }

    drawFlybacks(ctx) {
      const life = this.cfg.flyBack;
      this.flybacks.forEach(function (f) {
        const k = easeOut(f.t / life);
        BG.Draw.piece(ctx, f.piece.shape, f.piece.color,
          lerp(f.from.x, f.to.x, k), lerp(f.from.y, f.to.y, k), lerp(f.from.cell, f.to.cell, k));
      });
    }

    isFlying(pieceInfo) {
      return this.flybacks.some(function (f) { return f.piece === pieceInfo; });
    }

    drawStamps(ctx) {
      const cfg = this.cfg;
      this.stamps.forEach(function (s) {
        const k = s.t / cfg.stampLife;
        const scale = k < 0.2 ? lerp(1.9, 1, easeOut(k / 0.2)) : 1;
        ctx.save();
        ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        ctx.translate(s.x, s.y);
        BG.Draw.fillRound(ctx, -70, -44, 140, 86, 14, 'rgba(11, 14, 19, 0.82)');
        ctx.save();
        ctx.scale(scale, scale);
        BG.Draw.text(ctx, s.text, 0, -10, { size: cfg.stampSize, bold: true, color: BG.Theme.gold, align: 'center' });
        ctx.restore();
        BG.Draw.text(ctx, s.name, 0, 26, { size: 18, bold: true, align: 'center' });
        ctx.restore();
      });
    }

    drawFloats(ctx, screen) {
      const cfg = this.cfg;
      this.floats.forEach(function (f) {
        const k = f.t / f.life;
        ctx.save();
        ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        BG.Draw.text(ctx, f.text, f.x, f.y - easeOut(k) * f.rise, { size: f.size, bold: true, color: f.color, align: 'center' });
        ctx.restore();
      });
      if (this.comboFx) {
        const k = this.comboFx.t / cfg.comboLife;
        const scale = k < 0.18 ? lerp(0.7, 1.15, k / 0.18) : (k < 0.32 ? lerp(1.15, 1, (k - 0.18) / 0.14) : 1);
        ctx.save();
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        ctx.translate(screen.width / 2, screen.height * 0.42);
        ctx.scale(scale, scale);
        BG.Draw.text(ctx, '连击 ×' + this.comboFx.n, 0, 0, { size: 38, bold: true, color: BG.Theme.gold, align: 'center' });
        ctx.restore();
      }
    }
  }

  BG.Animator = Animator;
})();
