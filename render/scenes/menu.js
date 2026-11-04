// 主菜单
(function () {
  'use strict';

  const T = BG.Theme;
  const D = BG.Draw;

  class MenuScene {
    constructor() {
      this.ui = new BG.UI();
      this.exitHintLeft = 0;
      this.fly = null;
      this.flyFrom = null;
      this.afterEffects = null;
      const login = BG.Wallet.claimLogin();
      if (login) {
        this.fly = new BG.CoinFly({ amount: login.amount, label: '+' + login.amount, sub: '连续 ' + login.streak + ' 天' });
      }
    }

    effectsPlaying() {
      return !!this.fly && this.fly.active();
    }

    update(dt) {
      if (this.exitHintLeft > 0) this.exitHintLeft -= dt;
      BG.Pwa.checkForUpdate();
      if (this.fly) {
        this.fly.update(dt);
        if (!this.fly.active()) this.fly = null;
      }
      if (this.afterEffects && !this.effectsPlaying()) {
        const run = this.afterEffects;
        this.afterEffects = null;
        run();
      }
    }

    _watchCoinAd(x, y) {
      const self = this;
      BG.App.watchCoinAd().then(function (amount) {
        if (amount <= 0) return;
        self.fly = new BG.CoinFly({ amount: amount, label: '+' + amount });
        self.flyFrom = { x: x, y: y };
      });
    }

    // 余额和看广告领金币的按钮，一行
    _coinRow(ctx, x, y, w) {
      const self = this;
      const h = 56;
      const balanceW = 96;
      D.fillRound(ctx, x, y, balanceW, h, 12, T.panel);
      const shown = BG.Wallet.balance() - (this.fly ? this.fly.pending() : 0);
      const icon = { x: x + 22, y: y + h / 2 };
      D.coinIcon(ctx, icon.x, icon.y, 24);
      D.text(ctx, String(shown), x + 38, y + h / 2, { size: 20, bold: true });
      const offer = BG.Wallet.adOffer();
      const bx = x + balanceW + 10;
      const bw = w - balanceW - 10;
      const none = offer.left === 0;
      this.ui.button(ctx, 'coinAd', bx, y, bw, h, '看广告领金币', {
        style: 'gold', size: 16, disabled: none,
        sub: none ? '明天再来' : '+' + offer.amount + '，还剩 ' + offer.left + ' 次',
        onTap: function () { self._watchCoinAd(bx + bw / 2, y + h / 2); }
      });
      D.adIcon(ctx, bx + 18, y + 18, 14, none);
      return icon;
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

    _updateNotice(ctx, screen, version) {
      const safe = screen.safe;
      const x = safe.left + 12;
      const w = screen.width - safe.left - safe.right - 24;
      const updating = BG.Pwa.isUpdating();
      this.ui.button(ctx, 'update', x, safe.top + 8, w, 52, updating ? '正在更新…' : '有新版本 v' + version + '，点击更新', {
        style: 'gold', size: 18, disabled: updating,
        onTap: function () { BG.Pwa.applyUpdate(); }
      });
    }

    draw(ctx, screen) {
      const app = BG.App;
      const ui = this.ui;
      ui.begin();
      const safe = screen.safe;
      const w = Math.min(screen.width - safe.left - safe.right - 40, 340);
      const x = safe.left + (screen.width - safe.left - safe.right - w) / 2;
      const cx = x + w / 2;

      const logoH = 72 + 34;
      const fullH = 72 + 88 + 30 + 68 + 66 * 3 + 12 * 2 + 16 + 52;
      // 有新版本时顶部留出提示的位置，内容往下排，小屏幕上也不会重叠
      const newVersion = BG.Pwa.availableVersion();
      const noticeH = newVersion ? 64 : 0;
      const usable = screen.height - safe.top - safe.bottom - noticeH;
      // 小屏幕放不下时不画图标
      const showLogo = fullH + 24 <= usable;
      const contentH = showLogo ? fullH : fullH - logoH;
      let y = safe.top + noticeH + Math.max(12, (usable - contentH) / 2);
      if (newVersion) this._updateNotice(ctx, screen, newVersion);

      if (showLogo) {
        this._logo(ctx, cx, y);
        y += logoH;
      } else {
        y += 18;
      }
      D.text(ctx, '方块试玩版', cx, y, { size: 30, bold: true, align: 'center' });
      y += 34;
      D.text(ctx, BG.Rank.text(BG.Rank.of(app.overallBest(), BG.Config)), cx, y, { size: 16, color: T.gold, align: 'center' });
      y += 26;
      const icon = this._coinRow(ctx, x, y, w);
      y += 68;

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

      if (this.fly) {
        this.fly.from = this.flyFrom || { x: screen.width / 2, y: screen.height / 2 };
        this.fly.to = icon;
        this.fly.draw(ctx);
      }
    }

    down(x, y) { this.ui.down(x, y); }
    up(x, y) { this.ui.up(x, y); }
  }

  BG.MenuScene = MenuScene;
})();
