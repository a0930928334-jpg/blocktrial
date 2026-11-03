// 震动。移植微信时换成 wx.vibrateShort。iOS Safari 不支持，静默跳过。
(function () {
  'use strict';

  let enabled = true;

  BG.Vibrate = {
    setEnabled: function (value) {
      enabled = value;
    },

    short: function (ms) {
      if (!enabled || !window.navigator || !window.navigator.vibrate) return;
      try {
        window.navigator.vibrate(ms);
      } catch (e) {
        // 个别浏览器在没有用户操作时会抛错
      }
    }
  };
})();
