// 遗物模式的开局道具：金币够时才弹，买了或选直接开始就开局。
(function () {
  'use strict';

  const D = BG.Draw;
  const Kit = BG.UIKit;

  const BUTTON_H = 58;
  const GAP = 10;

  class OpeningScene {
    constructor() {
      this.ui = new BG.UI();
    }

    draw(ctx, screen) {
      const ui = this.ui;
      const cost = BG.Config.coins.openingCost;
      ui.begin();
      Kit.dim(ctx, screen);
      const h = 58 + 3 * (BUTTON_H + GAP) + 6;
      const r = Kit.modalRect(screen, 340, h);
      Kit.panel(ctx, r);
      D.coinIcon(ctx, r.x + r.w / 2 - 24, r.y + 30, 24);
      D.text(ctx, String(BG.Wallet.balance()), r.x + r.w / 2 - 6, r.y + 30, { size: 22, bold: true });
      const x = r.x + 14;
      const w = r.w - 28;
      let y = r.y + 58;
      [['timeBomb', 'openBomb', '炸弹'], ['holdSlot', 'openHold', '暂存']].forEach(function (item) {
        ui.button(ctx, item[1], x, y, w, BUTTON_H, item[2] + ' ' + cost, {
          style: 'gold', size: 20,
          onTap: function () { BG.App.beginGame('relic', item[0]); }
        });
        D.relicIcon(ctx, item[0], x + 30, y + BUTTON_H / 2, 36);
        y += BUTTON_H + GAP;
      });
      ui.button(ctx, 'openNone', x, y, w, BUTTON_H, '直接开始', {
        style: 'primary', size: 20,
        onTap: function () { BG.App.beginGame('relic'); }
      });
    }

    back() {
      BG.App.pop();
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.OpeningScene = OpeningScene;
})();
