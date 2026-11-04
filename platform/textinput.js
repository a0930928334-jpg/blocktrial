// 文字输入：盖在画布上的输入框，点确定、回车或点到别处都算确认。
// 移植微信时换成 wx.showKeyboard，在 onKeyboardConfirm 里 resolve。
(function () {
  'use strict';

  let closing = null;

  BG.TextInput = {
    // 返回 Promise，结果是输入的文字
    ask: function (value, maxLength) {
      return new Promise(function (resolve) {
        const wrap = document.createElement('div');
        wrap.id = 'bg-text-input';
        wrap.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(5,7,10,0.6);display:flex;justify-content:center;align-items:flex-start;padding-top:22vh;z-index:10;touch-action:auto;';
        const box = document.createElement('div');
        box.style.cssText = 'display:flex;gap:8px;padding:12px;background:#1e2531;border-radius:14px;';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        // 字号不小于 16，iPhone 才不会自动放大页面
        input.style.cssText = 'width:150px;height:44px;box-sizing:border-box;padding:0 10px;font-size:18px;color:#f2f5f9;background:#2a3342;border:0;border-radius:10px;outline:none;-webkit-user-select:text;user-select:text;touch-action:auto;';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = '确定';
        ok.style.cssText = 'width:72px;height:44px;font-size:16px;font-weight:bold;color:#0b2b27;background:#2fc4b2;border:0;border-radius:10px;touch-action:manipulation;';
        box.appendChild(input);
        box.appendChild(ok);
        wrap.appendChild(box);
        document.body.appendChild(wrap);

        let composing = false;
        const limit = function () {
          if (composing) return;
          const chars = Array.from(input.value);
          if (chars.length > maxLength) input.value = chars.slice(0, maxLength).join('');
        };
        input.addEventListener('compositionstart', function () { composing = true; });
        input.addEventListener('compositionend', function () { composing = false; limit(); });
        input.addEventListener('input', limit);

        let done = false;
        const finish = function () {
          if (done) return;
          done = true;
          composing = false;
          limit();
          const text = input.value;
          closing = null;
          document.body.removeChild(wrap);
          window.scrollTo(0, 0);
          resolve(text);
        };
        closing = finish;
        ok.addEventListener('click', finish);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) finish(); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') finish(); });
        input.focus();
        input.select();
      });
    },

    active: function () {
      return !!closing;
    },

    // 安卓返回键：当作确认
    close: function () {
      if (closing) closing();
    }
  };
})();
