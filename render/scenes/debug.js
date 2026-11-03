// 调试面板：URL 加 ?debug=1 时开启
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;
  const Kit = BG.UIKit;

  const PHASES = {
    warmup: '热身', normal: '平常', sprint: '冲刺', trial: '考验', bonus: '奖励', daily: '每日固定', off: '已关闭'
  };

  class DebugScene {
    constructor(game) {
      this.game = game;
      this.ui = new BG.UI();
      this.scroll = new BG.Scroller();
    }

    draw(ctx, screen) {
      const g = this.game;
      const ui = this.ui;
      const self = this;
      ui.begin();
      Kit.dim(ctx, screen);

      const r = Kit.modalRect(screen, 480, screen.height);
      Kit.panel(ctx, r);
      D.text(ctx, '调试面板', r.x + r.w / 2, r.y + 26, { size: 20, bold: true, align: 'center' });

      const view = { x: r.x, y: r.y + 50, w: r.w, h: r.h - 50 - 64 };
      const x = r.x + 12;
      const w = r.w - 24;
      const half = (w - 8) / 2;
      let y = view.y - this.scroll.y;
      const startY = y;

      ctx.save();
      Kit.clipTo(ctx, view);
      ui.clip = view;

      D.text(ctx, '种子 ' + g.seed + '　模式 ' + g.mode, x, y + 12, { size: 16, color: T.textDim });
      y += 26;
      const canvas = BG.Screen.canvas();
      D.text(ctx, 'dpr ' + BG.Screen.dpr + '　画布 ' + canvas.width + '×' + canvas.height, x, y + 12, { size: 16, color: T.textDim });
      y += 26;
      const deal = g.currentDeal;
      D.text(ctx, '阶段 ' + (PHASES[deal.phase] || deal.phase) + '　本组难度 ' + deal.difficulty + '　能放 ' + deal.fits + ' 块', x, y + 12, { size: 16 });
      y += 32;

      const dynamicOn = g.director.dynamic;
      ui.button(ctx, 'dynamic', x, y, w, 46, g.fixedSequence ? '每日挑战不用动态发牌' : '动态发牌：' + (dynamicOn ? '开' : '关'), {
        size: 16, style: dynamicOn ? 'primary' : 'secondary', disabled: g.fixedSequence,
        onTap: function () { self._toggleDynamic(); }
      });
      y += 54;

      ui.button(ctx, 'tier', x, y, half, 46, '跳到下一阶梯', {
        size: 16, disabled: !g.relicMode,
        onTap: function () { g.debugNextTier(); BG.App.pop(); }
      });
      ui.button(ctx, 'fail', x + half + 8, y, half, 46, '强制进入失败', {
        size: 16, style: 'danger',
        onTap: function () { g.debugFail(); BG.App.pop(); }
      });
      y += 54;

      const adsOn = BG.Ads.countdownEnabled();
      ui.button(ctx, 'ads', x, y, w, 46, '模拟广告倒计时：' + (adsOn ? '开' : '关'), {
        size: 16, style: adsOn ? 'primary' : 'secondary',
        onTap: function () { BG.Ads.setCountdownEnabled(!adsOn); }
      });
      y += 58;

      D.text(ctx, '直接获得遗物', x, y + 10, { size: 16, color: T.textDim });
      y += 28;
      BG.Relics.list.forEach(function (relic, i) {
        const bx = x + (i % 2) * (half + 8);
        const owned = g.has(relic.id);
        ui.button(ctx, 'grant' + relic.id, bx, y, half, 46, relic.name, {
          size: 16, disabled: owned,
          onTap: function () { g.debugGrant(relic.id); }
        });
        if (i % 2 === 1) y += 54;
      });
      y += 6;

      D.text(ctx, '当前方块权重', x, y + 10, { size: 16, color: T.textDim });
      y += 28;
      const weights = g.currentWeights();
      BG.Shapes.list.forEach(function (shape, i) {
        const bx = x + (i % 2) * (half + 8);
        D.text(ctx, shape.id + '：' + weights[shape.id].toFixed(2), bx, y + 11, { size: 16 });
        if (i % 2 === 1) y += 24;
      });
      y += 34;

      ctx.restore();
      ui.clip = null;
      this.scroll.setContent(y - startY, view.h);

      ui.button(ctx, 'close', r.x + 12, r.y + r.h - 56, r.w - 24, 46, '关闭', {
        style: 'primary',
        onTap: function () { BG.App.pop(); }
      });
    }

    // 从下一组牌开始生效，之后新开的局也保持这个设置
    _toggleDynamic() {
      const next = !this.game.director.dynamic;
      this.game.director.setDynamic(next);
      BG.App.dynamicDeal = next;
    }

    back() {
      BG.App.pop();
    }

    down(x, y) {
      this.ui.down(x, y);
      this.scroll.start(y);
    }

    move(x, y) {
      this.scroll.drag(y);
      if (this.scroll.moved > 8) this.ui.cancel();
    }

    up(x, y) {
      this.scroll.end();
      this.ui.up(x, y);
    }
  }

  BG.DebugScene = DebugScene;
})();
