// 排行榜接口：submit 提交分数，list 取排行。都返回 Promise，微信版的接口是异步的。
// 浏览器和 APK 版：本机历史最高分 Top N，经典、遗物、每日挑战各一张榜。
//
// 移植微信时（这次没有实现）：
//   submit 改成 wx.setUserCloudStorage({ KVDataList: [{ key: mode, value: String(score) }] })，
//   只保留比云端更高的分数，存储的 key 按模式区分。
//   好友排行在开放数据域里：在 game.json 配置 openDataContext，单独写一个读
//   wx.getFriendCloudStorage 的入口，并把榜单画到共享的 sharedCanvas 上。
//   主域拿不到好友数据，所以好友榜的界面不能走 list，只能 drawImage 那张 sharedCanvas。
//   list 继续返回本机榜，或者改成自己服务器的全服榜。
(function () {
  'use strict';

  const SIZE = 10;

  function key(mode) {
    return 'board_' + mode;
  }

  BG.Leaderboard = {
    // meta: { at: ISO 时间字符串 }。0 分不上榜
    submit: function (mode, score, meta) {
      if (score <= 0) return Promise.resolve(false);
      const entry = { score: score, at: (meta && meta.at) || null };
      const next = BG.Storage.get(key(mode), []).concat([entry])
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, SIZE);
      BG.Storage.set(key(mode), next);
      return Promise.resolve(next.indexOf(entry) !== -1);
    },

    // 返回 [{ score, at }]，分数从高到低
    list: function (mode, limit) {
      return Promise.resolve(BG.Storage.get(key(mode), []).slice(0, limit || SIZE));
    }
  };
})();
