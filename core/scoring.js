// 计分与连击。
// 本次得分 = 四舍五入[(放置分 + 消除分 + 奖励分) × 大消除倍率]
(function () {
  'use strict';

  function lineBase(n, cfg) {
    const table = cfg.score.lineTable;
    if (n < table.length) return table[n];
    return table[table.length - 1] + (n - table.length + 1) * cfg.score.extraPerLine;
  }

  // doubled：有"连击"遗物时，加成部分再乘倍数
  function comboMultiplier(combo, cfg, doubled) {
    if (combo <= 1) return 1;
    const step = cfg.combo.stepBonus * (doubled ? cfg.relic.comboBonusMult : 1);
    return 1 + step * (combo - 1);
  }

  function formatNumber(v) {
    return String(Math.round(v * 10) / 10);
  }

  // input: { cellCount, lines, combo, prevCleared, has(id) }，combo 是计入本次消除之后的值，
  // prevCleared 表示上一步也有消除
  // triggers：本次真正生效的遗物 id；details：每个遗物的印章和算式，用于反馈
  function compute(input, cfg) {
    const has = input.has;
    const rc = cfg.relic;
    const n = input.lines.length;
    const triggers = [];
    const details = {};
    const note = function (id, stamp, formula) {
      triggers.push(id);
      details[id] = { stamp: stamp, formula: formula };
    };

    const placement = input.cellCount * cfg.score.perCell;

    // 基础分平均分到每条线，方便边线倍率按线生效
    const base = n > 0 ? lineBase(n, cfg) / n : 0;
    let lineSum = 0;
    let edgeBase = 0;
    input.lines.forEach(function (line) {
      let score = base;
      if (has('edge') && (line.index === 0 || line.index === cfg.board.size - 1)) {
        score *= rc.edgeMult;
        edgeBase += base;
      }
      lineSum += score;
    });
    if (edgeBase > 0) {
      note('edge', '×' + rc.edgeMult, formatNumber(edgeBase) + ' ×' + rc.edgeMult + ' = ' + formatNumber(edgeBase * rc.edgeMult));
    }

    const comboMult = n > 0 ? comboMultiplier(input.combo, cfg, has('comboUp')) : 1;
    const clear = lineSum * comboMult;
    if (has('comboUp') && n > 0 && input.combo >= 2) {
      note('comboUp', '×' + formatNumber(comboMult), formatNumber(lineSum) + ' ×' + formatNumber(comboMult) + ' = ' + formatNumber(clear));
    }

    let bonus = 0;
    const hasRow = input.lines.some(function (l) { return l.type === 'row'; });
    const hasCol = input.lines.some(function (l) { return l.type === 'col'; });
    if (has('crossCut') && hasRow && hasCol) {
      const before = placement + clear;
      bonus += rc.crossBonus;
      note('crossCut', '+' + rc.crossBonus, formatNumber(before) + ' +' + rc.crossBonus + ' = ' + formatNumber(before + rc.crossBonus));
    }
    if (has('chain') && n > 0 && input.prevCleared) {
      const before = placement + clear + bonus;
      bonus += rc.chainBonus;
      note('chain', '+' + rc.chainBonus, formatNumber(before) + ' +' + rc.chainBonus + ' = ' + formatNumber(before + rc.chainBonus));
    }

    let mult = 1;
    if (has('bigClear') && n >= rc.bigClearMinLines) {
      mult = rc.bigClearMult;
      const before = placement + clear + bonus;
      note('bigClear', '×' + mult, formatNumber(before) + ' ×' + mult + ' = ' + formatNumber(before * mult));
    }

    return {
      placement: placement,
      clear: clear,
      bonus: bonus,
      comboMult: comboMult,
      mult: mult,
      total: Math.round((placement + clear + bonus) * mult),
      triggers: triggers,
      details: details
    };
  }

  BG.Scoring = { lineBase: lineBase, comboMultiplier: comboMultiplier, compute: compute };
})();
