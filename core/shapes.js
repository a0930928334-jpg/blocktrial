// 形状库。方块不能旋转，不同朝向算不同形状。
// 1x3 表示 1 行 3 列（横条），3x1 表示 3 行 1 列（竖条）。
(function () {
  'use strict';

  const DEFS = {
    '1x1': ['X'],
    '1x2': ['XX'],
    '2x1': ['X', 'X'],
    '1x3': ['XXX'],
    '3x1': ['X', 'X', 'X'],
    '1x4': ['XXXX'],
    '4x1': ['X', 'X', 'X', 'X'],
    '1x5': ['XXXXX'],
    '5x1': ['X', 'X', 'X', 'X', 'X'],
    '2x2': ['XX', 'XX'],
    '3x3': ['XXX', 'XXX', 'XXX'],
    // 小 L（3 格）
    'L3a': ['X.', 'XX'],
    'L3b': ['.X', 'XX'],
    'L3c': ['XX', 'X.'],
    'L3d': ['XX', '.X'],
    // 大 L（5 格，3×3 外框）
    'L5a': ['X..', 'X..', 'XXX'],
    'L5b': ['..X', '..X', 'XXX'],
    'L5c': ['XXX', 'X..', 'X..'],
    'L5d': ['XXX', '..X', '..X'],
    // T 形（4 格）
    'T4a': ['XXX', '.X.'],
    'T4b': ['.X.', 'XXX'],
    'T4c': ['X.', 'XX', 'X.'],
    'T4d': ['.X', 'XX', '.X']
  };

  const list = Object.keys(DEFS).map(function (id) {
    const rows = DEFS[id];
    const cells = [];
    // masks：每行的位掩码，第 c 列对应第 c 位，发牌评估时用
    const masks = [];
    rows.forEach(function (row, r) {
      let mask = 0;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === 'X') {
          cells.push([r, c]);
          mask |= 1 << c;
        }
      }
      masks.push(mask);
    });
    return { id: id, cells: cells, masks: masks, h: rows.length, w: rows[0].length, count: cells.length };
  });

  const byId = {};
  list.forEach(function (s) { byId[s.id] = s; });

  BG.Shapes = { list: list, byId: byId };
})();
