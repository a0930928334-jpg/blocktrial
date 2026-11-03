// 遗物三选一：图标 + 名称 + 一句话，不放长段文字
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const CARD_H = 92;
  const ICON_SIZE = 72;

  class RelicPickScene {
    constructor(game) {
      this.game = game;
      this.ui = new BG.UI();
      BG.Audio.play('relic');
    }

    _pick(id) {
      if (this.game.pickRelic(id)) BG.App.pop();
    }

    draw(ctx, screen) {
      const g = this.game;
      const ui = this.ui;
      const self = this;
      ui.begin();
      BG.UIKit.dim(ctx, screen);

      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 24, 420);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;

      const ids = g.offer ? g.offer.ids : [];
      const total = 72 + ids.length * (CARD_H + 10);
      const usable = screen.height - safe.top - safe.bottom;
      let y = safe.top + Math.max(8, (usable - total) / 2);

      D.text(ctx, '选择一个遗物', x + w / 2, y + 18, { size: 24, bold: true, align: 'center' });
      D.text(ctx, '高分更快拿遗物', x + w / 2, y + 46, { size: 16, color: T.textDim, align: 'center' });
      y += 72;

      ids.forEach(function (id) {
        const relic = BG.Relics.byId[id];
        ui.button(ctx, 'card' + id, x, y, w, CARD_H, '', {
          onTap: function () { self._pick(id); }
        });
        D.relicIcon(ctx, id, x + 10 + ICON_SIZE / 2, y + CARD_H / 2, ICON_SIZE);
        D.text(ctx, relic.name, x + 96, y + CARD_H / 2 - 15, { size: 22, bold: true });
        D.text(ctx, relic.short(), x + 96, y + CARD_H / 2 + 16, { size: 17, color: T.textDim });
        // 道具类用完就失效，加分类一直有效，一眼要能分开
        if (relic.type === 'item') {
          D.fillRound(ctx, x + w - 58, y + 10, 48, 26, 8, T.accent);
          D.text(ctx, '限次', x + w - 34, y + 23, { size: 16, bold: true, align: 'center', color: '#06201c' });
        }
        y += CARD_H + 10;
      });
    }

    back() {
      BG.App.push(new BG.PauseScene(this.game, { fromBackKey: true }));
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.RelicPickScene = RelicPickScene;
})();
