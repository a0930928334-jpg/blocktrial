// 成绩炫耀图：把一局的成绩画成一张可以分享的图。现在是空的，内容之后再写。
// 只在这个文件里写，脚本已登记在 index.html 和 sw.js。
// - 分享不能给任何奖励，这里也不要改游戏数据。
// - 文字放大直接算字号，不要用 ctx.scale，否则 iPhone 上可能发虚。
(function () {
  'use strict';

  // ctx：要画到的 Canvas 2D 上下文；width、height：画布的逻辑尺寸；
  // record：一局的记录，也就是 game.record() 的返回值，字段见 core/game.js
  function drawShareCard(ctx, width, height, record) {
  }

  BG.ShareCard = { drawShareCard: drawShareCard };
})();
