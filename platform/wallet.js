// 金币的读写和日期。规则在 core/coins.js，存储只走 BG.Storage，移植微信时不用改这里。
(function () {
  'use strict';

  const KEY = 'coins';
  const DAILY_KEY = 'coinDaily';
  const OFFSET_KEY = 'debugDayOffset';
  const DAY_MS = 86400000;

  let state = null;

  function load() {
    if (!state) state = Object.assign(BG.Coins.empty(), BG.Storage.get(KEY, {}));
    return state;
  }

  function save() {
    BG.Storage.set(KEY, state);
  }

  // 本地日期换成第几天。调试面板的"下一天"只影响金币，不影响每日挑战
  function today() {
    const d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS) + BG.Storage.get(OFFSET_KEY, 0);
  }

  // 每日汇总：{ 第几天: [登录奖励, 看广告领金币的次数] }，只留最近几天
  function noteDaily(day, index, value) {
    const daily = BG.Storage.get(DAILY_KEY, {});
    const row = daily[day] || [0, 0];
    row[index] += value;
    daily[day] = row;
    Object.keys(daily).map(Number).sort(function (a, b) { return b - a; })
      .slice(BG.Config.stats.dailyKeep)
      .forEach(function (old) { delete daily[old]; });
    BG.Storage.set(DAILY_KEY, daily);
  }

  BG.Wallet = {
    today: today,

    balance: function () {
      return load().balance;
    },

    spend: function (amount) {
      if (!BG.Coins.spend(load(), amount)) return false;
      save();
      return true;
    },

    claimLogin: function () {
      const day = today();
      const before = load().lastDay;
      const got = BG.Coins.claimLogin(state, day, BG.Config);
      if (state.lastDay !== before) save();
      if (got) noteDaily(day, 0, got.amount);
      return got;
    },

    adOffer: function () {
      return BG.Coins.adOffer(load(), today(), BG.Config);
    },

    claimAd: function () {
      const day = today();
      const amount = BG.Coins.claimAd(load(), day, BG.Config);
      if (amount > 0) {
        save();
        noteDaily(day, 1, 1);
      }
      return amount;
    },

    // 打完一局，返回这局得到多少
    awardGame: function (placements, isRecord) {
      const amount = BG.Coins.gameReward(placements, isRecord, BG.Config);
      load().balance += amount;
      save();
      return amount;
    },

    // 统计用，新的日子在前：[[月日, 登录奖励, 看广告次数]]
    dailySummary: function () {
      const daily = BG.Storage.get(DAILY_KEY, {});
      return Object.keys(daily).map(Number).sort(function (a, b) { return b - a; }).map(function (day) {
        const d = new Date(day * DAY_MS);
        const two = function (v) { return (v < 10 ? '0' : '') + v; };
        return [two(d.getUTCMonth() + 1) + two(d.getUTCDate()), daily[day][0], daily[day][1]];
      });
    },

    // ---------- 调试面板用 ----------

    debugAdd: function (amount) {
      load().balance += amount;
      save();
    },

    debugClear: function () {
      load().balance = 0;
      save();
    },

    debugNextDay: function () {
      BG.Storage.set(OFFSET_KEY, BG.Storage.get(OFFSET_KEY, 0) + 1);
    },

    debugResetAds: function () {
      const s = load();
      s.adDay = null;
      s.adCount = 0;
      save();
    },

    // 存储被外部改过时重新读取
    reload: function () {
      state = null;
    }
  };
})();
