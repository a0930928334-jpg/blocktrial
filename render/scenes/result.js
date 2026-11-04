// 结算页
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const REASONS = { stuck: '无处可放', abandon: '已放弃' };
  const DUO_ROW_H = 66;
  const DUO_H = DUO_ROW_H * 2 + 30;

  class ResultScene {
    // info: { isRecord, best, rank, rankUp }
    constructor(game, info) {
      this.game = game;
      this.info = info;
      this.ui = new BG.UI();
      this.celebrate = new BG.Celebration(BG.Config.anim.celebrate);
      this.afterEffects = null;
      this.sharePreview = false;
      this.shareCanvas = null;
      this.shareRecord = null;
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
      const self = this;
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
        return 40 + 60 + 34 + (g.duo ? DUO_H : 30) + 34 + (g.relicMode ? 34 + relicRows * 44 : 0) + (rewards.length ? 34 + 40 : 0) + (coins > 0 ? 34 : 0) + 20 + 76 + 10 + 44;
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
        D.text(ctx, g.duo ? '双人新纪录！' : '新纪录！', cx, y + 15, { size: 20, bold: true, align: 'center', color: T.gold });
      } else {
        D.text(ctx, (g.duo ? '双人纪录 ' : '最高分 ') + this.info.best, cx, y + 15, { size: 16, color: T.textDim, align: 'center' });
      }
      y += 30;
      // 段位是个人的，双人局不显示
      if (!g.duo) {
        D.text(ctx, BG.Rank.text(this.info.rank), cx, y + 12, { size: 16, bold: this.info.rankUp, color: T.gold, align: 'center' });
        y += 34;
      }

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
      if (g.duo) y = this._drawDuo(ctx, x, y, w);
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
        onTap: function () { BG.App.restartGame(g); }
      });
      y += againH + 10;
      const smallW = (w - 10) / 2;
      ui.button(ctx, 'share', x, y, smallW, 44, '成绩图', {
        size: 16, bold: true,
        onTap: function () {
          const open = function () { self.showSharePreview(); };
          if (self.effectsPlaying()) self.afterEffects = open;
          else open();
        }
      });
      ui.button(ctx, 'menu', x + smallW + 10, y, smallW, 44, '返回菜单', {
        size: 16, bold: false,
        onTap: function () { BG.App.toMenu(); }
      });

      if (this.fly && this.fly.active()) this.fly.draw(ctx);
      if (this.celebrate.banner) {
        this.celebrate.drawBanner(ctx, { x: x, y: safe.top + 4, w: w, h: 56 });
      }
      if (this.sharePreview) this._drawSharePreview(ctx, screen);
    }

    // 第一次点开时画一次，之后只贴这张图。段位和结算页显示的相同，双人局没有段位
    showSharePreview() {
      if (!this.shareCanvas) {
        const S = BG.ShareCard;
        const g = this.game;
        this.shareRecord = Object.assign({}, g.record(), {
          best: this.info.best,
          isRecord: this.info.isRecord,
          rank: g.duo ? null : this.info.rank,
          board: g.board.cells.slice()
        });
        this.shareCanvas = BG.Platform.createCanvas(S.WIDTH, S.HEIGHT);
        S.drawShareCard(this.shareCanvas.getContext('2d'), S.WIDTH, S.HEIGHT, this.shareRecord);
      }
      this.sharePreview = true;
    }

    _drawSharePreview(ctx, screen) {
      const safe = screen.safe;
      const maxW = screen.width - safe.left - safe.right - 28;
      const maxH = screen.height - safe.top - safe.bottom - 66;
      const S = BG.ShareCard;
      const scale = Math.min(maxW / S.WIDTH, maxH / S.HEIGHT);
      const w = S.WIDTH * scale;
      const h = S.HEIGHT * scale;
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;
      const y = safe.top + 56;
      const self = this;
      ctx.fillStyle = 'rgba(5, 7, 10, 0.88)';
      ctx.fillRect(0, 0, screen.width, screen.height);
      ctx.drawImage(this.shareCanvas, x, y, w, h);
      // 盖在结算页上，下面的按钮点不到
      this.ui.begin();
      this.ui.button(ctx, 'shareClose', x, safe.top + 6, 92, 44, '关闭', {
        size: 16,
        onTap: function () { self.sharePreview = false; }
      });
      this.ui.button(ctx, 'shareSave', x + w - 92, safe.top + 6, 92, 44, '保存', {
        style: 'gold', size: 16,
        onTap: function () { BG.Platform.saveShareImage(self.shareCanvas); }
      });
    }

    // 两人的贡献：颜色条按得分对比，得分高的有徽章；最后是谁卡住
    _drawDuo(ctx, x, y, w) {
      const d = this.game.duo;
      const a = d.players[0].score;
      const b = d.players[1].score;
      const max = Math.max(a, b, 1);
      d.players.forEach(function (p, i) {
        D.text(ctx, p.name, x + 4, y + 13, { size: 16, bold: true, color: T.duo[i] });
        if (a !== b && p.score === max) {
          const nameW = Array.from(p.name).length * 17 + 12;
          D.fillRound(ctx, x + 4 + nameW, y + 3, 40, 20, 6, T.gold);
          D.text(ctx, '最高', x + 24 + nameW, y + 13, { size: 16, bold: true, color: '#0b0e13', align: 'center' });
        }
        D.text(ctx, String(p.score), x + w - 4, y + 13, { size: 18, bold: true, align: 'right' });
        D.fillRound(ctx, x + 4, y + 26, w - 8, 10, 5, T.panel);
        const barW = (w - 8) * p.score / max;
        if (barW >= 10) D.fillRound(ctx, x + 4, y + 26, barW, 10, 5, T.duo[i]);
        D.text(ctx, '放 ' + p.placements + ' 块 · 最大连击 ' + p.maxCombo, x + 4, y + 49, { size: 16, color: T.textDim });
        y += DUO_ROW_H;
      });
      if (d.lastStuck !== null && this.game.endReason === 'stuck') {
        D.text(ctx, d.players[d.lastStuck].name + ' 最后卡住', x + w / 2, y + 12, { size: 16, align: 'center', color: T.duo[d.lastStuck] });
      }
      return y + 30;
    }

    back() {
      if (this.sharePreview) this.sharePreview = false;
      else BG.App.toMenu();
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.ResultScene = ResultScene;
})();
