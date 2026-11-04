// 双人局的完整状态：能导出成字符串，也能从字符串恢复后接着玩，发牌结果和不导出时完全一致。
// 这轮界面不用，留给以后的云端房间。规则都是纯函数，随机只由种子决定，不用保存随机数状态。
(function () {
  'use strict';

  const VERSION = 1;

  // 直接按 JSON 保存的字段：分数、节奏、发牌计数、次数、统计
  const GAME_FIELDS = [
    'phase', 'score', 'elapsedMs', 'activeMs', 'idleMs', 'placements', 'linesCleared',
    'combo', 'maxCombo', 'noClearStreak', 'lastPlaceCleared', 'endReason', 'endType',
    'groupIndex', 'rerollNo', 'currentDeal', 'dealLog',
    'piecesDealt', 'szDealt', 'lateDealt', 'lateSzDealt', 'lastSzGroup', 'oneDealt', 'bufferLeft', 'relaxedDeals',
    'milestones', 'recordBroken', 'guardKeys', 'crossGuards',
    'swapsUsed', 'revivesUsed', 'reviveMethods', 'revivePhase', 'placementsAtRevive', 'stuckLog',
    'coinsEarned', 'coinsSpent', 'ads', 'duo'
  ];
  const DIRECTOR_FIELDS = ['dynamic', 'trialLeft', 'bonusLeft', 'sprintKey', 'sprintGroups', 'sprintMild', 'current', 'entries', 'groups'];

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function pick(from, fields) {
    const out = {};
    fields.forEach(function (key) { out[key] = copy(from[key]); });
    return out;
  }

  // 可序列化的状态对象
  function snapshot(game) {
    if (game.mode !== 'duo') throw new Error('只能导出双人局');
    return {
      version: VERSION,
      mode: game.mode,
      seed: game.seed,
      best: game.best,
      board: game.board.cells.slice(),
      tray: game.tray.map(function (p) {
        return p ? { id: p.shape.id, color: p.color } : null;
      }),
      game: pick(game, GAME_FIELDS),
      director: pick(game.director, DIRECTOR_FIELDS)
    };
  }

  // opts：{ wallet?, config? } 不属于这局状态的东西，恢复时由外部给
  function restore(state, opts) {
    const o = opts || {};
    if (!state || state.version !== VERSION || state.mode !== 'duo') throw new Error('状态不是当前版本的双人局');
    const game = new BG.Game({ mode: 'duo', seed: state.seed, best: state.best, dynamic: state.director.dynamic, wallet: o.wallet, config: o.config });
    Object.keys(state.game).forEach(function (key) { game[key] = copy(state.game[key]); });
    Object.keys(state.director).forEach(function (key) { game.director[key] = copy(state.director[key]); });
    game.board.cells = state.board.slice();
    game.tray = state.tray.map(function (p) {
      return p ? { shape: BG.Shapes.byId[p.id], color: p.color } : null;
    });
    // 这次卡死的记录要和记录列表里的是同一个对象，后面的选择才记得进去
    game.currentStuck = game.phase === 'stuck' && game.stuckLog.length > 0 ? game.stuckLog[game.stuckLog.length - 1] : null;
    game.events = [];
    return game;
  }

  function exportString(game) {
    return JSON.stringify(snapshot(game));
  }

  function importString(text, opts) {
    return restore(JSON.parse(text), opts);
  }

  // 名字去掉首尾空白，最多 nameMax 个字，空的用默认名字
  function cleanName(name, index, cfg) {
    const chars = Array.from(String(name === null || name === undefined ? '' : name).trim());
    return chars.slice(0, cfg.duo.nameMax).join('') || cfg.duo.defaultNames[index];
  }

  BG.DuoState = { snapshot: snapshot, restore: restore, exportString: exportString, importString: importString, cleanName: cleanName };
})();
