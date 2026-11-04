// 结算页
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const REASONS = { stuck: '无处可放', abandon: '已放弃' };

  class ResultScene {
    // info: { isRecord, best, rank, rankUp }
    constructor(game, info) {
      this.game = game;
      this.info = info;
      this.ui = new BG.UI();
      this.celebrate = new BG.Celebration(BG.Config.anim.celebrate);
      this.afterEffects = null;
      this.fly = info.coins > 0 ? new BG.CoinFly({ amount: info.coins }) : null;
      if (info.rankUp) {
        const s = BG.Screen;
        this.celebrate.fire({ text: '升段：' + info.rank.name + '！', level: info.rank.index + 2, record: true, width: s.width, height: s.height, top: s.safe.top });
        BG.Audio.play('record');
      }
    }

    effectsPlaying() {
      return this.celebrate.active() || (!!this.fly && this.fly.active());
    }

    update(dt) {
      this.celebrate.update(dt);
      if (this.fly) this.fly.update(dt);
      if (this.afterEffects && !this.effectsPlaying()) {
        const run = this.afterEffects;
        this.afterEffects = null;
        run();
      }
    }

    draw(ctx, screen) {
      const g = this.game;
      const ui = this.ui;
      ui.begin();
      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 32, 420);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;
      const cx = x + w / 2;
      const rewards = g.mode === 'relic' ? Object.keys(g.rewardsGained) : [];
      const coins = this.info.coins || 0;

      const usable = screen.height - safe.top - safe.bottom;
      const heightWith = function (cols) {
        const relicRows = g.relicMode ? Math.ceil(g.relics.length / cols) : 0;
        return 40 + 60 + 34 + 30 + 34 + (g.relicMode ? 34 + relicRows * 44 : 0) + (rewards.length ? 34 + 40 : 0) + (coins > 0 ? 34 : 0) + 20 + 76 + 10 + 44;
      };
      // 遗物两列，小屏放不下时改成三列
      const relicCols = heightWith(2) + 20 > usable ? 3 : 2;
      const relicRows = g.relicMode ? Math.ceil(g.relics.length / relicCols) : 0;
      // 还放不下时压缩"再来一局"按钮
      const againH = Math.max(48, 76 - Math.max(0, heightWith(relicCols) + 20 - usable));
      const contentH = heightWith(relicCols) - (76 - againH);
      let y = safe.top + Math.max(10, (usable - contentH) / 2);
      this.celebrate.drawBehind(ctx);

      D.text(ctx, REASONS[g.endReason] || '本局结束', cx, y + 18, { size: 24, bold: true, align: 'center' });
      y += 40;
      D.text(ctx, String(g.score), cx, y + 30, { size: 52, bold: true, align: 'center' });
      const scoreY = y + 30;
      y += 60;
      if (this.info.isRecord) {
        D.text(ctx, '新纪录！', cx, y + 15, { size: 20, bold: true, align: 'center', color: T.gold });
      } else {
        D.text(ctx, '最高分 ' + this.info.best, cx, y + 15, { size: 16, color: T.textDim, align: 'center' });
      }
      y += 30;
      D.text(ctx, BG.Rank.text(this.info.rank), cx, y + 12, { size: 16, bold: this.info.rankUp, color: T.gold, align: 'center' });
      y += 34;

      const row = function (label, value) {
        D.text(ctx, label, x + 4, y + 15, { size: 16, color: T.textDim });
        D.text(ctx, value, x + w - 4, y + 15, { size: 18, bold: true, align: 'right' });
        y += 34;
      };
      row('用时', D.timeText(g.elapsedMs));
      if (coins > 0) {
        // 金币从分数飞过来，到了才显示数字
        const iconX = x + w - 60;
        D.text(ctx, '金币', x + 4, y + 15, { size: 16, color: T.textDim });
        D.coinIcon(ctx, iconX, y + 15, 22);
        if (this.fly.landed()) D.text(ctx, '+' + coins, x + w - 4, y + 15, { size: 18, bold: true, align: 'right', color: T.gold });
        this.fly.from = { x: cx, y: scoreY };
        this.fly.to = { x: iconX, y: y + 15 };
        y += 34;
      }
      if (g.relicMode) {
        D.text(ctx, g.relics.length ? '获得的遗物' : '没有获得遗物', x + 4, y + 15, { size: 16, color: T.textDim });
        y += 34;
        const colW = w / relicCols;
        g.relics.forEach(function (id, i) {
          const cellX = x + (i % relicCols) * colW;
          const cellY = y + Math.floor(i / relicCols) * 44;
          D.relicIcon(ctx, id, cellX + 20, cellY + 20, 36);
          D.text(ctx, BG.Relics.byId[id].name, cellX + 44, cellY + 20, { size: 16 });
        });
        y += relicRows * 44;
      }
      if (rewards.length) {
        D.text(ctx, '获得的奖励', x + 4, y + 15, { size: 16, color: T.textDim });
        y += 34;
        const colW = w / rewards.length;
        rewards.forEach(function (id, i) {
          const cellX = x + i * colW;
          D.rewardIcon(ctx, id, cellX + 18, y + 18, 32);
          D.text(ctx, BG.Rewards[id].name + ' ×' + g.rewardsGained[id], cellX + 40, y + 18, { size: 16, color: T.gold });
        });
        y += 40;
      }
      y += 16;

      // 最大的按钮：立即同模式新开一局，不经过主菜单，不播广告
      ui.button(ctx, 'again', x, y, w, againH, '再来一局', {
        style: 'primary', size: 26,
        onTap: function () { BG.App.startGame(g.mode); }
      });
      y += againH + 10;
      ui.button(ctx, 'menu', x, y, w, 44, '返回菜单', {
        size: 16, bold: false,
        onTap: function () { BG.App.toMenu(); }
      });

      if (this.fly && this.fly.active()) this.fly.draw(ctx);
      if (this.celebrate.banner) {
        this.celebrate.drawBanner(ctx, { x: x, y: safe.top + 4, w: w, h: 56 });
      }
    }

    back() {
      BG.App.toMenu();
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.ResultScene = ResultScene;
})();
