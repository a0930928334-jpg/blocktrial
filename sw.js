// 离线缓存。VERSION 和 FILES 由 tools/bump-version.js 更新，不要手改。
// 版本号一变，这个文件内容就变，浏览器会在后台安装新版本，然后等玩家在主菜单点"更新"才接管。
const VERSION = '0.1.14';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'config.js?v=0.1.14',
  'version.js?v=0.1.14',
  'core/rng.js?v=0.1.14',
  'core/shapes.js?v=0.1.14',
  'core/board.js?v=0.1.14',
  'core/scoring.js?v=0.1.14',
  'core/relics.js?v=0.1.14',
  'core/generator.js?v=0.1.14',
  'core/dealer.js?v=0.1.14',
  'core/stats.js?v=0.1.14',
  'core/rank.js?v=0.1.14',
  'core/game.js?v=0.1.14',
  'platform/screen.js?v=0.1.14',
  'platform/storage.js?v=0.1.14',
  'platform/audio.js?v=0.1.14',
  'platform/vibrate.js?v=0.1.14',
  'platform/clipboard.js?v=0.1.14',
  'platform/ads.js?v=0.1.14',
  'platform/leaderboard.js?v=0.1.14',
  'platform/backbutton.js?v=0.1.14',
  'platform/pwa.js?v=0.1.14',
  'input/pointer.js?v=0.1.14',
  'render/theme.js?v=0.1.14',
  'render/layout.js?v=0.1.14',
  'render/anim.js?v=0.1.14',
  'render/scorefx.js?v=0.1.14',
  'render/stages.js?v=0.1.14',
  'render/celebrate.js?v=0.1.14',
  'render/shareCard.js?v=0.1.14',
  'render/draw.js?v=0.1.14',
  'render/ui.js?v=0.1.14',
  'render/scenes/menu.js?v=0.1.14',
  'render/scenes/play.js?v=0.1.14',
  'render/scenes/relicPick.js?v=0.1.14',
  'render/scenes/stuck.js?v=0.1.14',
  'render/scenes/pause.js?v=0.1.14',
  'render/scenes/result.js?v=0.1.14',
  'render/scenes/stats.js?v=0.1.14',
  'render/scenes/settings.js?v=0.1.14',
  'render/scenes/debug.js?v=0.1.14',
  'main.js?v=0.1.14'
];
// v0.1.6 及以前的缓存名是 blocktrial-版本号，那些页面只会等新版本自动接管，不会发消息
const CACHE = 'blocktrial-v2-' + VERSION;
const OLD_PROTOCOL = /^blocktrial-\d/;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 绕过 HTTP 缓存，确保存进去的是这个版本的文件
      return cache.addAll(FILES.map(function (url) { return new Request(url, { cache: 'reload' }); }));
    }).then(function () {
      return caches.keys();
    }).then(function (keys) {
      // 从老版本升级时直接接管，否则已经开着的老页面永远等不到更新
      if (keys.some(function (key) { return OLD_PROTOCOL.test(key); })) return self.skipWaiting();
      return undefined;
    })
  );
});

self.addEventListener('message', function (event) {
  const data = event.data || {};
  if (data.type === 'version' && event.ports[0]) event.ports[0].postMessage(VERSION);
  if (data.type === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf('blocktrial-') === 0 && key !== CACHE;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  // 打开页面时优先取网络，才能拿到新版本的 index.html；断网时用缓存。
  // no-cache 表示要向服务器确认，否则托管平台的 HTTP 缓存会让人继续看到旧版本
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache' }).catch(function () {
        return caches.match('index.html', { cacheName: CACHE });
      })
    );
    return;
  }

  // 脚本地址带 ?v=版本号，可以放心优先用缓存
  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then(function (hit) {
      return hit || fetch(request);
    })
  );
});
