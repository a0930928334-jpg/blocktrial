// 网页应用：manifest 和离线缓存。只在网址是 http(s) 的网页版生效，
// 双击打开 index.html 和安卓 APK 里都不启用，以后的微信版也不需要。
(function () {
  'use strict';

  let updateReady = false;

  function supported() {
    if (window.location.protocol !== 'https:' && window.location.protocol !== 'http:') return false;
    return !window.Capacitor;
  }

  function addManifest() {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.appendChild(link);
  }

  BG.Pwa = {
    init: function () {
      if (!supported()) return;
      addManifest();
      if (!('serviceWorker' in window.navigator)) return;
      const sw = window.navigator.serviceWorker;
      const hadController = !!sw.controller;
      // 新版本接管后不马上刷新，避免打断正在玩的一局，等回到菜单时再刷新
      sw.addEventListener('controllerchange', function () {
        if (hadController) updateReady = true;
      });
      sw.register('sw.js').catch(function () {
        // 注册失败时游戏照常运行，只是没有离线能力
      });
    },

    // 主菜单每帧调用：有新版本就刷新
    reloadIfUpdated: function () {
      if (!updateReady) return;
      updateReady = false;
      window.location.reload();
    }
  };
})();
