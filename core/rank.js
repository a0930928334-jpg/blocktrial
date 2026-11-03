// 局外段位：按所有模式里最高的一次分数。
(function () {
  'use strict';

  // 返回 { name, index, next, left }。不到第一档时 name 为 null、index 为 -1；最高档时 next 为 null
  function of(best, cfg) {
    const tiers = cfg.rank.tiers;
    let index = -1;
    tiers.forEach(function (t, i) {
      if (best >= t[0]) index = i;
    });
    const next = tiers[index + 1] || null;
    return {
      index: index,
      name: index >= 0 ? tiers[index][1] : null,
      next: next ? next[1] : null,
      left: next ? next[0] - best : 0
    };
  }

  // 显示用的一行文字
  function text(rank) {
    const head = rank.name ? '段位 ' + rank.name : '未定段';
    return rank.next ? head + '　距' + rank.next + '还差 ' + rank.left + ' 分' : head + '（最高段位）';
  }

  BG.Rank = { of: of, text: text };
})();
