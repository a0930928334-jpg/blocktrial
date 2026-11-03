// 所有可调数值集中在这里。改完刷新页面即可生效。
// 本文件最先加载，并创建全局命名空间 BG。
var BG = (typeof BG !== 'undefined' && BG) ? BG : {};

BG.Config = {
  // ---------- 棋盘与托盘 ----------
  board: {
    size: 8,          // 棋盘边长（格）
    traySize: 3,      // 每组发几块方块
    colorCount: 6     // 方块颜色种数（具体色值在 render/theme.js）
  },

  // ---------- 计分 ----------
  score: {
    perCell: 1,                 // 放置时每格得分
    lineTable: [0, 10, 30, 60], // 一次消除 0/1/2/3 线的基础分
    extraPerLine: 40            // 第 4 线及以后，每多一线再加多少分（4 线 = 100，5 线 = 140）
  },

  // ---------- 连击 ----------
  combo: {
    stepBonus: 0.5,   // 倍率 = 1 + stepBonus × (combo − 1)，只乘消除分
    graceNoClear: 3   // 连续多少次放置没有消除时，combo 清零（即需求里的 N）
  },

  // ---------- 方块生成 ----------
  generator: {
    maxRetries: 50,   // "每组至少一块能放下"的最大重试次数，用尽后把一块换成 1×1
    bigCells: 5,      // 格数不少于此值算"大方块"，受下面的曲线影响
    // 各形状的基础权重，数值越大出现越多
    shapeWeights: {
      '1x1': 6,
      '1x2': 12, '2x1': 12,
      '1x3': 8, '3x1': 8,
      '1x4': 6, '4x1': 6,
      '1x5': 2, '5x1': 2,
      '2x2': 10, '3x3': 2,
      'L3a': 7, 'L3b': 7, 'L3c': 7, 'L3d': 7,
      'L5a': 1.5, 'L5b': 1.5, 'L5c': 1.5, 'L5d': 1.5,
      'T4a': 5, 'T4b': 5, 'T4c': 5, 'T4d': 5,
      'S4h': 3, 'S4v': 3, 'Z4h': 3, 'Z4v': 3
    },
    // S/Z 形：每组最多 1 块，每日挑战不出现。权重倍率随步数上升，热身期为 0
    sz: {
      ids: ['S4h', 'S4v', 'Z4h', 'Z4v'],
      curve: [[20, 0], [30, 0.5], [90, 3]],
      maxRatio: 0.1           // 一局里占已发方块的比例上限，到了这组就不再进候选
    },
    oneMaxRatio: 0.15,        // 1×1 占已发方块的比例上限（小块遗物换入的不算），每日挑战不用
    // 分数越高大方块权重越高：[分数, 权重倍率]，中间线性插值
    bigCurve: [[0, 1], [1000, 1.1], [3000, 1.25], [6000, 1.4], [10000, 1.5]],
    // 每日挑战不看棋盘和分数，难放的方块按步数增多：[步数, 权重倍率]。
    // 步数按"第几组 × 每组块数"算，所有人同一组的权重相同，序列才能完全一致。
    // 第 90 步前和遗物模式靠拢，之后陡升，让冲分阶段很快结束。
    // 冲分开始的步数因人而异，所以不按"进入冲分后第几步"算，否则大家的牌就不一样了。
    dailyHardCurve: [[0, 1], [30, 2], [90, 16], [100, 30], [120, 100]],
    dailyHardShapes: ['1x4', '4x1', '1x5', '5x1', '3x3', 'L5a', 'L5b', 'L5c', 'L5d'],
    // 每日挑战每组总格数的目标：[步数, 格数]。相邻两组的目标接近，难度不会大起大落
    dailyCells: [[0, 7], [30, 7.5], [90, 9], [100, 11], [115, 18]],
    dailyCellsTolerance: 1,    // 总格数和目标相差多少以内算合适
    dailyCellsTries: 12        // 每组最多试几次，都不合适时取最接近的
  },

  // ---------- 动态发牌（每日挑战不使用） ----------
  dealer: {
    enabled: true,            // 总开关，关闭后按权重随机发牌
    candidates: 30,           // 每次发牌生成多少组候选（K）
    // 搜索预算按节点数计，不按时间计，这样同一局面、同一种子的结果可复现
    dealNodeBudget: 30000,    // 一次发牌的总节点预算
    candidateNodeBudget: 1500,// 每组候选的节点预算，超出且未找到解时视为"未证明有解"
    beamWidth: 2,             // 算最大消除线数时，每块只展开最有希望的几个位置
    moveLimit: 40,            // 合法位置数达到多少算"很宽松"
    // 难度分公式，结果限制在 0～100，越高越难。
    // m：{ moves: 每块合法位置数, fits: 能放下的块数, count: 总块数,
    //      solvable: 能否全部放下(true/false/null未证明), maxLines: 最大消除线数,
    //      interference: 放下一块后，另外几块平均少掉多大比例的位置（0～1） }
    // 难度只来自组合，不看方块格数。
    difficulty: function (m) {
      const limit = BG.Config.dealer.moveLimit;
      let tight = 0;
      m.moves.forEach(function (n) { tight += 1 - Math.min(n, limit) / limit; });
      tight /= m.count;
      return 45 * tight                       // 位置越少越难
        + 60 * m.interference                 // 放一块挤掉另外两块的位置越多越难
        + 20 * (m.count - m.fits) / m.count   // 当前放不下的块越多越难
        + (m.solvable === true ? 0 : 25)      // 没有证明能全部放下
        - 16 * Math.min(m.maxLines, 3);       // 能消的线越多越容易
    },
    interferenceSamples: 8,   // 算互相挤占时，每块最多抽样几个位置
    // 后期规则的起点：平常期从这一步起，以及冲刺期、考验期，发牌 3 块都要有位置
    lateFromStep: { relic: 30, classic: 40 },
    bigMinEmpty: 30,          // 后期棋盘空格数不少于这个值，才发 5 格及以上的大方块
    smallRetryCells: 3,       // 后期候选全不合格时，再用多大以内的小方块试一轮，仍不行才放宽
    warmupSteps: 20,          // 热身期：每局前多少步
    warmupRatio: 0.25,        // 热身期：从最容易的多少比例里选
    // 平常期：从候选的难度排序里，以 center 为中心、前后各 halfWidth 的一段随机选。
    // center 0 最容易、0.5 中等、0.8 以上偏难、1 最难。曲线是 [已放置步数, center]，中间线性插值。
    // 遗物模式一局只有约 95 步，所以到第 90 步要顶到最难，才有约一半的局撑不到通关。
    // bigMult 是大方块（generator.bigCells 格以上）进入候选的权重倍率，曲线是 [已放置步数, 倍率]。
    normal: {
      halfWidth: 0.05,
      relic: { center: [[30, 0.65], [90, 1]], bigMult: [[30, 2], [90, 16]] },
      classic: { center: [[40, 0.5], [120, 0.8], [200, 0.95]], bigMult: [[40, 1], [120, 3], [200, 5]] }
    },
    sprint: {
      bestRatio: 0.85,        // 冲刺期：分数达到最高分的多少比例时触发
      noBestEvery: 1000,      // 经典模式没有最高分时，用"接近整千分"
      noBestRatio: 0.85,      // 整千分的多少比例算接近，0.85 即 x850～x999
      maxTriggers: 3,         // 每局最多触发几次
      maxGroups: 2,           // 每次最多持续几组牌
      cooldownGroups: 3       // 两次触发之间至少隔几组，否则会连续用完 3 次
    },
    trial: {
      minGroups: 1,           // 考验期：选完遗物后最少几组
      maxGroups: 2,           // 考验期：选完遗物后最多几组
      band: [0.8, 1]          // 从有解候选的难度排序这一段里随机选
    },
    bonus: {
      groups: 1,              // 奖励期持续几组
      thousandEvery: 1000     // 每过多少分触发一次
    },
    fallbackMaxCells: 3       // 候选里找不到有解的组时，退回发这么大以内的小方块
  },

  // ---------- 遗物 ----------
  relic: {
    tiers: [80, 200, 350, 550, 800, 1100], // 分数阶梯，最后一档为通关
    choices: 3,            // 每次几选一
    crossBonus: 100,       // 十字斩：额外得分
    edgeMult: 2,           // 边线：最外圈线的得分倍率
    bigClearMinLines: 2,   // 大消除：一次消除多少线触发
    bigClearMult: 2,       // 大消除：本次得分倍率
    comboBonusMult: 2,     // 连击：连击加成的倍数
    chainBonus: 30,        // 连消：连续两步都有消除时的额外得分
    smallEvery: 3,         // 小块：每发多少组牌，有一组的一块换成 1×1（托盘始终 3 块）
    bombEvery: 5,          // 炸弹：每多少次"有消除的放置"得 1 颗
    bombMax: 2,            // 炸弹：最多同时持有几颗，持有满时进度暂停
    bombRadius: 1          // 炸弹：清除半径，1 表示 3×3
  },

  // ---------- 分数台阶和阶段 ----------
  milestone: {
    scoreStep: 500        // 每多少分一个台阶：庆祝，经典和每日挑战同时切换阶段主题
  },

  // ---------- 局外段位，按所有模式的个人最高分 ----------
  rank: {
    tiers: [[500, '新手'], [1000, '熟练'], [2000, '高手'], [3000, '大师'], [5000, '传说']]
  },

  // ---------- 广告（试玩版为模拟） ----------
  ads: {
    countdownSec: 3,        // 模拟广告倒计时（秒）
    reviveLimit: 1,         // 每局复活次数
    swapTrayLimit: 1,       // 每局"换一组方块"次数。一局的激励广告只有复活和换一组，最多 2 次
    interstitialEnabled: false, // 插屏总开关，试玩版关闭
    interstitialEvery: 2,   // 打开插屏时，每结束几局回到菜单时播一次
    revive: {
      areaRadius: 1         // 复活：清除半径，1 表示 3×3
    }
  },

  // ---------- 动画时长（毫秒） ----------
  anim: {
    placePop: 180,        // 落子弹一下
    clearFlash: 90,       // 被消格子闪白
    clearShrink: 200,     // 被消格子缩小消失
    clearStagger: 18,     // 同一次消除里，相邻格子的延迟
    particlesPerCell: 2,  // 每个被消格子迸发的粒子数
    particleLife: 520,    // 粒子寿命
    shakeLines: 3,        // 一次消除多少线开始震屏
    shakeTime: 240,       // 震屏时长
    shakeAmp: 5,          // 震屏幅度（逻辑像素）
    floatLife: 900,       // 飘字寿命
    comboLife: 800,       // 屏幕中央"连击 ×N"显示时长
    flyBack: 170,         // 非法松手时飞回托盘
    relicFlash: 480,      // 遗物生效时图标闪烁放大
    stampLife: 700,       // 加分遗物的大号印章，先放大再淡出
    stampSize: 46,        // 印章字号
    formulaLife: 800,     // 算式飘字，加分遗物的反馈总时长不超过 800 毫秒
    relicFlashScale: 0.2, // 图标放大的幅度
    modalDelay: 480,      // 消除动画后，延迟多久弹遗物或结算
    // 顶部分数的跳动，按本次加分分三档。有遗物加成时一律算大额
    scoreJump: {
      midMin: 20,         // 不少于这个分数算中额
      bigMin: 100,        // 不少于这个分数算大额
      riseRatio: 0.35,    // 放大阶段占整个动画的比例，之后回弹
      small: { scale: 1.08, ms: 150, strength: 0, floatSize: 0 },
      mid: { scale: 1.2, ms: 220, color: '#ffe08a', strength: 0.85, colorMs: 260, floatSize: 18 },
      big: { scale: 1.35, ms: 300, color: '#ffc23c', strength: 1, colorMs: 420, floatSize: 28, shake: 3, shakeMs: 220 },
      roll: { minMs: 120, msPerPoint: 4, maxMs: 500 }, // 滚动时长 = 分差 × msPerPoint，限制在范围内
      floatLife: 800,     // "+N" 飘字寿命
      floatMerge: 350,    // 飘字出现后这么久内再加分，就合并成一个数字
      floatRise: 12       // 飘字上移多少逻辑像素
    },
    stageFade: 600,       // 阶段主题切换的过渡时长
    // 分数台阶和升段的庆祝
    celebrate: {
      lifeMs: 1500,       // 总时长，之后自然消失
      maxLevel: 6,        // 档位上限，分数台阶的档位 = 分数 / scoreStep
      recordLevel: 5,     // "新纪录"至少按这一档的华丽程度播放
      topCount: 16, topPerLevel: 5,   // 顶部彩带数量
      sideCount: 12, sidePerLevel: 5, // 两侧彩带数量
      burstGap: 260,      // 档位越高喷发次数越多，每次间隔
      maxParticles: 160,
      gravity: 170,
      drag: 1.6,          // 空气阻力，越大彩带飞得越近
      boardAlpha: 0.2,    // 彩带叠在棋盘上时的最大透明度
      boardFade: 3,       // 彩带在棋盘范围内消失得快几倍
      colors: ['#ffc23c', '#2fc4b2', '#ff6b5e', '#f368b4', '#3fa9f5', '#a77bf3', '#ffffff', '#ffe08a', '#7ce8b3'],
      bannerSize: 30, bannerPerLevel: 1.5, // 横幅字号
      bannerPeak: 1.25,   // 回弹时最大放大到多少
      score: { scale: 1.6, scalePerLevel: 0.06, maxScale: 2, ms: 620, color: '#ffc23c', strength: 1, colorMs: 1100, shake: 5, shakeMs: 320 },
      vibrateMs: 40, vibratePerLevel: 12
    },
    // "距下一个遗物"进度条，接近下一档时轻微脉动
    progressPulse: {
      remainRatio: 0.15,  // 剩余不到这一档的这个比例时开始
      periodMs: 900,      // 一次脉动的时长
      extraHeight: 3,     // 最多加高多少逻辑像素
      glow: 0.45          // 最亮时叠加的白色强度
    }
  },

  // ---------- 手感 ----------
  feel: {
    dragLiftCells: 1.5,   // 拖动时，方块底边在手指上方多少格
    vibrateMs: 15         // 震动时长
  },

  // ---------- 界面 ----------
  ui: {
    minFont: 16,          // 最小字号（逻辑像素）
    minTouch: 44,         // 最小触控区（逻辑像素）
    maxColumn: 520,       // 电脑宽屏下游戏列的最大宽度
    relicTipMs: 2500,     // 点击遗物图标后，说明显示多久
    exitHintMs: 2000,     // 菜单按返回键后，多久内再按一次才退出
    updateCheckMs: 60000, // 停在主菜单时，隔多久问一次服务器有没有新版本
    maxDpr: 4,            // 画布像素密度上限，iPhone 是 3，不能低于 3
    maxCanvasPixels: 16000000 // 单张画布的像素上限，iOS Safari 超过约 1677 万像素就画不出来
  },

  // ---------- 统计 ----------
  stats: {
    showRecent: 20,       // 统计页显示最近多少局
    keep: 100,            // 本地最多保留多少局（复制完整版时全部导出）
    compactGames: 8,      // 复制精简版时导出最近几局，8 局一定不超过 5000 字符
    compactMaxChars: 600  // 精简版每局最多多少字符
  }
};
