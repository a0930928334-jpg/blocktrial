// 原创配色和字体。颜色编号和 core 里的方块颜色一一对应。
(function () {
  'use strict';

  const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

  BG.Theme = {
    bg: '#12161d',
    panel: '#1e2531',
    panelLight: '#2a3342',
    boardBg: '#0b0e13',
    cellEmpty: '#1a2029',
    line: '#3a4557',
    text: '#f2f5f9',
    textDim: '#a9b3c2',
    accent: '#2fc4b2',
    accentDark: '#1b8074',
    gold: '#ffc23c',
    danger: '#ff6b5e',
    dim: 'rgba(5, 7, 10, 0.72)',
    pieces: [
      { base: '#ff6b5e', light: '#ff9a90', dark: '#c9463b' }, // 珊瑚红
      { base: '#ffc23c', light: '#ffd97f', dark: '#c7901b' }, // 琥珀黄
      { base: '#3dd68c', light: '#7ce8b3', dark: '#25a267' }, // 翠绿
      { base: '#3fa9f5', light: '#80c7fa', dark: '#2379bc' }, // 天蓝
      { base: '#a77bf3', light: '#c6a8f8', dark: '#7a50c4' }, // 紫
      { base: '#f368b4', light: '#f89ccd', dark: '#bf4287' }  // 玫红
    ],
    font: function (size, bold) {
      return (bold ? 'bold ' : '') + size + 'px ' + FONT;
    }
  };
})();
