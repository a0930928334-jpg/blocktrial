// 按屏幕尺寸和安全区计算游戏界面布局，单位是逻辑像素。
(function () {
  'use strict';

  const GUTTER = 12;
  const HEADER_H = 58;
  const PROGRESS_H = 32;
  const RELIC_ROW_H = 46;
  const TOOLS_H = 56;
  const TURN_H = 38;

  // 对齐到最近的物理像素，dpr 是 2.75 这样的小数时也成立
  function snap(v) {
    const d = BG.Screen.dpr;
    return Math.round(v * d) / d;
  }

  // 向下取整到物理像素，用于格子大小：格子是整数物理像素，相邻格才不会一宽一窄
  function snapDown(v) {
    const d = BG.Screen.dpr;
    return Math.floor(v * d + 1e-6) / d;
  }

  function compute(screen, relicMode, duo) {
    const safe = screen.safe;
    const usableW = screen.width - safe.left - safe.right - GUTTER * 2;
    const cw = Math.min(usableW, BG.Config.ui.maxColumn);
    const x = safe.left + GUTTER + (usableW - cw) / 2;

    let y = safe.top + 6;
    const header = { x: x, y: y, w: cw, h: HEADER_H };
    y += HEADER_H;
    let progress = null;
    let relicRow = null;
    if (relicMode) {
      progress = { x: x, y: y, w: cw, h: PROGRESS_H };
      y += PROGRESS_H;
      relicRow = { x: x, y: y, w: cw, h: RELIC_ROW_H };
      y += RELIC_ROW_H;
    }
    let turn = null;
    if (duo) {
      turn = { x: x, y: y, w: cw, h: TURN_H };
      y += TURN_H;
    }

    const bottom = screen.height - safe.bottom - 6;
    const tools = { x: x, y: bottom - TOOLS_H, w: cw, h: TOOLS_H };
    const trayH = Math.max(84, Math.min(130, screen.height * 0.16));
    const tray = { x: x, y: tools.y - trayH - 4, w: cw, h: trayH };

    const avail = tray.y - y - 12;
    const n = BG.Config.board.size;
    const cell = snapDown(Math.min(cw, avail) / n);
    const size = cell * n;
    const board = {
      x: snap(x + (cw - size) / 2),
      y: snap(y + 6 + (avail - size) / 2),
      cell: cell,
      size: size
    };

    return { cw: cw, x: x, header: header, progress: progress, relicRow: relicRow, turn: turn, board: board, tray: tray, tools: tools };
  }

  // 托盘每个位置的矩形和缩略图格子大小
  function traySlots(L, count) {
    const w = L.tray.w / count;
    const cell = snapDown(Math.min(L.board.cell * 0.62, (Math.min(w, L.tray.h) - 12) / 5));
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({ x: L.tray.x + i * w, y: L.tray.y, w: w, h: L.tray.h, cell: cell });
    }
    return out;
  }

  BG.Layout = { compute: compute, traySlots: traySlots, snap: snap, snapDown: snapDown };
})();
