// 主菜单
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  class MenuScene {
    constructor() {
      this.ui = new BG.UI();
      this.exitHintLeft = 0;
    }

    update(dt) {
      if (this.exitHintLeft > 0) this.exitHintLeft -= dt;
      BG.Pwa.reloadIfUpdated();
    }

    // 再按一次退出
    back() {
      if (this.exitHintLeft > 0) {
        BG.BackButton.exit();
      } else {
        this.exitHintLeft = BG.Config.ui.exitHintMs;
      }
    }

    _logo(ctx, cx, y) {
      const cell = 24;
      const shape = BG.Shapes.byId.L5a;
      D.piece(ctx, shape, 3, cx - cell * 2.5, y, cell);
      D.tile(ctx, cx + cell * 0.5 , y + cell, cell, 1);
      D.tile(ctx, cx + cell * 1.5, y + cell, cell, 1);
      D.tile(ctx, cx + cell * 1.5, y, cell, 0);
    }

    draw(ctx, screen) {
      const app = BG.App;
      const ui = this.ui;
      ui.begin();
      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 40, 340);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;
      const cx = x + w / 2;

      const contentH = 72 + 88 + 66 * 3 + 12 * 2 + 16 + 52;
      const usable = screen.height - safe.top - safe.bottom;
      let y = safe.top + Math.max(12, (usable - contentH) / 2);

      this._logo(ctx, cx, y);
      y += 72 + 34;
      D.text(ctx, '方块试玩版', cx, y, { size: 30, bold: true, align: 'center' });
      y += 44;

      ui.button(ctx, 'classic', x, y, w, 66, '经典模式', {
        style: 'secondary', size: 20, sub: '最高分 ' + app.getBest('classic'),
        onTap: function () { app.startGame('classic'); }
      });
      y += 78;
      ui.button(ctx, 'relic', x, y, w, 66, '遗物模式', {
        style: 'primary', size: 20, sub: '最高分 ' + app.getBest('relic'),
        onTap: function () { app.startGame('relic'); }
      });
      y += 78;
      ui.button(ctx, 'daily', x, y, w, 66, '每日挑战', {
        style: 'gold', size: 20, sub: '今日最高 ' + app.getBest('daily'),
        onTap: function () { app.startGame('daily'); }
      });
      y += 82;

      const half = (w - 12) / 2;
      ui.button(ctx, 'stats', x, y, half, 52, '统计', {
        onTap: function () { app.push(new BG.StatsScene()); }
      });
      ui.button(ctx, 'settings', x + half + 12, y, half, 52, '设置', {
        onTap: function () { app.push(new BG.SettingsScene()); }
      });

      D.text(ctx, 'v' + BG.Version.name + ' · ' + BG.Version.build, safe.left + 12, screen.height - safe.bottom - 16, {
        size: 16, color: T.textDim
      });

      if (this.exitHintLeft > 0) {
        const w2 = 180;
        const hy = screen.height - safe.bottom - 84;
        D.fillRound(ctx, screen.width / 2 - w2 / 2, hy, w2, 44, 22, T.panelLight);
        D.text(ctx, '再按一次退出', screen.width / 2, hy + 22, { size: 16, align: 'center' });
      }
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.MenuScene = MenuScene;
})();
