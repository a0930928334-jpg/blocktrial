// 暂停
(function () {
  'use strict';

  const D = BG.Draw;
  const Kit = BG.UIKit;

  class PauseScene {
    // opts.fromBackKey：由安卓返回键打开，第二个按钮是"返回菜单"
    constructor(game, opts) {
      this.game = game;
      this.fromBackKey = !!(opts && opts.fromBackKey);
      this.ui = new BG.UI();
    }

    back() {
      BG.App.pop();
    }

    draw(ctx, screen) {
      const g = this.game;
      const ui = this.ui;
      ui.begin();
      Kit.dim(ctx, screen);
      const r = Kit.modalRect(screen, 340, 210);
      Kit.panel(ctx, r);
      D.text(ctx, '已暂停', r.x + r.w / 2, r.y + 36, { size: 24, bold: true, align: 'center' });
      ui.button(ctx, 'resume', r.x + 16, r.y + 72, r.w - 32, 56, '继续', {
        style: 'primary', size: 20,
        onTap: function () { BG.App.pop(); }
      });
      const fromBackKey = this.fromBackKey;
      ui.button(ctx, 'quit', r.x + 16, r.y + 140, r.w - 32, 52, fromBackKey ? '返回菜单' : '放弃本局', {
        style: 'danger', size: 16,
        onTap: function () {
          if (fromBackKey) {
            BG.App.quitToMenu(g);
          } else {
            BG.App.pop();
            g.endGame('abandon');
          }
        }
      });
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.PauseScene = PauseScene;
})();
