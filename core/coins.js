// 金币规则：纯数据处理，不碰存储和时间。日子用"第几天"的整数传入，由 platform/wallet.js 负责读写和取日期。
// state：{ balance 余额, streak 连续登录天数, lastDay 上次登录是第几天, adDay 上次看广告领金币是第几天, adCount 那天领了几次 }
(function () {
  'use strict';

  function empty() {
    return { balance: 0, streak: 0, lastDay: null, adDay: null, adCount: 0 };
  }

  // 每天第一次打开时发放。断一天从头算；日期往回调时只记下日期，不发
  function claimLogin(state, day, cfg) {
    if (state.lastDay === day) return null;
    if (state.lastDay !== null && day < state.lastDay) {
      state.lastDay = day;
      return null;
    }
    state.streak = state.lastDay === day - 1 ? state.streak + 1 : 1;
    state.lastDay = day;
    const table = cfg.coins.login;
    const amount = table[Math.min(state.streak, table.length) - 1];
    state.balance += amount;
    return { amount: amount, streak: state.streak };
  }

  // 这次看广告能领多少、今天还剩几次
  function adOffer(state, day, cfg) {
    const c = cfg.coins;
    const used = state.adDay === day ? state.adCount : 0;
    const left = Math.max(0, c.adMax - used);
    if (left === 0) return { amount: 0, left: 0 };
    return { amount: used === 0 ? c.adFirst : c.adNext, left: left };
  }

  function claimAd(state, day, cfg) {
    const offer = adOffer(state, day, cfg);
    if (offer.left === 0) return 0;
    state.adCount = (state.adDay === day ? state.adCount : 0) + 1;
    state.adDay = day;
    state.balance += offer.amount;
    return offer.amount;
  }

  function spend(state, amount) {
    if (state.balance < amount) return false;
    state.balance -= amount;
    return true;
  }

  // 打完一局给多少。放置太少不给，防止开局就放弃来刷
  function gameReward(placements, isRecord, cfg) {
    const c = cfg.coins;
    if (placements < c.minPlacements) return 0;
    return c.game + (isRecord ? c.recordBonus : 0);
  }

  BG.Coins = { empty: empty, claimLogin: claimLogin, adOffer: adOffer, claimAd: claimAd, spend: spend, gameReward: gameReward };
})();
