// 奖励三选一：金色，图标 + 一句话。遗物三选一是青色卡片，名称加说明
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const CARD_H = 76;
  const ICON_SIZE = 52;

  class RewardPickScene {
    constructor(game) {
      this.game = game;
      this.ui = new BG.UI();
      BG.Audio.play('relic');
    }

    _pick(id) {
      if (this.game.pickReward(id)) BG.App.pop();
    }

    draw(ctx, screen) {
      const self = this;
      const g = this.game;
      const ui = this.ui;
      ui.begin();
      BG.UIKit.dim(ctx, screen);

      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 24, 420);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;

      const offer = g.rewardOffer;
      const ids = offer ? offer.ids : [];
      const total = 66 + ids.length * (CARD_H + 10);
      const usable = screen.height - safe.top - safe.bottom;
      let y = safe.top + Math.max(8, (usable - total) / 2);

      D.text(ctx, offer ? g.rewardScoreAt(offer.index) + ' 分奖励' : '', x + w / 2, y + 18, { size: 26, bold: true, align: 'center', color: T.gold });
      D.text(ctx, '选一个', x + w / 2, y + 46, { size: 16, color: T.textDim, align: 'center' });
      y += 66;

      ids.forEach(function (id) {
        ui.area('card' + id, x, y, w, CARD_H, function () { self._pick(id); });
        const pressed = ui.pressedId === 'card' + id;
        D.fillRound(ctx, x, y, w, CARD_H, 14, pressed ? '#3d2d08' : '#2a1e04');
        D.strokeRound(ctx, x, y, w, CARD_H, 14, 2, T.gold);
        D.rewardIcon(ctx, id, x + 14 + ICON_SIZE / 2, y + CARD_H / 2, ICON_SIZE);
        D.text(ctx, BG.Rewards[id].offer, x + 80, y + CARD_H / 2, { size: 20, bold: true, color: T.gold });
        y += CARD_H + 10;
      });
    }

    back() {
      BG.App.push(new BG.PauseScene(this.game, { fromBackKey: true }));
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.RewardPickScene = RewardPickScene;
})();
