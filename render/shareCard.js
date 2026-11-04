// 成绩炫耀图：把一局的成绩画成一张可以分享的图。只在点开时画一次，结果存在离屏画布上。
// - 分享不能给任何奖励，这里也不要改游戏数据。
// - 文字放大直接算字号，不要用 ctx.scale，否则 iPhone 上可能发虚。
// - 1080 宽的图在手机上约缩到 1/3，普通文字不小于 MIN_FONT。放不下就改布局，不要继续缩小。
(function () {
  'use strict';

  const WIDTH = 1080;
  const HEIGHT = 1440;
  const PAD = 72;
  const MIN_FONT = 32;

  const MODES = { classic: '经典', relic: '遗物', daily: '每日挑战', duo: '双人' };

  // 每日挑战的种子就是当天日期 yyyymmdd
  function dailyDate(seed) {
    const s = String(seed);
    return s.slice(0, 4) + '.' + s.slice(4, 6) + '.' + s.slice(6, 8);
  }

  // record：game.record() 的返回值，再加 { best, isRecord, rank（双人是 null）, board }
  function drawShareCard(ctx, width, height, record) {
    const T = BG.Theme;
    const D = BG.Draw;
    const theme = BG.Stages.themeOf(record.stage || 1);
    const innerW = width - PAD * 2;
    const duo = record.mode === 'duo' && record.duo ? record.duo : null;

    function fitSize(text, max, size, min, bold) {
      ctx.font = T.font(size, bold);
      while (size > min && ctx.measureText(text).width > max) {
        size -= 1;
        ctx.font = T.font(size, bold);
      }
      return size;
    }
    function label(text, x, y, max, size, opts) {
      const o = opts || {};
      const str = String(text);
      D.text(ctx, str, x, y, { size: fitSize(str, max, size, MIN_FONT, o.bold), bold: o.bold, color: o.color, align: o.align });
    }
    function panel(x, y, w, h, color) {
      D.fillRound(ctx, x, y, w, h, 26, color || 'rgba(11, 14, 19, 0.54)');
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, theme.top);
    gradient.addColorStop(1, theme.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 3;
    for (let y = 36; y < height; y += 84) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + 28);
      ctx.stroke();
    }
    ctx.restore();

    // 标题
    const mode = MODES[record.mode] || MODES.classic;
    D.text(ctx, '方块试玩版', width / 2, 104, { size: 60, bold: true, align: 'center' });
    label(record.mode === 'daily' ? mode + ' · ' + dailyDate(record.seed) : mode, width / 2, 172, innerW, 40, { color: theme.glow, align: 'center', bold: true });

    // 分数：位数多时可以比普通文字大得多，所以单独算下限
    panel(PAD, 222, innerW, 340);
    D.text(ctx, duo ? '队伍总分' : '本局分数', width / 2, 272, { size: 34, color: T.textDim, align: 'center' });
    // 新纪录和段位排成一行，分数再长也不会碰到。都没有时分数放到中间
    const pills = [];
    if (record.isRecord) pills.push({ text: duo ? '双人新纪录！' : '新纪录！', bg: T.gold, color: '#2a1e04' });
    if (record.rank && record.rank.name) pills.push({ text: '段位 · ' + record.rank.name, bg: 'rgba(255, 194, 60, 0.18)', color: T.gold });
    const score = String(record.score || 0);
    D.text(ctx, score, width / 2, pills.length > 0 ? 390 : 425, { size: fitSize(score, innerW - 80, 150, 72, true), bold: true, align: 'center' });
    ctx.font = T.font(36, true);
    pills.forEach(function (p) { p.w = ctx.measureText(p.text).width + 56; });
    const pillsW = pills.reduce(function (sum, p) { return sum + p.w; }, 0) + (pills.length - 1) * 20;
    let pillX = (width - pillsW) / 2;
    pills.forEach(function (p) {
      D.fillRound(ctx, pillX, 478, p.w, 64, 32, p.bg);
      D.text(ctx, p.text, pillX + p.w / 2, 510, { size: 36, bold: true, color: p.color, align: 'center' });
      pillX += p.w + 20;
    });

    // 用时、阶段、连击。用时和结算页一样
    const infoY = 590;
    panel(PAD, infoY, innerW, 160, 'rgba(11, 14, 19, 0.42)');
    const cols = [width / 2 - 300, width / 2, width / 2 + 300];
    const values = [D.timeText(record.durationMs || 0), record.stage || 1, record.maxCombo || 0];
    ['用时', '到达阶段', '最大连击'].forEach(function (name, i) {
      D.text(ctx, name, cols[i], infoY + 48, { size: 32, color: T.textDim, align: 'center' });
      label(values[i], cols[i], infoY + 112, 240, 48, { bold: true, align: 'center' });
    });

    let nextY = 778;
    if (duo) {
      // 两人的贡献
      const rowH = 130;
      panel(PAD, nextY, innerW, rowH * 2 + 28, 'rgba(11, 14, 19, 0.48)');
      const max = Math.max(duo.players[0].score, duo.players[1].score, 1);
      duo.players.forEach(function (p, i) {
        const rowY = nextY + 16 + i * rowH;
        const barX = PAD + 34;
        const barW = innerW - 68;
        D.fillRound(ctx, barX, rowY + 20, 28, 28, 14, T.duo[i]);
        label(p.name, barX + 44, rowY + 34, 540, 44, { color: T.duo[i], bold: true });
        label(p.score, width - PAD - 34, rowY + 34, 260, 52, { bold: true, align: 'right' });
        D.fillRound(ctx, barX, rowY + 76, barW, 22, 11, 'rgba(255, 255, 255, 0.08)');
        const fill = barW * p.score / max;
        if (fill >= 22) D.fillRound(ctx, barX, rowY + 76, fill, 22, 11, T.duo[i]);
      });
      nextY += rowH * 2 + 48;
    } else if ((record.relicOrder || []).length > 0) {
      // 遗物：遗物模式和每日挑战都有，一局最多 4 个
      panel(PAD, nextY, innerW, 270, 'rgba(11, 14, 19, 0.42)');
      D.text(ctx, '本局遗物', PAD + 34, nextY + 44, { size: 32, color: T.textDim });
      const colW = (innerW - 40) / 4;
      record.relicOrder.slice(0, 4).forEach(function (id, i) {
        const cx = PAD + 20 + colW * (i + 0.5);
        D.relicIcon(ctx, id, cx, nextY + 136, 112);
        label(BG.Relics.byId[id].name, cx, nextY + 232, colW - 12, 32, { align: 'center' });
      });
      nextY += 290;
    }

    // 最后的棋盘和挑战语，棋盘大小按剩下的空间算
    const size = Math.min(height - 48 - nextY - 24, 520);
    const boardX = width - PAD - 12 - size;
    const boardY = nextY + (height - nextY - size) / 2;
    const board = record.board;
    panel(boardX - 12, boardY - 12, size + 24, size + 24, 'rgba(11, 14, 19, 0.58)');
    const cell = size / 8;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const value = board[r * 8 + c];
        if (value < 0) D.fillRound(ctx, boardX + c * cell + 2, boardY + r * cell + 2, cell - 4, cell - 4, 5, theme.cellEmpty);
        else D.tile(ctx, boardX + c * cell, boardY + r * cell, cell, value);
      }
    }
    label('来挑战我吧', PAD, boardY + size / 2, boardX - 12 - PAD - 24, 64, { bold: true, color: theme.glow });
  }

  BG.ShareCard = { WIDTH: WIDTH, HEIGHT: HEIGHT, drawShareCard: drawShareCard };
})();
