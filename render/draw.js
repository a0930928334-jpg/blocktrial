// 基础绘制：圆角方格、方块、文字、遗物几何图标。
(function () {
  'use strict';

  const T = BG.Theme;
  const snap = BG.Layout.snap;
  const snapDown = BG.Layout.snapDown;

  function roundPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  // 四条边都对齐到物理像素
  function fillRound(ctx, x, y, w, h, r, color) {
    const x0 = snap(x);
    const y0 = snap(y);
    const pw = snap(x + w) - x0;
    const ph = snap(y + h) - y0;
    if (pw <= 0 || ph <= 0) return;
    roundPath(ctx, x0, y0, pw, ph, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // 线宽取整到物理像素，并让线条整个落在像素格内
  function crispWidth(lineWidth) {
    return Math.max(snap(lineWidth), 1 / BG.Screen.dpr);
  }

  function strokeRound(ctx, x, y, w, h, r, lineWidth, color) {
    const lw = crispWidth(lineWidth);
    const x0 = snap(x);
    const y0 = snap(y);
    roundPath(ctx, x0 + lw / 2, y0 + lw / 2, snap(x + w) - x0 - lw, snap(y + h) - y0 - lw, r);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // 一个方格：底部深色阴影 + 主色 + 顶部高光
  function tile(ctx, x, y, size, color, opts) {
    const o = opts || {};
    const scale = o.scale === undefined ? 1 : o.scale;
    const s = size * scale;
    const px = snap(x + (size - s) / 2 + 1);
    const py = snap(y + (size - s) / 2 + 1);
    const inner = snap(x + (size + s) / 2 - 1) - px;
    if (inner <= 0) return;
    const pal = T.pieces[color];
    const r = inner * 0.2;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    fillRound(ctx, px, py, inner, inner, r, pal.dark);
    fillRound(ctx, px, py, inner, inner - Math.max(2, inner * 0.08), r, pal.base);
    fillRound(ctx, px + inner * 0.14, py + inner * 0.1, inner * 0.72, inner * 0.16, inner * 0.08, pal.light);
    if (o.flash) {
      ctx.globalAlpha = o.flash;
      fillRound(ctx, px, py, inner, inner, r, '#ffffff');
    }
    ctx.restore();
  }

  function piece(ctx, shape, color, x, y, cell, opts) {
    shape.cells.forEach(function (p) {
      tile(ctx, x + p[1] * cell, y + p[0] * cell, cell, color, opts);
    });
  }

  function text(ctx, str, x, y, opts) {
    const o = opts || {};
    const size = o.size || 16;
    ctx.font = T.font(size, o.bold);
    ctx.fillStyle = o.color || T.text;
    // 自己算出左端和基线再对齐到物理像素。交给 center、middle 的话，
    // 起点常常落在半像素上，字就发虚。y 是文字的垂直中线。
    const m = ctx.measureText(str);
    let left = x;
    if (o.align === 'center') left = x - m.width / 2;
    else if (o.align === 'right') left = x - m.width;
    // 基线用固定比例，汉字和数字的中心都约在基线上方 0.36 个字号，且各机型位置一致
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, snap(left), snap(y + size * 0.36));
  }

  // 中文按字折行，返回行数组
  function wrap(ctx, str, maxWidth, size, bold) {
    ctx.font = T.font(size, bold);
    const lines = [];
    let line = '';
    for (let i = 0; i < str.length; i++) {
      const next = line + str[i];
      // 标点不放到行首，宁可稍微超出一点
      const isPunct = '。，；：！？、）'.indexOf(str[i]) !== -1;
      if (ctx.measureText(next).width > maxWidth && line && !isPunct) {
        lines.push(line);
        line = str[i];
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // 遗物图标是 5×5 的迷你棋盘，直接画出规则。
  // # 亮格（加分型金色、道具型青色） n 普通方块 o 被清空的格子 . 空格
  const ICON_BOARDS = {
    crossCut: ['..#..', '..#..', '#####', '..#..', '..#..'],
    edge: ['#####', '#...#', '#...#', '#...#', '#####'],
    bigClear: ['.....', '#####', '#####', '#####', '.....'],
    comboUp: ['....#', '...##', '..###', '.####', '#####'],
    chain: ['#####', '.....', '#####', '.....', '.....'],
    timeBomb: ['nnnnn', 'nooon', 'nooon', 'nooon', 'nnnnn'],
    holdSlot: ['.....', '.ooo.', '.o#o.', '.ooo.', '.....'],
    smallPiece: ['.....', '.....', '..#..', '.....', '.....']
  };

  // opts: { flash: 0～1 白色闪光 }
  function relicIcon(ctx, id, cx, cy, rawSize, opts) {
    // 中心落在物理像素上、边长取偶数物理像素，内部格子才能继续对齐
    const center = { x: snap(cx), y: snap(cy) };
    const half = snapDown(rawSize / 2);
    const size = half * 2;
    const lit = BG.Relics.byId[id].type === 'score' ? T.gold : T.accent;
    fillRound(ctx, center.x - half, center.y - half, size, size, size * 0.18, T.boardBg);

    const rows = ICON_BOARDS[id];
    const cell = snapDown((size - size * 0.2) / rows.length);
    const startX = center.x - cell * rows.length / 2;
    const startY = center.y - cell * rows.length / 2;
    const gap = Math.max(cell * 0.14, 1 / BG.Screen.dpr);
    const inner = cell - gap;
    const radius = inner * 0.2;
    rows.forEach(function (row, r) {
      for (let c = 0; c < row.length; c++) {
        const x = startX + c * cell;
        const y = startY + r * cell;
        const mark = row[c];
        if (mark === '#') fillRound(ctx, x, y, inner, inner, radius, lit);
        else if (mark === 'n') fillRound(ctx, x, y, inner, inner, radius, T.textDim);
        else if (mark === 'o') strokeRound(ctx, x, y, inner, inner, radius, 1, lit);
        else fillRound(ctx, x, y, inner, inner, radius, T.cellEmpty);
      }
    });

    if (opts && opts.flash > 0) {
      ctx.save();
      ctx.globalAlpha = opts.flash;
      fillRound(ctx, center.x - half, center.y - half, size, size, size * 0.18, '#ffffff');
      ctx.restore();
    }
  }

  // 奖励图标：金色，和遗物的迷你棋盘区分开
  function rewardIcon(ctx, id, cx, cy, rawSize) {
    const half = snapDown(rawSize / 2);
    const x = snap(cx);
    const y = snap(cy);
    const s = half * 2;
    fillRound(ctx, x - half, y - half, s, s, s * 0.22, T.gold);
    const ink = '#2a1e04';
    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (id === 'swap') {
      // 上下两个方向相反的箭头
      [[-0.16, 1], [0.16, -1]].forEach(function (a) {
        const ay = y + s * a[0];
        const d = a[1];
        ctx.moveTo(x - s * 0.28 * d, ay);
        ctx.lineTo(x + s * 0.28 * d, ay);
        ctx.moveTo(x + s * 0.14 * d, ay - s * 0.12);
        ctx.lineTo(x + s * 0.28 * d, ay);
        ctx.lineTo(x + s * 0.14 * d, ay + s * 0.12);
      });
      ctx.stroke();
    } else {
      // 爱心
      ctx.moveTo(x, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.42, y + s * 0.02, x - s * 0.3, y - s * 0.32, x, y - s * 0.12);
      ctx.bezierCurveTo(x + s * 0.3, y - s * 0.32, x + s * 0.42, y + s * 0.02, x, y + s * 0.3);
      ctx.fill();
    }
    ctx.restore();
  }

  // 广告图标：圆角底上一个播放三角
  function adIcon(ctx, cx, cy, size, disabled) {
    const half = snapDown(size / 2);
    const x = snap(cx);
    const y = snap(cy);
    ctx.save();
    if (disabled) ctx.globalAlpha = 0.42;
    fillRound(ctx, x - half, y - half, half * 2, half * 2, 3, T.gold);
    ctx.beginPath();
    ctx.moveTo(x - half * 0.4, y - half * 0.55);
    ctx.lineTo(x + half * 0.6, y);
    ctx.lineTo(x - half * 0.4, y + half * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#2a1e04';
    ctx.fill();
    ctx.restore();
  }

  function timeText(ms) {
    const total = Math.round(ms / 1000);
    const sec = total % 60;
    return Math.floor(total / 60) + ':' + (sec < 10 ? '0' : '') + sec;
  }

  BG.Draw = {
    roundPath: roundPath,
    fillRound: fillRound,
    strokeRound: strokeRound,
    tile: tile,
    piece: piece,
    text: text,
    wrap: wrap,
    relicIcon: relicIcon,
    rewardIcon: rewardIcon,
    adIcon: adIcon,
    timeText: timeText
  };
})();
