// 可设种子的随机数（mulberry32）。core 里所有随机都走这里。
(function () {
  'use strict';

  class RNG {
    constructor(seed) {
      this.state = seed >>> 0;
    }

    // 返回 [0, 1)
    next() {
      this.state = (this.state + 0x6D2B79F5) | 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(n) {
      return Math.floor(this.next() * n);
    }

    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    }
  }

  // 由主种子和若干标签派生子种子。
  // 每组方块用独立子种子，一个玩家的操作不会影响后面的组。
  RNG.derive = function (seed) {
    let h = (seed >>> 0) ^ 0x811C9DC5;
    for (let i = 1; i < arguments.length; i++) {
      const text = String(arguments[i]) + '|';
      for (let k = 0; k < text.length; k++) {
        h = Math.imul(h ^ text.charCodeAt(k), 0x01000193);
      }
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5BD1E995);
    return (h ^ (h >>> 15)) >>> 0;
  };

  BG.RNG = RNG;
})();
