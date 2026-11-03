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
  // innerWidth 会取整。页面被缩放时退回 innerWidth。
  function viewportSize() {
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) < 0.01) return { w: vv.width, h: vv.height };
    return { w: window.innerWidth, h: window.innerHeight };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const size = viewportSize();
    const pixelW = Math.round(size.w * dpr);
    const pixelH = Math.round(size.h * dpr);
    readSafeArea();
    // 尺寸没变时不重设画布：重设会清空内容，visualViewport 事件又很频繁
    if (pixelW !== canvas.width || pixelH !== canvas.height || dpr !== Screen.dpr) {
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
