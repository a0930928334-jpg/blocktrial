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
    bigCells: 5,      // 格数不少于此值算"大方块"，权重固定（见 CLAUDE.md 的设计原则）
    // 中等"别扭"形状，难度提升时只提高它们的比例
    awkwardShapes: ['1x4', '4x1', 'L3a', 'L3b', 'L3c', 'L3d', 'T4a', 'T4b', 'T4c', 'T4d'],
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
    // S/Z 形：每组最多 1 块，热身期、奖励期、复活缓冲期和换一组都不出现。权重倍率随步数上升
    sz: {
      ids: ['S4h', 'S4v', 'Z4h', 'Z4v'],
      curve: [[20, 0], [25, 3], [60, 8]],
      maxRatio: 0.04,         // 一局里占已发方块的比例上限，到了这组就不再进候选
      lateMaxRatio: 0.05,     // 后期发牌里的比例上限
      minGapGroups: 5,        // 两次出现至少隔几组，5 表示任意连续 5 组最多 1 次
      minMoves: 3,            // 当前棋盘上至少有几个合法位置才发
      // 每日挑战不看棋盘，也不能依赖牌局状态：只按组号固定出现
      dailyEvery: 8,          // 每几组出现一块，每组 3 块时约 4%
      dailyFromGroup: 7       // 从第几组开始，和热身期（前 20 步）对齐
    },
    oneMaxRatio: 0.15,        // 1×1 占已发方块的比例上限（小块遗物换入的不算），每日挑战不用
    // 每日挑战不看棋盘和分数，只有别扭形状（awkwardShapes）的比例按步数提高：[步数, 权重倍率]。
    // 步数按"第几组 × 每组块数"算，所有人同一组的权重相同，序列才能完全一致。
    // 冲分开始的步数因人而异，所以不按"进入冲分后第几步"算，否则大家的牌就不一样了。
    dailyAwkwardCurve: [[0, 1], [30, 2], [60, 5], [90, 14], [110, 30], [125, 70]],
    dailyBigMult: 0.5,         // 大方块的固定权重倍率，不随步数变。每日挑战不看棋盘，占比和其他模式的实际占比（约 5%）看齐
    // 每组总格数贴近当前权重的平均值，相邻两组不会大起大落，也不会偏向更大或更小的方块
    dailyCellsTolerance: 1,    // 总格数和目标相差多少以内算合适
    dailyCellsTries: 12        // 每组最多试几次，都不合适时取最接近的
  },

  // ---------- 动态发牌（每日挑战不使用） ----------
  dealer: {
    enabled: true,            // 总开关，关闭后按权重随机发牌
    candidates: 60,           // 每次发牌生成多少组候选（K）
    // 搜索预算按节点数计，不按时间计，这样同一局面、同一种子的结果可复现
    dealNodeBudget: 30000,    // 一次发牌的总节点预算
    candidateNodeBudget: 1500,// 每组候选的节点预算，超出且未找到解时视为"未证明有解"
    beamWidth: 2,             // 算最大消除线数时，每块只展开最有希望的几个位置
    moveLimit: 40,            // 合法位置数达到多少算"很宽松"
    // 难度分公式，结果限制在 0～100，越高越难。
    // m：{ moves: 每块合法位置数, fits: 能放下的块数, count: 总块数,
    //      solvable: 能否全部放下(true/false/null未证明), maxLines: 最大消除线数,
    //      interference: 放下一块后，另外几块平均少掉多大比例的位置（0～1） }
    // blocking：放下一块后，另外几块一个位置都没有的比例（0～1）
    // 难度只来自组合，不看方块格数。
    difficulty: function (m) {
      const limit = BG.Config.dealer.moveLimit;
      let tight = 0;
      m.moves.forEach(function (n) { tight += 1 - Math.min(n, limit) / limit; });
      tight /= m.count;
      return 45 * tight                       // 位置越少越难
        + 60 * m.interference                 // 放一块挤掉另外两块的位置越多越难
        + 40 * m.blocking                     // 放错一块就有别的块放不下
        + 20 * (m.count - m.fits) / m.count   // 当前放不下的块越多越难
        + (m.solvable === true ? 0 : 25)      // 没有证明能全部放下
        - 16 * Math.min(m.maxLines, 3);       // 能消的线越多越容易
    },
    interferenceSamples: 8,   // 算互相挤占时，每块最多抽样几个位置
    // 统计和 S/Z 后期上限用的"后期"起点。3 块都能放、有解、大方块空格限制不分前后期，始终成立
    lateFromStep: { relic: 30, classic: 40 },
    bigMinEmpty: 30,          // 棋盘空格数不少于这个值，才发 5 格及以上的大方块
    smallRetryCells: 3,       // 候选全不合格时，再用多大以内的小方块试一轮，仍不行就用保底的小方块
    warmupSteps: 20,          // 热身期：每局前多少步
    warmupRatio: 0.25,        // 热身期：从最容易的多少比例里选
    // 平常期：从候选的难度排序里，以 center 为中心、前后各 halfWidth 的一段随机选。
    // center 0 最容易、0.5 中等、1 最难。难度跟着阶段走，和背景切换同步：曲线是 [阶段序号, 数值]，中间线性插值。
    // 分数不会倒退，所以复活缓冲结束后直接回到复活前的难度。
    // awkwardMult 是中等别扭形状（generator.awkwardShapes）的权重倍率。
    // 只能这样加难。不许动大方块和小方块的权重，见 CLAUDE.md 的设计原则。
    // capStage：难度上限，到这个阶段之后不再上升。
    normal: {
      halfWidth: 0.05,
      relic: {
        capStage: 8,
        center: [[1, 0.7], [2, 0.8], [3, 0.86], [4, 0.92], [5, 0.96], [6, 1]],
        awkwardMult: [[1, 1.5], [2, 2], [3, 3], [4, 4], [5, 5], [8, 6]]
      },
      classic: {
        capStage: 8,
        center: [[1, 0.5], [2, 0.75], [3, 0.85], [4, 0.92], [5, 0.96], [6, 1]],
        awkwardMult: [[1, 1.5], [2, 2], [3, 3], [4, 4], [5, 5], [8, 6]]
      }
    },
    // 关键分：每档遗物阶梯、每个分数台阶（milestone.scoreStep）、个人最高分。张弛节奏都围绕它，见 CLAUDE.md
    sprint: {
      keyRatio: 0.1,          // 冲刺期：分数距下一个关键分不到这个比例时触发
      maxGroups: 2            // 每个关键分最多几组，选有解候选里最难的
    },
    trial: {
      minGroups: 1,           // 考验期：选完遗物后最少几组
      maxGroups: 2,           // 考验期：选完遗物后最多几组
      band: [0.8, 1]          // 从有解候选的难度排序这一段里随机选
    },
    bonus: {
      afterTier: 1,           // 奖励期：冲过任何一个关键分后发几组
      afterRecord: 2,         // 破个人最高分时发几组
      minLines: 2             // 优先发最优放法能消这么多线的组
    },
    fallbackMaxCells: 3       // 候选里找不到有解的组时，退回发这么大以内的小方块
  },

  // ---------- 遗物 ----------
  relic: {
    tiers: [100, 300, 600, 1000], // 分数阶梯，每档一次遗物三选一，最后一档之后进入奖励阶段（每日挑战叫冲分）
    choices: 3,            // 每次几选一
    stageStepAfter: 500,   // 最后一档之后，每多少分进入一个新阶段
    crossBonus: 100,       // 十字斩：额外得分
    edgeMult: 2,           // 边线：最外圈线的得分倍率
    bigClearMinLines: 2,   // 大消除：一次消除多少线触发
    bigClearMult: 2,       // 大消除：本次得分倍率
    comboBonusMult: 2,     // 连击：连击加成的倍数
    chainBonus: 30,        // 连消：连续两步都有消除时的额外得分
    // 道具类遗物按次数，用完就失效，防止后期膨胀。加分类遗物一直有效
    smallGroups: 3,        // 小块：获得后接下来几组牌各有一块 1×1（托盘始终 3 块）
    holdUses: 5,           // 暂存：可以把方块放进暂存位几次
    bombGrant: 2,          // 炸弹：获得时立即给几颗，之后不再产出
    bombMax: 3,            // 炸弹：最多同时持有几颗
    bombRadius: 1,         // 炸弹：清除半径，1 表示 3×3
    // 遗物模式最后一档之后的分数奖励，到达时直接发放，不用选。每日挑战没有
    reward: {
      fixed: [[1500, 'swap'], [2500, 'swap'], [4000, 'revive']], // swap 免费换一组，revive 免费复活（只在这里出现，每局最多 1 次）
      every: 2000,          // 之后每多少分一次
      everyId: 'swap'       // 之后发什么
    }
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
      areaRadius: 1,        // 复活：清除半径，1 表示 3×3
      bufferGroups: 2,      // 复活缓冲：接下来几组不发大方块和 S/Z，经典和遗物按热身期规则选牌
      // 每日挑战和关闭动态发牌时不看棋盘，缓冲期按这张表固定替换，所有复活的玩家结果相同
      swap: {
        '3x3': '2x2', '1x5': '1x3', '5x1': '3x1',
        'L5a': 'L3a', 'L5b': 'L3b', 'L5c': 'L3c', 'L5d': 'L3d',
        'S4h': '1x3', 'S4v': '3x1', 'Z4h': '1x3', 'Z4v': '3x1'
      }
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
    stageBannerLife: 1600, // "阶段 N · 难度提升"横幅显示多久，不挡操作
    rewardToastLife: 2400, // "奖励：免费换一组 ×1"显示多久，不挡操作
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
