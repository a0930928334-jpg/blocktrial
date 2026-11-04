// 双人开局：改名，或者直接开始。名字记住上次用的。
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;
  const Kit = BG.UIKit;

  const ROW_H = 58;
  const GAP = 10;

  class DuoSetupScene {
    constructor() {
      this.ui = new BG.UI();
      this.names = BG.App.duoNames();
    }

    _rename(index) {
      const self = this;
      BG.TextInput.ask(this.names[index], BG.Config.duo.nameMax).then(function (text) {
        self.names[index] = BG.DuoState.cleanName(text, index, BG.Config);
        BG.App.saveDuoNames(self.names);
      });
    }

    draw(ctx, screen) {
      const self = this;
      const ui = this.ui;
      ui.begin();
      Kit.dim(ctx, screen);
      const h = 58 + 3 * (ROW_H + GAP) + 6;
      const r = Kit.modalRect(screen, 340, h);
      Kit.panel(ctx, r);
      D.text(ctx, '双人', r.x + r.w / 2, r.y + 30, { size: 24, bold: true, align: 'center' });
      const x = r.x + 14;
      const w = r.w - 28;
      let y = r.y + 58;
      this.names.forEach(function (name, i) {
        ui.button(ctx, 'duoName' + i, x, y, w, ROW_H, name, {
          size: 20,
          onTap: function () { self._rename(i); }
        });
        D.fillRound(ctx, x + 14, y + ROW_H / 2 - 9, 18, 18, 9, T.duo[i]);
        D.text(ctx, '改名', x + w - 14, y + ROW_H / 2, { size: 16, color: T.textDim, align: 'right' });
        y += ROW_H + GAP;
      });
      ui.button(ctx, 'duoStart', x, y, w, ROW_H, '开始', {
        style: 'primary', size: 20,
        onTap: function () { BG.App.beginGame('duo', null, self.names); }
      });
    }

    back() {
      BG.App.pop();
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.DuoSetupScene = DuoSetupScene;
})();
