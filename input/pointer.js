// 把触摸和鼠标统一成 down/move/up 三种事件：{ type, x, y }，坐标是逻辑像素。
// 只跟踪第一根手指。移植微信时换成 wx.onTouchStart / onTouchMove / onTouchEnd。
(function () {
  'use strict';

  BG.Input = {
    init: function (canvas, handler) {
      let touchId = null;
      let mouseDown = false;
      let lastTouchTime = 0;

      function send(type, clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        handler({ type: type, x: clientX - rect.left, y: clientY - rect.top });
      }

      function findTouch(list) {
        for (let i = 0; i < list.length; i++) {
          if (list[i].identifier === touchId) return list[i];
        }
        return null;
      }

      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        lastTouchTime = Date.now();
        if (touchId !== null) return;
        const t = e.changedTouches[0];
        touchId = t.identifier;
        send('down', t.clientX, t.clientY);
      }, { passive: false });

      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        const t = findTouch(e.changedTouches);
        if (t) send('move', t.clientX, t.clientY);
      }, { passive: false });

      function endTouch(e) {
        e.preventDefault();
        lastTouchTime = Date.now();
        const t = findTouch(e.changedTouches);
        if (!t) return;
        touchId = null;
        send('up', t.clientX, t.clientY);
      }
      canvas.addEventListener('touchend', endTouch, { passive: false });
      canvas.addEventListener('touchcancel', endTouch, { passive: false });

      // 触摸之后浏览器可能补发鼠标事件，这里过滤掉
      function isGhostMouse() {
        return Date.now() - lastTouchTime < 800;
      }

      canvas.addEventListener('mousedown', function (e) {
        if (isGhostMouse()) return;
        mouseDown = true;
        send('down', e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', function (e) {
        if (mouseDown) send('move', e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', function (e) {
        if (!mouseDown) return;
        mouseDown = false;
        send('up', e.clientX, e.clientY);
      });
    }
  };
})();
