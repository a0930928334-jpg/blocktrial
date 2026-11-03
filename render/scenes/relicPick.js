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

    _refresh() {
      const g = this.game;
      BG.App.watchRewarded('relicRefresh', g).then(function (ok) {
        if (ok) g.refreshOffer();
        else g.noteRefreshAbandoned();
      });
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
      const total = 48 + ids.length * (CARD_H + 10) + 54;
      const usable = screen.height - safe.top - safe.bottom;
      let y = safe.top + Math.max(8, (usable - total) / 2);

      D.text(ctx, '选择一个遗物', x + w / 2, y + 18, { size: 24, bold: true, align: 'center' });
      y += 48;

      ids.forEach(function (id) {
        const relic = BG.Relics.byId[id];
        ui.button(ctx, 'card' + id, x, y, w, CARD_H, '', {
          onTap: function () { self._pick(id); }
        });
        D.relicIcon(ctx, id, x + 10 + ICON_SIZE / 2, y + CARD_H / 2, ICON_SIZE);
        D.text(ctx, relic.name, x + 96, y + CARD_H / 2 - 15, { size: 22, bold: true });
        D.text(ctx, relic.short(), x + 96, y + CARD_H / 2 + 16, { size: 17, color: T.textDim });
        y += CARD_H + 10;
      });

      const canRefresh = g.canRefreshOffer();
      ui.button(ctx, 'refresh', x, y, w, 48, canRefresh ? '看广告刷新一次' : '不能再刷新', {
        style: 'secondary', size: 16, disabled: !canRefresh,
        onTap: function () { self._refresh(); }
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
