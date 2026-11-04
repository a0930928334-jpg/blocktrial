// 金币飞向目标的小动画。不挡操作，由场景每帧设置起点和终点。
(function () {
  'use strict';

  class CoinFly {
    // opts：{ amount, label 大字, sub 小字（可选） }
    constructor(opts) {
      const c = BG.Config.anim.coinFly;
      this.cfg = c;
      this.amount = opts.amount;
      this.label = opts.label;
      this.sub = opts.sub || null;
      this.time = 0;
      this.count = Math.min(c.maxCoins, Math.max(c.minCoins, opts.amount));
      this.flyEnd = c.stagger * (this.count - 1) + c.flyMs;
      this.total = this.flyEnd + c.holdMs;
      this.from = { x: 0, y: 0 };
      this.to = { x: 0, y: 0 };
    }

    update(dt) {
      this.time += dt;
    }

    active() {
      return this.time < this.total;
    }

    // 已经飞到的比例，0～1
    _arrived() {
      const c = this.cfg;
      let done = 0;
      for (let i = 0; i < this.count; i++) {
        if (this.time >= c.stagger * i + c.flyMs) done++;
      }
      return done / this.count;
    }

    // 还在路上的金币数，余额先减去这部分，数字跟着金币到达慢慢涨
    pending() {
      return Math.round(this.amount * (1 - this._arrived()));
    }

    landed() {
      return this.time >= this.flyEnd;
    }

    draw(ctx) {
      const D = BG.Draw;
      const T = BG.Theme;
      const c = this.cfg;
      if (this.label) {
        // 文字留在起点附近，最后淡出
        const alpha = Math.min(1, (this.total - this.time) / c.fadeMs);
        const hasSub = !!this.sub;
        const w = hasSub ? 168 : 92;
        const h = hasSub ? 66 : 42;
        const x = this.from.x - w / 2;
        const y = this.from.y + c.labelGap;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        D.fillRound(ctx, x, y, w, h, 14, 'rgba(11, 14, 19, 0.96)');
        D.text(ctx, this.label, this.from.x, y + 21, { size: 24, bold: true, align: 'center', color: T.gold });
        if (hasSub) D.text(ctx, this.sub, this.from.x, y + 48, { size: 16, align: 'center' });
        ctx.restore();
      }
      for (let i = 0; i < this.count; i++) {
        const t = (this.time - c.stagger * i) / c.flyMs;
        if (t < 0 || t >= 1) continue;
        const e = t * t * (3 - 2 * t);
        const x = this.from.x + (this.to.x - this.from.x) * e;
        // 带一点弧度
        const y = this.from.y + (this.to.y - this.from.y) * e - c.arc * Math.sin(Math.PI * t);
        D.coinIcon(ctx, x, y, c.size);
      }
    }
  }

  BG.CoinFly = CoinFly;
})();
