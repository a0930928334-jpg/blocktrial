// 存储接口：get/set。移植微信时换成 wx.getStorageSync / wx.setStorageSync。
(function () {
  'use strict';

  const PREFIX = 'fangkuai_';
  const memory = {};

  BG.Storage = {
    get: function (key, fallback) {
      let raw = null;
      try {
        raw = window.localStorage.getItem(PREFIX + key);
      } catch (e) {
        raw = null;
      }
      if (raw === null && key in memory) raw = memory[key];
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },

    set: function (key, value) {
      const raw = JSON.stringify(value);
      memory[key] = raw;
      try {
        window.localStorage.setItem(PREFIX + key, raw);
      } catch (e) {
        // 隐私模式或存储已满时只保留在内存里
      }
    }
  };
})();
