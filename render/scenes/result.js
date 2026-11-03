// 结算页
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const REASONS = { clear: '通关！', stuck: '无处可放', abandon: '已放弃' };

  class ResultScene {
    // info: { isRecord, best }
    constructor(game, info) {
      this.game = game;
      this.info = info;
      this.ui = new BG.UI();
    }

    draw(ctx, screen) {
      const g = this.game;
      const ui = this.ui;
      ui.begin();
      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 32, 420);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;
      const cx = x + w / 2;
      const tiers = BG.Config.relic.tiers.length;

      const relicRows = g.relicMode ? Math.ceil(g.relics.length / 2) : 0;
      const contentH = 40 + 60 + 34 + 34 * (g.relicMode ? 2 : 1) + (g.relicMode ? 34 + relicRows * 44 : 0) + 20 + 56 * 2 + 12;
      const usable = screen.height - safe.top - safe.bottom;
      let y = safe.top + Math.max(10, (usable - contentH) / 2);

      const rushed = g.rushStartStep !== null;
      D.text(ctx, rushed ? '通关，冲分结束' : (REASONS[g.endReason] || '本局结束'), cx, y + 18, {
        size: 24, bold: true, align: 'center', color: g.endReason === 'clear' || rushed ? T.gold : T.text
      });
      y += 40;
      D.text(ctx, String(g.score), cx, y + 30, { size: 52, bold: true, align: 'center' });
      y += 60;
      if (this.info.isRecord) {
        D.text(ctx, '新纪录！', cx, y + 15, { size: 20, bold: true, align: 'center', color: T.gold });
      } else {
        D.text(ctx, '最高分 ' + this.info.best, cx, y + 15, { size: 16, color: T.textDim, align: 'center' });
      }
      y += 34;

      const row = function (label, value) {
        D.text(ctx, label, x + 4, y + 15, { size: 16, color: T.textDim });
        D.text(ctx, value, x + w - 4, y + 15, { size: 18, bold: true, align: 'right' });
        y += 34;
      };
      row('用时', D.timeText(g.elapsedMs));
      if (g.relicMode) {
        row('到达阶梯', g.tierIndex + ' / ' + tiers);
        D.text(ctx, g.relics.length ? '获得的遗物' : '没有获得遗物', x + 4, y + 15, { size: 16, color: T.textDim });
        y += 34;
        const colW = w / 2;
        g.relics.forEach(function (id, i) {
          const cellX = x + (i % 2) * colW;
          const cellY = y + Math.floor(i / 2) * 44;
          D.relicIcon(ctx, id, cellX + 20, cellY + 20, 36);
          D.text(ctx, BG.Relics.byId[id].name, cellX + 44, cellY + 20, { size: 16 });
        });
        y += relicRows * 44;
      }
      y += 16;

      ui.button(ctx, 'again', x, y, w, 56, '再来一局', {
        style: 'primary', size: 20,
        onTap: function () { BG.App.startGame(g.mode); }
      });
      y += 66;
      ui.button(ctx, 'menu', x, y, w, 52, '返回菜单', {
        onTap: function () { BG.App.toMenu(); }
      });
    }

    back() {
      BG.App.toMenu();
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.ResultScene = ResultScene;
})();
