// 遗物定义。计分效果在 scoring.js，其余效果在 game.js 和 generator.js。
// type：score 加分型，item 道具型。limited：有次数，用完失效。name 2～3 字，short 不超过 10 字。
(function () {
  'use strict';

  const rc = function () { return BG.Config.relic; };

  const list = [
    {
      id: 'crossCut', type: 'score', name: '十字斩',
      short: function () { return '横竖同消 +' + rc().crossBonus; },
      trigger: function () { return '十字斩 +' + rc().crossBonus; }
    },
    {
      id: 'edge', type: 'score', name: '边线',
      short: function () { return '消边线 分×' + rc().edgeMult; },
      trigger: function () { return '边线 ×' + rc().edgeMult; }
    },
    {
      id: 'bigClear', type: 'score', name: '大消除',
      short: function () { return '消' + rc().bigClearMinLines + '线+ 分×' + rc().bigClearMult; },
      trigger: function () { return '大消除 ×' + rc().bigClearMult; }
    },
    {
      id: 'comboUp', type: 'score', name: '连击',
      short: function () { return '连击加成 ×' + rc().comboBonusMult; },
      trigger: function () { return '连击 ×' + rc().comboBonusMult; }
    },
    {
      id: 'chain', type: 'score', name: '连消',
      short: function () { return '连续消除 +' + rc().chainBonus; },
      trigger: function () { return '连消 +' + rc().chainBonus; }
    },
    {
      id: 'timeBomb', type: 'item', limited: true, name: '炸弹',
      short: function () { return '消' + rc().bombEvery + '次 得炸弹'; },
      trigger: function () { return '炸弹 +1'; }
    },
    {
      id: 'holdSlot', type: 'item', limited: true, name: '暂存',
      short: function () { return '暂存' + rc().holdUses + '次'; },
      trigger: function () { return '暂存'; }
    },
    {
      // 会改变发牌，每日挑战的序列要对所有人相同，所以不进每日候选池
      id: 'smallPiece', type: 'item', name: '小块', dailyExcluded: true,
      short: function () { return '每' + rc().smallEvery + '组送小方块'; },
      trigger: function () { return '小块 1×1'; }
    }
  ];

  const byId = {};
  list.forEach(function (r) { byId[r.id] = r; });

  function poolFor(fixedSequence) {
    return list.filter(function (r) { return !(fixedSequence && r.dailyExcluded); })
      .map(function (r) { return r.id; });
  }

  BG.Relics = { list: list, byId: byId, poolFor: poolFor };

  // 遗物模式最后一档之后的分数奖励。toast 是到达时顶部的提示
  BG.Rewards = {
    swap: { name: '换一组', toast: '免费换一组 ×1' },
    revive: { name: '复活', toast: '免费复活 ×1' }
  };
})();
