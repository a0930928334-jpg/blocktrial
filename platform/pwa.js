// 网页应用：manifest、离线缓存、新版本提示。只在网址是 http(s) 的网页版生效，
// 双击打开 index.html 和安卓 APK 里都不启用，以后的微信版也不需要。
(function () {
  'use strict';

  let registration = null;
  let lastCheck = 0;
  let available = null;   // 可以更新到的版本号，没有时为 null
  let waitingWorker = null;
  let updating = false;

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

  function askVersion(worker) {
    return new Promise(function (resolve) {
      const channel = new MessageChannel();
      const timer = setTimeout(function () { resolve(null); }, 2000);
      channel.port1.onmessage = function (e) {
        clearTimeout(timer);
        resolve(e.data);
      };
      worker.postMessage({ type: 'version' }, [channel.port2]);
    });
  }

  // 打开页面总是优先取网络，所以页面可能已经是新版本，只有缓存还没换。
  // 这时悄悄换掉缓存，不需要提示；页面确实比它旧时，才提示更新。
  function inspectWaiting(worker) {
    askVersion(worker).then(function (version) {
      if (!version) return;
      if (version === BG.Version.name) {
        worker.postMessage({ type: 'skipWaiting' });
        return;
      }
      waitingWorker = worker;
      available = version;
    });
  }

  function watchInstalling(worker, sw) {
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && sw.controller) inspectWaiting(worker);
    });
  }

  function onControllerChange(sw) {
    if (updating) {
      window.location.reload();
      return;
    }
    // 别的标签页已经更新了，这一页还是旧的
    if (!sw.controller) return;
    askVersion(sw.controller).then(function (version) {
      if (version && version !== BG.Version.name) {
        waitingWorker = null;
        available = version;
      }
    });
  }

  function check(sw) {
    lastCheck = Date.now();
    if (registration) registration.update().catch(function () {
      // 断网时检查失败，下次再试
    });
    return sw;
  }

  BG.Pwa = {
    init: function () {
      if (!supported()) return;
      addManifest();
      if (!('serviceWorker' in window.navigator)) return;
      const sw = window.navigator.serviceWorker;
      sw.addEventListener('controllerchange', function () { onControllerChange(sw); });
      // 手机上的网页应用切回前台时不会重新打开页面，要主动检查
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check(sw);
      });
      sw.register('sw.js').then(function (reg) {
        registration = reg;
        lastCheck = Date.now();
        if (reg.waiting && sw.controller) inspectWaiting(reg.waiting);
        if (reg.installing) watchInstalling(reg.installing, sw);
        reg.addEventListener('updatefound', function () {
          if (reg.installing) watchInstalling(reg.installing, sw);
        });
      }).catch(function () {
        // 注册失败时游戏照常运行，只是没有离线能力
      });
    },

    // 主菜单每帧调用，隔一段时间问一次服务器有没有新版本
    checkForUpdate: function () {
      if (!registration || Date.now() - lastCheck < BG.Config.ui.updateCheckMs) return;
      check(window.navigator.serviceWorker);
    },

    // 主菜单用来显示提示。游戏进行中没有地方读它，所以不会打断对局
    availableVersion: function () {
      return available;
    },

    isUpdating: function () {
      return updating;
    },

    // 玩家点了更新：新版本接管后立即刷新。接管事件迟迟不来时也要刷新，不能卡住
    applyUpdate: function () {
      if (updating) return;
      updating = true;
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'skipWaiting' });
        setTimeout(function () { window.location.reload(); }, 3000);
      } else {
        window.location.reload();
      }
    }
  };
})();
