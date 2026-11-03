// 设置：音效开关、震动开关
(function () {
  'use strict';

  const D = BG.Draw;
  const Kit = BG.UIKit;

  class SettingsScene {
    constructor() {
      this.ui = new BG.UI();
    }

    draw(ctx, screen) {
      const ui = this.ui;
      const app = BG.App;
      ui.begin();
      Kit.dim(ctx, screen);
      const r = Kit.modalRect(screen, 340, 264);
      Kit.panel(ctx, r);
      D.text(ctx, '设置', r.x + r.w / 2, r.y + 34, { size: 22, bold: true, align: 'center' });

      const s = app.settings;
      ui.button(ctx, 'sound', r.x + 16, r.y + 66, r.w - 32, 52, '音效：' + (s.sound ? '开' : '关'), {
        style: s.sound ? 'primary' : 'secondary',
        onTap: function () { app.updateSetting('sound', !s.sound); }
      });
      ui.button(ctx, 'vibrate', r.x + 16, r.y + 128, r.w - 32, 52, '震动：' + (s.vibrate ? '开' : '关'), {
        style: s.vibrate ? 'primary' : 'secondary',
        onTap: function () { app.updateSetting('vibrate', !s.vibrate); }
      });
      ui.button(ctx, 'back', r.x + 16, r.y + 196, r.w - 32, 52, '返回', {
        onTap: function () { app.pop(); }
      });
    }

    back() {
      BG.App.pop();
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.SettingsScene = SettingsScene;
})();
