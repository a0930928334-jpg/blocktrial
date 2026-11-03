// 复制到剪贴板。移植微信时换成 wx.setClipboardData。
// 局域网 HTTP 不是安全上下文，navigator.clipboard 不可用，退回隐藏 textarea。
// 这是整个项目里除 canvas 外唯一用到的 DOM，只用来复制，不显示界面。
(function () {
  'use strict';

  function copyWithTextarea(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px;';
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  // 最后的兜底：弹出系统输入框让玩家手动全选复制
  function manualCopy(text, ok) {
    if (!ok) window.prompt('自动复制失败，请手动全选复制：', text);
    return ok;
  }

  BG.Clipboard = {
    // 返回 Promise<boolean>
    copy: function (text) {
      if (window.isSecureContext && window.navigator.clipboard) {
        return window.navigator.clipboard.writeText(text).then(
          function () { return true; },
          function () { return manualCopy(text, copyWithTextarea(text)); }
        );
      }
      return Promise.resolve(manualCopy(text, copyWithTextarea(text)));
    }
  };
})();
