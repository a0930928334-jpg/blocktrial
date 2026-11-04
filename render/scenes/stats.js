// 统计页：按版本筛选、平均值、复制 JSON、清空旧版本
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;
  const Kit = BG.UIKit;

  const MODES = { classic: '经典', relic: '遗物', daily: '每日' };
  const REASONS = { stuck: '卡死', abandon: '放弃' };

  class StatsScene {
    constructor() {
      this.ui = new BG.UI();
      this.scroll = new BG.Scroller();
      this.all = BG.App.loadRecords();
      this.scope = 'current';   // current 当前版本，all 全部版本
      this.confirming = false;
      this.listView = null;
      this.note = '';
    }

    // 当前切换选中的范围，统计、列表、复制都只用它
    _records() {
      return this.scope === 'current' ? BG.Stats.filterByVersion(this.all, BG.Version.name) : this.all;
    }

    _setScope(scope) {
      this.scope = scope;
      this.scroll.y = 0;
      this.note = '';
    }

    _copy(compact) {
      const self = this;
      const records = this._records();
      const text = compact
        ? BG.Stats.exportCompact(records, BG.Config.stats, BG.Wallet.dailySummary())
        : JSON.stringify({ games: records, daily: BG.Wallet.dailySummary() });
      const games = compact ? Math.min(records.length, BG.Config.stats.compactGames) : records.length;
      BG.Clipboard.copy(text).then(function (ok) {
        self.note = ok ? '已复制 ' + games + ' 局，' + text.length + ' 字符' : '未能自动复制';
      });
    }

    _clearOld() {
      const kept = BG.Stats.removeOldVersions(this.all, BG.Version.name);
      const removed = this.all.length - kept.length;
      this.all = kept;
      BG.App.saveRecords(kept);
      this.confirming = false;
      this.scroll.y = 0;
      this.note = '已删除 ' + removed + ' 局旧版本记录';
    }

    _drawTabs(ctx, x, y, w) {
      const self = this;
      const half = (w - 8) / 2;
      const current = BG.Stats.filterByVersion(this.all, BG.Version.name).length;
      this.ui.button(ctx, 'scopeCurrent', x, y, half, 44, '当前版本（' + current + '）', {
        size: 16, style: this.scope === 'current' ? 'primary' : 'secondary',
        onTap: function () { self._setScope('current'); }
      });
      this.ui.button(ctx, 'scopeAll', x + half + 8, y, half, 44, '全部版本（' + this.all.length + '）', {
        size: 16, style: this.scope === 'all' ? 'primary' : 'secondary',
        onTap: function () { self._setScope('all'); }
      });
    }

    _drawSummary(ctx, x, y, w, recent) {
      const avg = BG.Stats.summarize(recent);
      D.fillRound(ctx, x, y, w, 76, 12, T.panel);
      D.text(ctx, '最近 ' + avg.count + ' 局平均', x + 12, y + 16, { size: 16, color: T.textDim });
      D.text(ctx, '分数 ' + Math.round(avg.score) + '　用时 ' + D.timeText(avg.durationMs), x + 12, y + 39, { size: 16 });
      D.text(ctx, '放置 ' + Math.round(avg.placements) + '　消线 ' + Math.round(avg.linesCleared) + '　连击 ' + avg.maxCombo.toFixed(1), x + 12, y + 60, { size: 16 });
    }

    // 列表单独裁剪在 view 里，滚动时不会碰到上面的汇总卡片
    _drawList(ctx, view, recent) {
      const self = this;
      const rowH = 60;
      this.scroll.setContent(recent.length * rowH, view.h);
      ctx.save();
      Kit.clipTo(ctx, view);
      if (recent.length === 0) {
        D.text(ctx, this.scope === 'current' ? '当前版本还没有记录' : '还没有记录，先玩一局吧', view.x + view.w / 2, view.y + 40, {
          size: 16, color: T.textDim, align: 'center'
        });
      }
      recent.forEach(function (rec, i) {
        const ry = view.y + i * rowH - self.scroll.y;
        if (ry + rowH < view.y || ry > view.y + view.h) return;
        self._drawRow(ctx, rec, view.x, ry, view.w, rowH - 4);
      });
      ctx.restore();
    }

    _drawRow(ctx, rec, x, y, w, h) {
      D.fillRound(ctx, x, y, w, h, 10, T.panel);
      D.text(ctx, MODES[rec.mode] + '　' + rec.score + ' 分', x + 12, y + 17, { size: 16, bold: true });
      const reason = REASONS[rec.endReason] || '';
      D.text(ctx, reason + '　' + D.timeText(rec.durationMs), x + w - 12, y + 17, { size: 16, color: T.textDim, align: 'right' });
      D.text(ctx, '放置' + rec.placements + ' 消线' + rec.linesCleared + ' 连击' + rec.maxCombo + ' 阶梯' + rec.tierReached, x + 12, y + 40, { size: 16, color: T.textDim });
      D.text(ctx, rec.version ? 'v' + rec.version : '版本未知', x + w - 12, y + 40, { size: 16, color: T.textDim, align: 'right' });
    }

    _drawConfirm(ctx, screen, oldCount) {
      const self = this;
      Kit.dim(ctx, screen);
      const r = Kit.modalRect(screen, 340, 190);
      Kit.panel(ctx, r);
      D.text(ctx, '清空旧版本数据？', r.x + r.w / 2, r.y + 34, { size: 20, bold: true, align: 'center' });
      D.text(ctx, '将删除 ' + oldCount + ' 局，当前版本 v' + BG.Version.name, r.x + r.w / 2, r.y + 68, { size: 16, color: T.textDim, align: 'center' });
      D.text(ctx, '当前版本的记录保留，删除后不能恢复', r.x + r.w / 2, r.y + 92, { size: 16, color: T.textDim, align: 'center' });
      const half = (r.w - 36) / 2;
      this.ui.button(ctx, 'confirmNo', r.x + 12, r.y + r.h - 62, half, 50, '取消', {
        onTap: function () { self.confirming = false; }
      });
      this.ui.button(ctx, 'confirmYes', r.x + 24 + half, r.y + r.h - 62, half, 50, '确认删除', {
        style: 'danger',
        onTap: function () { self._clearOld(); }
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
      const records = this._records();
      const recent = records.slice(0, BG.Config.stats.showRecent);
      const oldCount = this.all.length - BG.Stats.filterByVersion(this.all, BG.Version.name).length;

      const buttonsH = 46;
      const footH = buttonsH * 2 + 8;
      const noteH = 26;
      const tabsY = top + 40;
      const summaryY = tabsY + 52;
      const view = { x: x, y: summaryY + 84, w: w, h: bottom - footH - noteH - (summaryY + 84) };
      this.listView = view;

      // 先画列表再画顶部，列表怎么滚都压不到汇总卡片
      this._drawList(ctx, view, recent);
      D.text(ctx, '统计', x + w / 2, top + 20, { size: 22, bold: true, align: 'center' });
      this._drawTabs(ctx, x, tabsY, w);
      this._drawSummary(ctx, x, summaryY, w, recent);

      const by = bottom - footH;
      if (this.note) {
        D.text(ctx, this.note, x + w / 2, by - 13, { size: 16, color: T.accent, align: 'center' });
      }
      const half = (w - 8) / 2;
      ui.button(ctx, 'copy', x, by, half, buttonsH, '复制精简版', {
        style: 'primary', size: 16, disabled: records.length === 0,
        onTap: function () { self._copy(true); }
      });
      ui.button(ctx, 'copyFull', x + half + 8, by, half, buttonsH, '复制完整版', {
        size: 16, disabled: records.length === 0,
        onTap: function () { self._copy(false); }
      });
      const by2 = by + buttonsH + 8;
      ui.button(ctx, 'clearOld', x, by2, half, buttonsH, '清空旧版本数据', {
        size: 16, style: 'danger', disabled: oldCount === 0,
        onTap: function () { self.confirming = true; }
      });
      ui.button(ctx, 'back', x + half + 8, by2, half, buttonsH, '返回', {
        size: 16,
        onTap: function () { BG.App.pop(); }
      });

      // 确认框打开时，只有它的两个按钮能点
      if (this.confirming) {
        ui.begin();
        this._drawConfirm(ctx, screen, oldCount);
      }
    }

    back() {
      if (this.confirming) this.confirming = false;
      else BG.App.pop();
    }

    down(x, y) {
      if (this.ui.down(x, y) || this.confirming) return;
      // 只有按在列表里才滚动
      if (this.listView && Kit.inside(this.listView, x, y)) this.scroll.start(y);
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
