// 统计页：最近 N 局、平均值、复制 JSON
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;
  const Kit = BG.UIKit;

  const MODES = { classic: '经典', relic: '遗物', daily: '每日' };
  const REASONS = { clear: '通关', stuck: '失败', abandon: '放弃' };

  class StatsScene {
    constructor() {
      this.ui = new BG.UI();
      this.scroll = new BG.Scroller();
      this.records = BG.App.loadRecords();
      this.note = '';
    }

    _copy(compact) {
      const self = this;
      const text = compact
        ? BG.Stats.exportCompact(this.records, BG.Config.stats)
        : JSON.stringify(this.records);
      const games = compact ? Math.min(this.records.length, BG.Config.stats.compactGames) : this.records.length;
      BG.Clipboard.copy(text).then(function (ok) {
        self.note = ok ? '已复制 ' + games + ' 局，' + text.length + ' 字符' : '未能自动复制';
      });
    }

    draw(ctx, screen) {
      const self = this;
      const ui = this.ui;
      ui.begin();
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, screen.width, screen.height);
      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 24, 520);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;
      const top = safe.top + 8;
      const bottom = screen.height - safe.bottom - 8;

      D.text(ctx, '统计', x + w / 2, top + 20, { size: 22, bold: true, align: 'center' });

      const recent = this.records.slice(0, BG.Config.stats.showRecent);
      const avg = BG.Stats.summarize(recent);
      let y = top + 46;
      D.fillRound(ctx, x, y, w, 76, 12, T.panel);
      D.text(ctx, '最近 ' + avg.count + ' 局平均', x + 12, y + 16, { size: 16, color: T.textDim });
      D.text(ctx, '分数 ' + Math.round(avg.score) + '　用时 ' + D.timeText(avg.durationMs), x + 12, y + 39, { size: 16 });
      D.text(ctx, '放置 ' + Math.round(avg.placements) + '　消线 ' + Math.round(avg.linesCleared) + '　连击 ' + avg.maxCombo.toFixed(1), x + 12, y + 60, { size: 16 });
      y += 84;

      const buttonsH = 52;
      const noteH = 24;
      const view = { x: x, y: y, w: w, h: bottom - y - buttonsH - noteH - 8 };
      const rowH = 56;
      this.scroll.setContent(recent.length * rowH, view.h);

      ctx.save();
      Kit.clipTo(ctx, view);
      if (recent.length === 0) {
        D.text(ctx, '还没有记录，先玩一局吧', x + w / 2, view.y + 40, { size: 16, color: T.textDim, align: 'center' });
      }
      recent.forEach(function (rec, i) {
        const ry = view.y + i * rowH - self.scroll.y;
        if (ry + rowH < view.y || ry > view.y + view.h) return;
        D.fillRound(ctx, x, ry, w, rowH - 4, 10, T.panel);
        D.text(ctx, MODES[rec.mode] + '　' + rec.score + ' 分', x + 12, ry + 15, { size: 16, bold: true });
        const reason = rec.rushSteps !== null && rec.rushSteps !== undefined ? '冲分' : (REASONS[rec.endReason] || '');
        D.text(ctx, reason + '　' + D.timeText(rec.durationMs), x + w - 12, ry + 15, { size: 16, color: T.textDim, align: 'right' });
        D.text(ctx, '放置' + rec.placements + ' 消线' + rec.linesCleared + ' 连击' + rec.maxCombo + ' 阶梯' + rec.tierReached, x + 12, ry + 37, { size: 16, color: T.textDim });
      });
      ctx.restore();

      const by = bottom - buttonsH;
      if (this.note) {
        D.text(ctx, this.note, x + w / 2, by - 13, { size: 16, color: T.accent, align: 'center' });
      }
      const third = (w - 16) / 3;
      ui.button(ctx, 'copy', x, by, third, buttonsH, '复制精简版', {
        style: 'primary', size: 16, disabled: this.records.length === 0,
        onTap: function () { self._copy(true); }
      });
      ui.button(ctx, 'copyFull', x + third + 8, by, third, buttonsH, '复制完整版', {
        size: 16, disabled: this.records.length === 0,
        onTap: function () { self._copy(false); }
      });
      ui.button(ctx, 'back', x + (third + 8) * 2, by, third, buttonsH, '返回', {
        size: 16,
        onTap: function () { BG.App.pop(); }
      });
    }

    back() {
      BG.App.pop();
    }

    down(x, y) {
      if (!this.ui.down(x, y)) this.scroll.start(y);
    }

    move(x, y) {
      this.scroll.drag(y);
    }

    up(x, y) {
      this.scroll.end();
      this.ui.up(x, y);
    }
  }

  BG.StatsScene = StatsScene;
})();
