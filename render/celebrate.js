// 分数台阶和升段的庆祝：彩带从顶部和两侧喷出，顶部弹出横幅。不暂停游戏，不接管输入。
// 彩带画在棋盘后面，飘进棋盘范围的只在棋盘上方叠一层很淡的影子，并且消失得更快。
(function () {
  'use strict';

  function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function inside(r, x, y) {
    return x >= r.x && x <= r.x + r.size && y >= r.y && y <= r.y + r.size;
  }

  class Celebration {
    constructor(cfg) {
      this.cfg = cfg;
      this.particles = [];
      this.banner = null;
      this.bursts = [];
    }

    active() {
      return !!this.banner || this.particles.length > 0 || this.bursts.length > 0;
    }

    // opts: { text, level, record, width, height, top, avoid? }。level 越高彩带越多、横幅越大
    fire(opts) {
      const c = this.cfg;
      const level = Math.min(opts.record ? Math.max(opts.level, c.recordLevel) : opts.level, c.maxLevel);
      this.bursts = [];
      for (let i = 0; i < 1 + Math.floor(level / 2); i++) {
        // 后面几批的寿命要扣掉等待时间，所有彩带都在 lifeMs 内消失
        this.bursts.push({ wait: i * c.burstGap, budget: c.lifeMs - i * c.burstGap, level: level, opts: opts });
      }
      this.banner = {
        text: opts.text, t: 0, record: !!opts.record,
        size: c.bannerSize + c.bannerPerLevel * level
      };
    }

    _burst(level, o, budget) {
      const c = this.cfg;
      const colors = c.colors.slice(0, Math.min(c.colors.length, 3 + level));
      const add = function (self, x, y, vx, vy) {
        if (self.particles.length >= c.maxParticles) return;
        self.particles.push({
          x: x, y: y, vx: vx, vy: vy, t: 0,
          life: budget * (0.55 + Math.random() * 0.45),
          w: 4 + Math.random() * 5, h: 7 + Math.random() * 7,
          rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 12,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      };
      const top = c.topCount + c.topPerLevel * level;
      for (let i = 0; i < top; i++) {
        add(this, Math.random() * o.width, o.top - 8, (Math.random() - 0.5) * 70, 30 + Math.random() * 90);
      }
      const side = c.sideCount + c.sidePerLevel * level;
      for (let i = 0; i < side; i++) {
        const left = i % 2 === 0;
        const speed = 60 + Math.random() * 150;
        add(this, left ? -6 : o.width + 6, o.height * (0.12 + Math.random() * 0.76),
          left ? speed : -speed, -40 - Math.random() * 100);
      }
    }

    update(dt, avoid) {
      const c = this.cfg;
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const b = this.bursts[i];
        b.wait -= dt;
        if (b.wait <= 0) {
          this._burst(b.level, b.opts, b.budget);
          this.bursts.splice(i, 1);
        }
      }
      if (this.banner) {
        this.banner.t += dt;
        if (this.banner.t >= c.lifeMs) this.banner = null;
      }
      const sec = dt / 1000;
      const drag = Math.max(0, 1 - c.drag * sec);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vx *= drag;
        p.vy = p.vy * drag + c.gravity * sec;
        p.x += p.vx * sec;
        p.y += p.vy * sec;
        p.rot += p.spin * sec;
        // 飘进棋盘的彩带很快消失
        p.t += avoid && inside(avoid, p.x, p.y) ? dt * c.boardFade : dt;
        if (p.t >= p.life) this.particles.splice(i, 1);
      }
    }

    _alpha(p) {
      const k = p.t / p.life;
      return k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }

    // 这片彩带叠在棋盘上时的透明度，不在棋盘上时不画
    overBoardAlpha(p, avoid) {
      return inside(avoid, p.x, p.y) ? this._alpha(p) * this.cfg.boardAlpha : 0;
    }

    _paint(ctx, p, alpha) {
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.setTransform.apply(ctx, this._base);
    }

    _begin(ctx) {
      const m = ctx.getTransform ? ctx.getTransform() : null;
      const d = BG.Screen.dpr;
      this._base = m ? [m.a, m.b, m.c, m.d, m.e, m.f] : [d, 0, 0, d, 0, 0];
    }

    // 在棋盘之前调用，彩带被棋盘和界面元素盖住
    drawBehind(ctx) {
      ctx.save();
      this._begin(ctx);
      for (let i = 0; i < this.particles.length; i++) {
        this._paint(ctx, this.particles[i], this._alpha(this.particles[i]));
      }
      ctx.restore();
    }

    // 在棋盘之后调用，只叠很淡的一层
    drawOverBoard(ctx, avoid) {
      ctx.save();
      this._begin(ctx);
      for (let i = 0; i < this.particles.length; i++) {
        const a = this.overBoardAlpha(this.particles[i], avoid);
        if (a > 0) this._paint(ctx, this.particles[i], a);
      }
      ctx.restore();
    }

    // 回弹：先冲过头再回到 1
    bannerScale() {
      const b = this.banner;
      if (!b) return 0;
      const c = this.cfg;
      const k = b.t / c.lifeMs;
      if (k < 0.12) return 0.5 + (c.bannerPeak - 0.5) * easeOut(k / 0.12);
      if (k < 0.24) return c.bannerPeak + (1 - c.bannerPeak) * (k - 0.12) / 0.12;
      return 1;
    }

    // area：横幅可用的矩形 { x, y, w, h }，字号直接按目标尺寸算，不会超出这个矩形
    bannerRect(ctx, area) {
      const b = this.banner;
      const T = BG.Theme;
      let size = b.size * this.bannerScale();
      ctx.font = T.font(size, true);
      let textW = ctx.measureText(b.text).width;
      const maxText = area.w - 28;
      if (textW > maxText) {
        size *= maxText / textW;
        textW = maxText;
      }
      size = Math.min(size, area.h - 10);
      ctx.font = T.font(size, true);
      textW = ctx.measureText(b.text).width;
      const w = textW + 28;
      const h = Math.min(area.h, size + 10);
      return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w: w, h: h, size: size };
    }

    drawBanner(ctx, area, glow) {
      const b = this.banner;
      if (!b) return;
      const T = BG.Theme;
      const D = BG.Draw;
      const k = b.t / this.cfg.lifeMs;
      const r = this.bannerRect(ctx, area);
      const color = b.record ? '#ffffff' : T.gold;
      ctx.save();
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      ctx.shadowColor = b.record ? T.gold : (glow || T.gold);
      ctx.shadowBlur = 18;
      D.fillRound(ctx, r.x, r.y, r.w, r.h, r.h / 2, 'rgba(11, 14, 19, 0.88)');
      D.strokeRound(ctx, r.x, r.y, r.w, r.h, r.h / 2, 2, b.record ? T.gold : (glow || T.gold));
      ctx.shadowBlur = 12;
      D.text(ctx, b.text, r.x + r.w / 2, r.y + r.h / 2, { size: r.size, bold: true, color: color, align: 'center' });
      ctx.restore();
    }
  }

  BG.Celebration = Celebration;
})();
