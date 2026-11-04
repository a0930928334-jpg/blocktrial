// 成绩图的离屏画布和保存。分享和保存都不给任何奖励，这里也不碰游戏数据。
// 移植微信时的替换方式见 README 的"移植微信"一节。
(function () {
  'use strict';

  const OVERLAY_ID = 'bg-share-overlay';
  const FILE_NAME = 'blocktrial-score.png';
  // 页面为了防误触，整体禁用了长按菜单和选中，图片上要恢复，否则 iPhone 长按存不了
  const IMG_STYLE = 'display:block;max-width:100%;max-height:calc(100vh - 150px);border-radius:12px;pointer-events:auto;touch-action:auto;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;';
  const BUTTON_STYLE = 'box-sizing:border-box;display:inline-block;min-width:96px;height:44px;line-height:44px;padding:0 16px;text-align:center;font-size:16px;font-weight:bold;border:0;border-radius:10px;text-decoration:none;';

  let close = null;

  // 有鼠标的设备才显示下载。手机上长按图片保存
  function hasMouse() {
    return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }

  function button(tag, text, background, color) {
    const el = document.createElement(tag);
    el.textContent = text;
    el.style.cssText = BUTTON_STYLE + 'background:' + background + ';color:' + color + ';';
    return el;
  }

  BG.Platform = {
    createCanvas: function (width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },

    // iPhone Safari 长按画布不能保存，所以转成图片元素显示在覆盖层上
    saveShareImage: function (canvas) {
      if (close) close();
      const url = canvas.toDataURL('image/png');
      const wrap = document.createElement('div');
      wrap.id = OVERLAY_ID;
      wrap.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:20;box-sizing:border-box;padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,7,10,0.94);color:#f2f5f9;font-size:16px;touch-action:auto;';

      const img = document.createElement('img');
      img.setAttribute('style', IMG_STYLE);
      img.alt = '成绩图';
      img.src = url;

      const tip = document.createElement('div');
      tip.textContent = '长按图片保存';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;';
      const shut = button('button', '关闭', '#2a3342', '#f2f5f9');
      shut.type = 'button';
      shut.setAttribute('data-close', '1');
      row.appendChild(shut);
      if (hasMouse()) {
        const save = button('a', '下载', '#2fc4b2', '#0b2b27');
        save.href = url;
        save.setAttribute('download', FILE_NAME);
        row.appendChild(save);
      }

      wrap.appendChild(img);
      wrap.appendChild(tip);
      wrap.appendChild(row);
      document.body.appendChild(wrap);

      close = function () {
        close = null;
        document.body.removeChild(wrap);
      };
      shut.addEventListener('click', function () { close(); });
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    },

    shareOverlayActive: function () {
      return !!close;
    },

    closeShareOverlay: function () {
      if (close) close();
    }
  };
})();
