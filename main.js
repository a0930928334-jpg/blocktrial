// 启动和各层组装：场景栈、主循环、最高分、统计、广告流程。
// 移植微信时，这里只需要换掉取 canvas 和启动的几行。
(function () {
  'use strict';

  const Screen = BG.Screen;
  const Storage = BG.Storage;

  function todayNumber() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function randomSeed() {
    return (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  }

  function bestKey(mode, seed) {
    return mode === 'daily' ? 'daily_' + (seed || todayNumber()) : 'best_' + mode;
  }

  const App = {
    stack: [],
    debug: false,
    dynamicDeal: BG.Config.dealer.enabled,
    settings: { sound: true, vibrate: true },

    top: function () {
      return this.stack[this.stack.length - 1];
    },

    push: function (scene) {
      this.stack.push(scene);
    },

    pop: function () {
      this.stack.pop();
    },

    replace: function (scene) {
      this.stack = [scene];
    },

    // ---------- 流程 ----------

    // 遗物模式金币够时先选开局道具，双人先改名。面板要等庆祝特效播完才弹
    startGame: function (mode) {
      const relicPanel = mode === 'relic' && BG.Wallet.balance() >= BG.Config.coins.openingCost;
      if (!relicPanel && mode !== 'duo') {
        this.beginGame(mode);
        return;
      }
      const self = this;
      const open = function () { self.push(mode === 'duo' ? new BG.DuoSetupScene() : new BG.OpeningScene()); };
      const top = this.top();
      if (top.effectsPlaying && top.effectsPlaying()) top.afterEffects = open;
      else open();
    },

    // opening：开局买的道具，扣费在 Game 里。names：双人的名字，不传就用上次的
    beginGame: function (mode, opening, names) {
      const seed = mode === 'daily' ? todayNumber() : randomSeed();
      this.replace(new BG.PlayScene(mode, seed, opening, mode === 'duo' ? (names || this.duoNames()) : undefined));
    },

    // 结算页的再来一局：双人保留名字，不再问
    restartGame: function (game) {
      if (game.duo) this.beginGame('duo', null, game.duo.players.map(function (p) { return p.name; }));
      else this.startGame(game.mode);
    },

    duoNames: function () {
      const saved = Storage.get('duoNames', []);
      return BG.Config.duo.defaultNames.map(function (name, i) {
        return BG.DuoState.cleanName(saved[i], i, BG.Config);
      });
    },

    saveDuoNames: function (names) {
      Storage.set('duoNames', names);
    },

    // 保存最高分和统计，返回结算页要用的信息
    _saveGame: function (game) {
      const key = bestKey(game.mode, game.seed);
      const oldBest = Storage.get(key, 0);
      const isRecord = game.score > oldBest;
      if (isRecord) Storage.set(key, game.score);

      // 段位和排行榜是个人的，队伍分数不算
      const oldRank = BG.Rank.of(this.overallBest(), BG.Config);
      const overall = game.duo ? this.overallBest() : Math.max(this.overallBest(), game.score);
      Storage.set('overallBest', overall);
      const rank = BG.Rank.of(overall, BG.Config);

      game.coinsEarned = BG.Wallet.awardGame(game.placements, isRecord);
      const record = game.record();
      record.finishedAt = new Date().toISOString();
      if (!game.duo) BG.Leaderboard.submit(game.mode, game.score, { at: record.finishedAt });
      this.saveRecords(BG.Stats.addRecord(this.loadRecords(), record, BG.Config.stats.keep));
      Storage.set('gamesSinceAd', Storage.get('gamesSinceAd', 0) + 1);

      return { isRecord: isRecord, best: Math.max(oldBest, game.score), rank: rank, rankUp: rank.index > oldRank.index, coins: game.coinsEarned };
    },

    showResult: function (game) {
      this.replace(new BG.ResultScene(game, this._saveGame(game)));
    },

    // 从返回键的暂停菜单退出：本局记为放弃，直接回主菜单
    quitToMenu: function (game) {
      game.endGame('abandon');
      this._saveGame(game);
      this.toMenu();
    },

    // 安卓返回键：交给最上层的场景处理，广告播放时不响应
    onBack: function () {
      if (BG.Ads.active()) return;
      if (BG.TextInput.active()) {
        BG.TextInput.close();
        return;
      }
      const top = this.top();
      if (top.back) top.back();
    },

    // 回到主菜单，到了频率就先放一次插屏
    toMenu: function () {
      const self = this;
      const count = Storage.get('gamesSinceAd', 0);
      if (!BG.Stats.shouldPlayInterstitial(count, BG.Config.ads)) {
        this.replace(new BG.MenuScene());
        return;
      }
      Storage.set('gamesSinceAd', 0);
      this._noteLastRecordAd('trigger');
      BG.Ads.showInterstitial().then(function (ok) {
        self._noteLastRecordAd(ok ? 'complete' : 'abandon');
        self.replace(new BG.MenuScene());
      });
    },

    // 激励视频：统一记录触发、完成、放弃
    watchRewarded: function (type, game) {
      game.noteAd(type, 'trigger');
      return BG.Ads.showRewarded(type).then(function (ok) {
        game.noteAd(type, ok ? 'complete' : 'abandon');
        return ok;
      });
    },

    // 看广告领金币，返回领到多少，没看完是 0
    watchCoinAd: function () {
      return BG.Ads.showRewarded('coins').then(function (ok) {
        return ok ? BG.Wallet.claimAd() : 0;
      });
    },

    // 插屏发生在结算之后，记到刚结束的那一局上
    _noteLastRecordAd: function (status) {
      const records = this.loadRecords();
      if (records.length === 0) return;
      BG.Stats.noteAd(records[0].ads, 'interstitial', status);
      this.saveRecords(records);
    },

    // ---------- 存储 ----------

    // 所有模式里最高的一次分数。每日最高分按日期存，所以单独存一份；第一次用时从旧数据算出来
    overallBest: function () {
      const saved = Storage.get('overallBest', null);
      if (saved !== null) return saved;
      const best = this.loadRecords().reduce(function (max, r) {
        return Math.max(max, r.score || 0);
      }, Math.max(Storage.get('best_classic', 0), Storage.get('best_relic', 0)));
      Storage.set('overallBest', best);
      return best;
    },

    // 第一次运行时，把已有的统计记录写进本机排行榜
    _seedLeaderboard: function () {
      if (Storage.get('boardSeeded', false)) return;
      Storage.set('boardSeeded', true);
      this.loadRecords().forEach(function (r) {
        BG.Leaderboard.submit(r.mode, r.score, { at: r.finishedAt });
      });
    },

    getBest: function (mode, seed) {
      return Storage.get(bestKey(mode, seed), 0);
    },

    loadRecords: function () {
      return Storage.get('records', []);
    },

    saveRecords: function (records) {
      Storage.set('records', records);
    },

    updateSetting: function (key, value) {
      this.settings[key] = value;
      Storage.set('settings', this.settings);
      this._applySettings();
    },

    _applySettings: function () {
      BG.Audio.setEnabled(this.settings.sound);
      BG.Vibrate.setEnabled(this.settings.vibrate);
    }
  };

  BG.App = App;

  // ---------- 主循环 ----------

  let lastTime = 0;

  function frame(now) {
    // 切到后台时不计时：单帧最多算 100 毫秒
    const dt = lastTime ? Math.min(now - lastTime, 100) : 16;
    lastTime = now;

    if (BG.Ads.active()) {
      BG.Ads.tick(dt);
    } else {
      const top = App.top();
      App.stack.forEach(function (scene) {
        if (scene !== top && scene.updateFx) scene.updateFx(dt);
      });
      if (top.update) top.update(dt);
    }

    Screen.sync();
    const ctx = Screen.context();
    ctx.setTransform(Screen.dpr, 0, 0, Screen.dpr, 0, 0);
    ctx.fillStyle = BG.Theme.bg;
    ctx.fillRect(0, 0, Screen.width, Screen.height);
    App.stack.forEach(function (scene) { scene.draw(ctx, Screen); });
    BG.Ads.draw(ctx, Screen);

    Screen.onFrame(frame);
  }

  function onInput(ev) {
    BG.Audio.unlock();
    if (BG.Ads.active()) {
      BG.Ads.handle(ev, Screen);
      return;
    }
    const scene = App.top();
    if (scene[ev.type]) scene[ev.type](ev.x, ev.y);
  }

  function onResize() {
    App.stack.forEach(function (scene) {
      if (scene.resize) scene.resize(Screen);
    });
  }

  function start() {
    App.settings = Object.assign(App.settings, Storage.get('settings', {}));
    App._applySettings();
    App.debug = Screen.query('debug') === '1';
    Screen.init('game', onResize);
    BG.Input.init(Screen.canvas(), onInput);
    BG.BackButton.init(function () { App.onBack(); });
    BG.Pwa.init();
    App._seedLeaderboard();
    App.replace(new BG.MenuScene());
    Screen.onFrame(frame);
  }

  start();
})();
