// "无处可放"面板：炸弹、换一组、复活、放弃。棋盘半透明显示在面板后面。
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const BUTTON_H = 58;
  const GAP = 10;

  class StuckScene {
    constructor(game, play) {
      this.game = game;
      this.play = play;
      this.ui = new BG.UI();
    }

    _useBomb() {
      BG.App.pop();
      this.play.aiming = true;
    }

    _closeIfDone() {
      if (BG.App.top() === this && this.game.phase !== 'stuck') BG.App.pop();
    }

    _swap() {
      const self = this;
      const g = this.game;
      BG.App.watchRewarded('swapTray', g).then(function (ok) {
        if (ok) g.swapTray();
        else g.noteStuckAdAbandoned('swap');
        self._closeIfDone();
      });
    }

    _revive() {
      const self = this;
      const g = this.game;
      BG.App.watchRewarded('revive', g).then(function (ok) {
        if (ok) g.revive();
        else g.noteStuckAdAbandoned('revive');
        self._closeIfDone();
      });
    }

    _giveUp() {
      BG.App.pop();
      this.game.giveUpStuck();
    }

    _adButton(ctx, id, x, y, w, label, sub, opts) {
      this.ui.button(ctx, id, x, y, w, BUTTON_H, label, Object.assign({ sub: sub, size: 18 }, opts));
      D.adIcon(ctx, x + 22, y + BUTTON_H / 2, 20, opts.disabled);
    }

    draw(ctx, screen) {
      const self = this;
      const ui = this.ui;
      const options = this.game.stuckOptions();
      ui.begin();
      // 遮罩比其他弹窗淡，能看清棋盘卡在哪
      ctx.fillStyle = 'rgba(5, 7, 10, 0.5)';
      ctx.fillRect(0, 0, screen.width, screen.height);

      const safe = screen.safe;
      const panelW = Math.min(screen.width - safe.left - safe.right - 24, 420);
      const panelH = 54 + options.length * (BUTTON_H + GAP) + 8;
      // 贴着屏幕下方，把棋盘露出来
      const px = safe.left + (screen.width - safe.left - safe.right - panelW) / 2;
      const py = screen.height - safe.bottom - panelH - 10;
      BG.UIKit.panel(ctx, { x: px, y: py, w: panelW, h: panelH });
      D.text(ctx, '无处可放', px + panelW / 2, py + 28, { size: 24, bold: true, align: 'center' });

      const x = px + 14;
      const w = panelW - 28;
      let y = py + 54;
      options.forEach(function (o) {
        if (o.id === 'bomb') {
          ui.button(ctx, 'bomb', x, y, w, BUTTON_H, '使用炸弹', {
            style: 'gold', size: 18, sub: '免费，还有 ' + o.count + ' 颗',
            onTap: function () { self._useBomb(); }
          });
        } else if (o.id === 'swap') {
          self._adButton(ctx, 'swap', x, y, w, '换一组', '看广告，还剩 ' + o.left + ' 次', {
            style: 'primary',
            onTap: function () { self._swap(); }
          });
        } else if (o.id === 'revive') {
          const sub = o.works ? '看广告清 3×3，还剩 ' + o.left + ' 次' : '清完也放不下，此项不可用';
          self._adButton(ctx, 'revive', x, y, w, '复活', sub, {
            style: 'primary', disabled: !o.works,
            onTap: function () { self._revive(); }
          });
        } else {
          ui.button(ctx, 'giveUp', x, y, w, BUTTON_H, '放弃', {
            style: 'danger', size: 18, sub: '进入结算',
            onTap: function () { self._giveUp(); }
          });
        }
        y += BUTTON_H + GAP;
      });
    }

    back() {
      BG.App.push(new BG.PauseScene(this.game, { fromBackKey: true }));
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.StuckScene = StuckScene;
})();
