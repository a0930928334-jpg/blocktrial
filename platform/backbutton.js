// 安卓返回键和退出应用。只有打包成 APK 时才生效，网页版和以后的微信版不需要。
(function () {
  'use strict';

  function appPlugin() {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins.App ? cap.Plugins.App : null;
  }

  BG.BackButton = {
    init: function (handler) {
      const app = appPlugin();
      if (app) app.addListener('backButton', handler);
    },

    exit: function () {
      const app = appPlugin();
      if (app) app.exitApp();
    }
  };
})();
