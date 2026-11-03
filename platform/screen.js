// 屏幕：canvas、devicePixelRatio、安全区、禁止滚动和缩放。
// 移植微信时替换：用 wx.createCanvas 和 wx.getSystemInfoSync。
(function () {
  'use strict';

  let canvas = null;
  let ctx = null;
  let probe = null;
  let onResize = null;

  const Screen = { width: 0, height: 0, dpr: 1, safe: { top: 0, right: 0, bottom: 0, left: 0 } };

  function createProbe() {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }

  function readSafeArea() {
    const style = window.getComputedStyle(probe);
    // APK 里由原生层提供刘海数值，部分 WebView 的 env() 读不到
    const native = window.BlockTrialNative ? window.BlockTrialNative.safeArea().split(',').map(Number) : [0, 0, 0, 0];
    Screen.safe = {
      top: Math.max(parseFloat(style.paddingTop) || 0, native[0]),
      right: Math.max(parseFloat(style.paddingRight) || 0, native[1]),
      bottom: Math.max(parseFloat(style.paddingBottom) || 0, native[2]),
      left: Math.max(parseFloat(style.paddingLeft) || 0, native[3])
    };
  }

  // 优先用 visualViewport：它给的是真实宽高（安卓常见 392.7 这样的小数），
  // innerWidth 会取整。页面被缩放时 visualViewport 和 iOS 的 innerWidth 都只剩可见部分，
  // 要用布局视口的大小，它不随缩放变化。
  function viewportSize() {
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) < 0.01) return { w: vv.width, h: vv.height };
    const root = document.documentElement;
    return { w: root.clientWidth || window.innerWidth, h: root.clientHeight || window.innerHeight };
  }

  // 页面被意外放大时，浏览器会把画布再放大一次，字就糊了。
  // 所以画布像素要跟着乘上缩放倍数，同时不超过上限。
  function targetDpr(size) {
    const ui = BG.Config.ui;
    const vv = window.visualViewport;
    const zoom = vv && vv.scale > 1.01 ? vv.scale : 1;
    let dpr = Math.min((window.devicePixelRatio || 1) * zoom, ui.maxDpr);
    const pixels = size.w * size.h * dpr * dpr;
    if (pixels > ui.maxCanvasPixels) dpr *= Math.sqrt(ui.maxCanvasPixels / pixels);
    return dpr;
  }

  function changed(size, dpr) {
    return Math.round(size.w * dpr) !== canvas.width || Math.round(size.h * dpr) !== canvas.height || dpr !== Screen.dpr;
  }

  function resize() {
    const size = viewportSize();
    const dpr = targetDpr(size);
    const pixelW = Math.round(size.w * dpr);
    const pixelH = Math.round(size.h * dpr);
    readSafeArea();
    // 尺寸没变时不重设画布：重设会清空内容，visualViewport 事件又很频繁
    if (changed(size, dpr)) {
      // 物理像素必须是整数，所以 CSS 尺寸由它反推，
      // 保证 canvas 像素 = CSS 尺寸 × dpr，浏览器不会再做一次缩放
      Screen.dpr = dpr;
      Screen.width = pixelW / dpr;
      Screen.height = pixelH / dpr;
      canvas.style.width = Screen.width + 'px';
      canvas.style.height = Screen.height + 'px';
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    if (onResize) onResize();
  }

  // dpr 变化（系统显示缩放、手机投屏）不一定触发 resize，单独监听
  function watchDpr() {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    if (!query.addEventListener) return;
    query.addEventListener('change', function () {
      resize();
      watchDpr();
    }, { once: true });
  }

  function blockBrowserGestures() {
    const stop = function (e) { e.preventDefault(); };
    // iOS Safari 的双指缩放
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    // 滚动、下拉刷新、双击缩放
    document.addEventListener('touchmove', stop, { passive: false });
    document.addEventListener('contextmenu', stop);
  }

  Screen.init = function (canvasId, resizeHandler) {
    canvas = document.getElementById(canvasId);
    // 每帧都铺满背景，不需要透明通道；不透明画布的文字抗锯齿更清晰
    ctx = canvas.getContext('2d', { alpha: false });
    onResize = resizeHandler;
    createProbe();
    blockBrowserGestures();
    window.addEventListener('resize', resize);
    window.addEventListener('pageshow', resize);
    window.addEventListener('orientationchange', function () {
      // iOS 转屏后尺寸要过一会儿才稳定
      setTimeout(resize, 100);
      setTimeout(resize, 500);
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    watchDpr();
    resize();
  };

  // 每帧检查一次：iOS 有时不发事件（切后台回来、地址栏收起、意外缩放），画布就和屏幕对不上了
  Screen.sync = function () {
    const size = viewportSize();
    if (changed(size, targetDpr(size))) resize();
  };

  // 调试面板用：确认画布没有被放大显示
  Screen.info = function () {
    const vv = window.visualViewport;
    const canvases = document.getElementsByTagName('canvas');
    let pixels = 0;
    for (let i = 0; i < canvases.length; i++) pixels += canvases[i].width * canvases[i].height;
    return {
      dpr: Screen.dpr,
      rawDpr: window.devicePixelRatio || 1,
      pixelW: canvas.width,
      pixelH: canvas.height,
      cssW: Screen.width,
      cssH: Screen.height,
      vvScale: vv ? vv.scale : null,
      canvases: canvases.length,
      pixels: pixels,
      // Safari 的"aA 页面缩放"不改 dpr，也不改 vv.scale，只能这样估计。约等于 1 才正常
      pageZoom: window.screen && window.innerWidth ? window.screen.width / window.innerWidth : null
    };
  };

  Screen.canvas = function () { return canvas; };
  Screen.context = function () { return ctx; };

  // 读取 URL 参数，调试面板用
  Screen.query = function (name) {
    const match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1]) : null;
  };

  Screen.onFrame = function (fn) {
    window.requestAnimationFrame(fn);
  };

  BG.Screen = Screen;
})();
