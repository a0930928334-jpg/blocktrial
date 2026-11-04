// "无处可放"面板：炸弹、换一组、复活、放弃。棋盘半透明显示在面板后面。
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  const BUTTON_H = 58;
  const GAP = 10;
  const TEXT_H = 26;

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

    _coinRevive() {
      this.game.reviveWithCoins();
      this._closeIfDone();
    }

    // 和纪录的差距。还没有纪录时不显示
    _recordText() {
      const g = this.game;
      if (g.best <= 0) return null;
      return g.score > g.best ? '已超纪录 ' + (g.score - g.best) + ' 分' : '距离纪录还差 ' + (g.best - g.score) + ' 分';
    }

    // 广告和金币复活放在一行，只有一个时占满
    _reviveRow(ctx, x, y, w, ad, coin) {
      const self = this;
      const gap = 8;
      const half = ad && coin ? (w - gap) / 2 : w;
      if (ad) {
        this.ui.button(ctx, 'revive', x, y, half, BUTTON_H, '看广告复活', {
          style: 'primary', size: 16, disabled: !ad.works, sub: ad.works ? '清 3×3' : '清完也放不下',
          onTap: function () { self._revive(); }
        });
        D.adIcon(ctx, x + 14, y + 14, 14, !ad.works);
      }
      if (coin) {
        const sub = !coin.clears ? '清完也放不下' : (coin.affordable ? '清 3×3' : '余额 ' + coin.balance);
        this.ui.button(ctx, 'coinRevive', ad ? x + half + gap : x, y, half, BUTTON_H, '金币复活 ' + coin.cost, {
          style: 'gold', size: 16, disabled: !coin.works, sub: sub,
          onTap: function () { self._coinRevive(); }
        });
      }
    }

    // 奖励的免费次数，不看广告
    _freeSwap() {
      this.game.swapTray(true);
      this._closeIfDone();
    }

    _freeRevive() {
      this.game.revive(true);
      this._closeIfDone();
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
      const find = function (id) { return options.find(function (o) { return o.id === id; }); };
      const ad = find('revive');
      const coin = find('coinRevive');
      const isRevive = function (o) { return o.id === 'freeRevive' || o.id === 'revive' || o.id === 'coinRevive'; };
      const recordText = options.some(isRevive) ? this._recordText() : null;
      const rows = options.length - (ad && coin ? 1 : 0);
      const duoPlayer = this.game.currentPlayer();
      const titleH = duoPlayer ? 54 + TEXT_H : 54;
      const panelH = titleH + rows * (BUTTON_H + GAP) + (recordText ? TEXT_H : 0) + 8;
      // 贴着屏幕下方，把棋盘露出来
      const px = safe.left + (screen.width - safe.left - safe.right - panelW) / 2;
      const py = screen.height - safe.bottom - panelH - 10;
      BG.UIKit.panel(ctx, { x: px, y: py, w: panelW, h: panelH });
      D.text(ctx, '无处可放', px + panelW / 2, py + 28, { size: 24, bold: true, align: 'center' });

      const x = px + 14;
      const w = panelW - 28;
      let y = py + titleH;
      if (duoPlayer) {
        D.text(ctx, duoPlayer.name + ' 卡住了', px + panelW / 2, py + 62, { size: 18, bold: true, color: T.duo[this.game.duo.current], align: 'center' });
      }
      let textDrawn = false;
      let rowDrawn = false;
      options.forEach(function (o) {
        if (recordText && !textDrawn && isRevive(o)) {
          textDrawn = true;
          D.text(ctx, recordText, x + w / 2, y + 12, { size: 16, bold: true, color: T.gold, align: 'center' });
          y += TEXT_H;
        }
        if (o.id === 'revive' || o.id === 'coinRevive') {
          if (rowDrawn) return;
          rowDrawn = true;
          self._reviveRow(ctx, x, y, w, ad, coin);
          y += BUTTON_H + GAP;
          return;
        }
        if (o.id === 'bomb') {
          ui.button(ctx, 'bomb', x, y, w, BUTTON_H, '使用炸弹', {
            style: 'gold', size: 18, sub: '免费，还有 ' + o.count + ' 颗',
            onTap: function () { self._useBomb(); }
          });
        } else if (o.id === 'freeSwap') {
          ui.button(ctx, 'freeSwap', x, y, w, BUTTON_H, '免费换一组', {
            style: 'gold', size: 18, sub: '奖励，还有 ' + o.left + ' 次',
            onTap: function () { self._freeSwap(); }
          });
        } else if (o.id === 'freeRevive') {
          ui.button(ctx, 'freeRevive', x, y, w, BUTTON_H, '免费复活', {
            style: 'gold', size: 18, disabled: !o.works,
            sub: o.works ? '奖励，清 3×3，还有 ' + o.left + ' 次' : '清完也放不下，此项不可用',
            onTap: function () { self._freeRevive(); }
          });
        } else if (o.id === 'swap') {
          self._adButton(ctx, 'swap', x, y, w, '换一组', '看广告，还剩 ' + o.left + ' 次', {
            style: 'primary',
            onTap: function () { self._swap(); }
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
