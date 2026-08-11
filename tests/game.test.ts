import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { dailySeed } from '../src/game/generator';
import { DT, KILL_BONUS, BACKSTAB_BONUS, MAX_FALL, DYING_TIME, DEATH_FADE } from '../src/game/constants';
import type { InputState } from '../src/game/types';
import { makeEnemy, type Enemy, type EnemyKind } from '../src/game/enemies';

const IDLE: InputState = {
  left: false, right: false, up: false, down: false,
  jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false,
};

describe('Game', () => {
  it('初始为 title，start 后 playing', () => {
    const g = new Game(1);
    expect(g.state).toBe('title');
    g.start();
    expect(g.state).toBe('playing');
  });

  it('今日挑战：同日种子每局关卡一致，常规模式逐局不同', () => {
    const layout = (g: Game) => {
      g.start();
      for (let i = 0; i < 120; i++) g.update({ ...IDLE, right: true }, DT);
      return g.level.solids.map(s => `${s.x},${s.y},${s.w},${s.h}`).join('|');
    };
    const g = new Game(1000);
    g.setDaily(dailySeed('2026-07-13'), '2026-07-13');
    g.setMode('daily');
    expect(g.boardKey).toBe('daily:2026-07-13');
    const a = layout(g), b = layout(g);
    expect(b).toBe(a); // 今日挑战：重来同一关卡

    g.setMode('endless');
    expect(g.boardKey).toBe('endless');
    const c = layout(g), d = layout(g);
    expect(d).not.toBe(c); // 常规：逐局递增种子，地形不同
  });

  it('title 状态下 update 不推进', () => {
    const g = new Game(1);
    const x = g.player.pos.x;
    g.update({ ...IDLE, right: true }, DT);
    expect(g.player.pos.x).toBe(x);
  });

  it('向右跑距离增加、相机跟随', () => {
    const g = new Game(1);
    g.start();
    for (let i = 0; i < 180; i++) g.update({ ...IDLE, right: true }, DT);
    expect(g.score.distanceM).toBeGreaterThan(3);
    expect(g.cameraX).toBeGreaterThanOrEqual(0);
  });

  it('站着不动最终被黑暗吞噬且记录 runStats', () => {
    const g = new Game(1);
    g.start();
    let steps = 0;
    while (g.state === 'playing' && steps < 60 * 60) { // 最多模拟 60 秒
      g.update(IDLE, DT);
      steps++;
    }
    expect(g.state).toBe('dead');
    expect(g.deathCause).toBe('darkness');
    expect(g.runStats).not.toBeNull();
    expect(g.runStats!.durationMs).toBeGreaterThan(0);
  });

  it('死亡后 start 完全重置', () => {
    const g = new Game(1);
    g.start();
    for (let i = 0; i < 60 * 60 && g.state === 'playing'; i++) g.update(IDLE, DT);
    expect(g.state).toBe('dead');
    g.start();
    expect(g.state).toBe('playing');
    expect(g.score.total).toBe(0);
    expect(g.elapsed).toBe(0);
    expect(g.darkness.x).toBeLessThan(0);
  });

  it('拾取光点计分且光点标记 taken', () => {
    const g = new Game(1);
    g.start();
    // 直接把一个光点放到玩家脸上
    g.level.motes.push({ x: g.player.pos.x + 10, y: g.player.pos.y + 10, taken: false });
    g.update(IDLE, DT);
    expect(g.score.motes).toBe(1);
    expect(g.justCollectedMote).toBe(true);
  });

  function enemyOnPlayer(g: Game): Enemy {
    const x = g.player.pos.x;
    return makeEnemy({
      kind: 'walker',
      x, y: g.player.pos.y, w: 24, h: 20,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: x - 50, maxX: x + 50,
    });
  }

  it('非冲刺状态撞上敌人致死，deathCause 为 enemy', () => {
    const g = new Game(1);
    g.start();
    const target = enemyOnPlayer(g);
    g.enemies.list.push(target);
    g.update(IDLE, DT);
    expect(g.state).toBe('dead');
    expect(g.deathCause).toBe('enemy');
  });

  it('冲刺状态撞上敌人将其击杀：敌人死亡、加分、玩家存活', () => {
    const g = new Game(1);
    g.start();
    g.update({ ...IDLE, dashPressed: true, right: true }, DT); // 触发冲刺
    expect(g.player.dashing).toBe(true);
    // 持引用断言，别用 list[0]：难度按位置算之后，开局那一段本来就已经有怪，
    // list[0] 不再是这里 push 进去的那只
    const target = enemyOnPlayer(g);
    g.enemies.list.push(target);
    const bonusBefore = g.score.bonus;
    g.update(IDLE, DT); // 冲刺中撞上敌人
    expect(g.state).toBe('playing');
    expect(target.alive).toBe(false);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.score.bonus).toBe(bonusBefore + KILL_BONUS);
  });

  it('冲刺击杀会打出一具飞尸（击飞连锁的起点）', () => {
    const g = new Game(1);
    g.start();
    g.update({ ...IDLE, dashPressed: true, right: true }, DT);
    const target = enemyOnPlayer(g);
    g.enemies.list.push(target);
    g.update(IDLE, DT);
    expect(target.alive).toBe(false);
    expect(g.corpses.list.length).toBe(1);
  });

  it('下落自上方踩踏敌人也算击杀：敌死、加分、回弹、玩家存活', () => {
    const g = new Game(1);
    g.start();
    // 高空下落，脚下正对小怪
    g.player.pos.y = 120;
    g.player.vel.y = 150;
    g.player.onGround = false;
    const px = g.player.pos.x;
    const target = makeEnemy({
      kind: 'walker', x: px, y: 142, w: 24, h: 28,
      dir: 1, minX: px - 50, maxX: px + 50,
    });
    g.enemies.list.push(target);
    const bonusBefore = g.score.bonus;
    g.update(IDLE, DT);
    expect(g.state).toBe('playing');
    expect(target.alive).toBe(false);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.score.bonus).toBe(bonusBefore + KILL_BONUS);
    expect(g.player.vel.y).toBeLessThan(0); // 击杀后向上回弹
  });

  it('踩踏击杀不产生飞尸：踩是向下压碎，不是打飞', () => {
    const g = new Game(1);
    g.start();
    g.player.pos.y = 120;
    g.player.vel.y = 150;
    g.player.onGround = false;
    const px = g.player.pos.x;
    const target = makeEnemy({
      kind: 'walker', x: px, y: 142, w: 24, h: 28,
      dir: 1, minX: px - 50, maxX: px + 50,
    });
    g.enemies.list.push(target);
    g.update(IDLE, DT);
    expect(target.alive).toBe(false);
    expect(g.corpses.list.length).toBe(0);
  });

  it('高速下坠踩踏同样算击杀：单帧位移大于怪身高也不漏踩', () => {
    const g = new Game(1);
    g.start();
    // 以最大下坠速度（900px/s，每帧 15px）砸向一只矮 walker（h=20）。
    // 旧判据「脚底在怪头 0.6 格内」只有 12px 窗口，一帧就跨过去了，玩家明明踩
    // 中却被判撞死——这条守的就是那个漏洞。
    g.player.pos.y = 120;
    g.player.vel.y = MAX_FALL;
    g.player.onGround = false;
    const px = g.player.pos.x;
    g.enemies.list.push(makeEnemy({
      kind: 'walker', x: px, y: 150, w: 24, h: 20,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: px - 50, maxX: px + 50,
    }));
    g.update(IDLE, DT);
    expect(g.state).toBe('playing');
    expect(g.justKilledEnemy).toBe(true);
    expect(g.player.vel.y).toBeLessThan(0);
  });

  it('侧面撞上小怪仍然致死：踩踏放宽没有把撞死也一并赦免', () => {
    const g = new Game(1);
    g.start();
    // 缓缓下坠但体心低于怪心 —— 这是撞上去，不是踩下去
    g.player.pos.y = 160;
    g.player.vel.y = 60;
    g.player.onGround = false;
    const px = g.player.pos.x;
    g.enemies.list.push(makeEnemy({
      kind: 'walker', x: px, y: 150, w: 24, h: 20,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: px - 50, maxX: px + 50,
    }));
    g.update(IDLE, DT);
    expect(g.state).toBe('dead');
    expect(g.deathCause).toBe('enemy');
  });
});

describe('Game 大招·夸父跨步', () => {
  it('拾日光充能，满则可发动跨步并清空神力', () => {
    const g = new Game(1);
    g.start();
    // 塞入大量日光到玩家身上，一帧全部拾取充满
    for (let i = 0; i < 20; i++) {
      g.level.motes.push({ x: g.player.pos.x + 10, y: g.player.pos.y + 10, taken: false });
    }
    g.update(IDLE, DT);
    expect(g.chargeReady).toBe(true);
    g.update({ ...IDLE, ultimatePressed: true }, DT);
    expect(g.player.striding).toBe(true);
    expect(g.justStrided).toBe(true);
    expect(g.charge).toBe(0);
  });

  it('神力未满时按大招无效', () => {
    const g = new Game(1);
    g.start();
    g.charge = 0.5;
    g.update({ ...IDLE, ultimatePressed: true }, DT);
    expect(g.player.striding).toBe(false);
    expect(g.charge).toBe(0.5);
  });

  it('跨步无敌：穿越尖刺不死', () => {
    const g = new Game(1);
    g.start();
    g.charge = 1;
    g.level.spikes.push({ x: g.player.pos.x + 40, y: g.player.pos.y, w: 32, h: 16 });
    g.update({ ...IDLE, ultimatePressed: true }, DT); // 发动跨步
    expect(g.player.striding).toBe(true);
    for (let i = 0; i < 6; i++) g.update(IDLE, DT); // 掠过尖刺
    expect(g.state).toBe('playing');
  });

  it('跨步撞碎沿途小怪', () => {
    const g = new Game(1);
    g.start();
    g.charge = 1;
    g.update({ ...IDLE, ultimatePressed: true }, DT); // striding
    // 在玩家前方铺一个宽敌人，确保推进时重叠（宽巡逻界防止被夹到边界）
    g.enemies.list.push(makeEnemy({
      kind: 'walker', x: g.player.pos.x, y: g.player.pos.y, w: 60, h: 20,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: 0, maxX: 100000,
    }));
    g.update(IDLE, DT);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.enemies.list.every(e => e.alive)).toBe(false);
  });

});

describe('Game 跨步后无敌', () => {
  it('跨步结束后短暂无敌：免尖刺', () => {
    const g = new Game(1);
    g.start();
    g.charge = 1;
    g.update({ ...IDLE, ultimatePressed: true }, DT); // 发动
    // 推进到跨步结束（进入落地无敌窗口）
    for (let i = 0; i < 60; i++) g.update(IDLE, DT);
    expect(g.player.striding).toBe(false);
    expect(g.player.invincible).toBe(true); // 仍在无敌窗口
    // 脚下塞尖刺，无敌期间不死
    g.level.spikes.push({ x: g.player.pos.x, y: g.player.pos.y, w: 32, h: 20 });
    g.update(IDLE, DT);
    expect(g.state).toBe('playing');
  });
});

describe('死亡定格回放', () => {
  const kill = (g: Game) => {
    let n = 0;
    while (g.state === 'playing' && n < 60 * 60) { g.update(IDLE, DT); n++; }
    expect(g.state).toBe('dead');
  };

  // 回放存在的唯一理由：死亡那一刻的画面得留在屏幕上一会儿。
  // 渲染层与 UI 层都靠 game.dying 决定「结局图/成绩要不要盖上去」，
  // 一旦它恒为 false，结算页又会当帧盖满，而这在测试里是看不见的。
  it('死亡即进入回放，倒数走完才交给结算页', () => {
    const g = new Game(1);
    g.start();
    kill(g);
    expect(g.dying).toBe(true);
    expect(g.dyingT).toBeCloseTo(DYING_TIME, 5);

    // 已 dead，但计时仍须推进——否则结算页永不接管
    g.update(IDLE, DT);
    expect(g.dyingT).toBeLessThan(DYING_TIME);

    let n = 0;
    while (g.dying && n < 60 * 5) { g.update(IDLE, DT); n++; }
    expect(g.dying).toBe(false);
    expect(g.dyingT).toBe(0);
    expect(g.state).toBe('dead'); // 回放结束不改变死亡本身
  });

  // 跳过不能直接归零：那会从死亡现场一刀切到结算页，正是黑场要消除的突兀。
  // 语义是「快进到最后那次淡入」，不是「立刻结束」。
  it('可跳过：快进到收束的淡入，而非一刀切走', () => {
    const g = new Game(1);
    g.start();
    kill(g);
    g.skipDying();
    expect(g.dyingT).toBeLessThanOrEqual(DEATH_FADE); // 确实快进了
    expect(g.dying).toBe(true);                       // 但仍在淡入中
    let n = 0;
    while (g.dying && n < 60 * 3) { g.update(IDLE, DT); n++; }
    expect(g.dying).toBe(false);                      // 淡入走完自然结束
  });

  it('重复跳过不会把计时推回去', () => {
    const g = new Game(1);
    g.start();
    kill(g);
    g.skipDying();
    const first = g.dyingT;
    g.update(IDLE, DT);
    g.skipDying();
    expect(g.dyingT).toBeLessThan(first);
  });

  it('重开清掉回放状态，不残留到下一局', () => {
    const g = new Game(1);
    g.start();
    kill(g);
    expect(g.dying).toBe(true);
    g.start();
    expect(g.dying).toBe(false);
    expect(g.dyingT).toBe(0);
  });

  it('回放不吞掉成绩：runStats 在进入回放时就已定稿', () => {
    const g = new Game(1);
    g.start();
    kill(g);
    expect(g.runStats).not.toBeNull();
    const snapshot = { ...g.runStats! };
    let n = 0;
    while (g.dying && n < 60 * 5) { g.update(IDLE, DT); n++; }
    expect(g.runStats).toEqual(snapshot);
  });
});

describe('接入击杀矩阵', () => {
  /** 把一只指定 kind 的怪塞到玩家正前方，推一帧，返回结果。 */
  const confront = (kind: EnemyKind, method: 'dash' | 'stomp', extra: Partial<Enemy> = {}) => {
    const g = new Game(1);
    g.start();
    const p = g.player;
    // 怪放在玩家身上（重叠），dir 朝玩家所在侧 = 正面
    // baseY 必须等于生成时的 y：flyer 是空中族，updateAir 每帧按
    // `baseY + sin(phase)*FLYER_SWING` 重算 y，makeEnemy 默认 baseY=0，若不
    // 显式对齐，enemies.update() 一跑就把怪甩到 y≈0，跟玩家不再重叠。
    // dir 默认取 1（朝右）：dash 分支恒往右冲，玩家最终停在怪的右侧。shield 不
    // 参与警觉追击（enemy-kinds.ts），这里给的 dir 不会被 AI 改写，「面朝右 =
    // 面朝玩家来的方向」就是正面——这条判定跟单帧瞬移夹具无关，是真几何。
    g.enemies.list = [makeEnemy({
      kind, x: p.pos.x, y: p.pos.y, w: 24, h: 20, baseY: p.pos.y, dir: 1, minX: 0, maxX: 9999, ...extra,
    })];
    if (method === 'dash') {
      p.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60, g.level.solids);
    } else {
      p.pos.y -= 30; p.vel.y = 400;   // 自上方落下
    }
    g.update(IDLE, 1 / 60);
    return g;
  };
  /** confront 之后那只夹具怪的引用。难度按位置算之后开局本就有生成的怪，
   *  不能再用 list[0] 或 list.every(...) 来断言。 */
  const fixtureOf = (g: Game) => g.enemies.list[0];

  it('冲刺撞盾旱魃正面：不死、怪还活着、玩家被弹回', () => {
    const g = confront('shield', 'dash');
    expect(g.state, '弹回不该致死').toBe('playing');
    expect(g.enemies.list.some(e => e.alive), '盾没被撞碎').toBe(true);
    expect(g.justBounced).toBe(true);
  });

  it('弹回后仍与盾重叠的那几帧也不能死——否则「弹回不致死」是空话', () => {
    const g = confront('shield', 'dash');
    // 弹回瞬间人还压在盾身上，且 bounceOff 已清掉 smashing：
    // 若不豁免接触伤害，下一帧就判死。180px/s 退开 24px 宽的盾要好几帧。
    for (let i = 0; i < 10; i++) g.update(IDLE, 1 / 60);
    expect(g.state, '弹回窗口内被接触伤害补刀了').toBe('playing');
  });

  it('列阵里撞盾：同帧的第二只怪不能补刀', () => {
    const g = new Game(1);
    g.start();
    const p = g.player;
    g.enemies.list = [
      makeEnemy({ kind: 'shield', x: p.pos.x, y: p.pos.y, w: 24, h: 20, dir: 1, minX: 0, maxX: 9999 }),
      makeEnemy({ kind: 'walker', x: p.pos.x, y: p.pos.y, w: 24, h: 20, dir: -1, minX: 0, maxX: 9999 }),
    ];
    p.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60, g.level.solids);
    g.update(IDLE, 1 / 60);
    expect(g.state).toBe('playing');
  });

  it('冲刺撞普通旱魃正面：照旧撞碎', () => {
    const g = confront('walker', 'dash');
    expect(g.state).toBe('playing');
    expect(fixtureOf(g).alive, '夹具那只该被撞碎').toBe(false);
  });

  it('背刺盾旱魃：击杀且加分翻倍', () => {
    const g = confront('shield', 'dash', { dir: -1 }); // 怪朝左，玩家冲到其右侧 = 背面
    expect(fixtureOf(g).alive, '夹具那只该被背刺').toBe(false);
    expect(g.justBackstabbed).toBe(true);
  });

  it('连续接近背刺盾旱魃：真·奔跑追上再冲刺命中，不是瞬移穿过正面', () => {
    // 上面那条背刺测试用的是"单帧瞬移"夹具：玩家一步从怪心左侧跨到右侧，
    // 中间该经过的那几帧正面重叠被跳过了。这条测试改用连续奔跑真正追上去，
    // 是这套设计（shield 不参与警觉追击）真正的守卫——盾若还会转身对准玩家
    // （旧设计），追上的过程里它会先转向面对玩家，这条测试就会变红。
    const g = new Game(1);
    g.start();
    const p = g.player;
    const startX = p.pos.x;
    // 盾在玩家前方巡逻，dir=1（朝右）——玩家从左边追上来，正撞在它背上。
    // minX/maxX 给得足够宽，追逐全程不会撞边界折返（折返会改变 dir，混淆判定）。
    const ex = startX + 320;
    // 盾按 production 的落脚几何放（enemies.ts:111：y = 地表 top - h）。玩家
    // spawn 在地面上方 32px（SPAWN.y=388 vs 地表 448），直接抄 p.pos.y 会把盾
    // 永久悬空一格、纵向 AABB 从此错开——那不是地形落差，是夹具放错了高度。
    const top = g.level.solids
      .filter(s => ex >= s.x && ex < s.x + s.w)
      .reduce((a, s) => Math.min(a, s.y), Infinity);
    g.enemies.list = [makeEnemy({
      kind: 'shield', x: ex, y: top - 20, w: 24, h: 20,
      dir: 1, minX: startX, maxX: startX + 1e6,
    })];
    let guard = 0;
    while (g.enemies.list[0].alive && (g.enemies.list[0].x - (p.pos.x + p.rect.w)) > 50 && guard++ < 600) {
      g.update({ ...IDLE, right: true }, 1 / 60);
    }
    expect(guard, '没追上，测试设置有问题').toBeLessThan(600);
    const bonusBefore = g.score.bonus;
    g.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60); // 触发冲刺
    for (let i = 0; i < 10 && g.enemies.list[0]?.alive; i++) g.update(IDLE, 1 / 60); // 冲刺推进到命中
    expect(g.justBackstabbed, '连续接近下背刺应当真能打中').toBe(true);
    expect(g.score.bonus).toBe(bonusBefore + BACKSTAB_BONUS);
  });








  it('非冲刺状态侧面撞怪仍然当场死亡（一碰即死没有被改掉）', () => {
    const g = new Game(1);
    g.start();
    g.enemies.list = [makeEnemy({
      kind: 'walker', x: g.player.pos.x, y: g.player.pos.y, w: 24, h: 20, minX: 0, maxX: 9999,
    })];
    g.update(IDLE, 1 / 60);
    expect(g.state).toBe('dead');
    expect(g.deathCause).toBe('enemy');
  });

  it('冲刺撞入一整列列阵：飞尸连锁被 CORPSE_CHAIN_MAX 挡住，带不走全阵', () => {
    // 按 enemies.ts 列阵生成的真实间距（90px）铺 10 只——远超列阵实际规模
    // （3~4 只，见 enemies.ts 的 formRoll 分支），专门验证「即使供给管够，
    // 链深上限也真的挡得住」，而不是恰好撞见列阵太短才没打光。
    // 实测：直接冲刺本身能碰到的 + 链深上限 3 层飞尸连锁，合计固定停在 5 只——
    // 铺 10 只、20 只结果一样，多出来的怪根本没被摸到。
    const g = new Game(1);
    g.start();
    const p = g.player;
    const y = p.pos.y;
    const n = 10;
    // 保留原始引用数组：Enemies.update() 每帧都会把 !alive 的怪从 g.enemies.list
    // 里过滤掉（见 enemies.ts），跑完之后再去 g.enemies.list 里数死了几只，数出来
    // 恒是 0——死的早被移出数组了。必须自己攥住这份引用，逐个查 .alive。
    const formation = Array.from({ length: n }, (_, i) => makeEnemy({
      kind: 'walker', x: p.pos.x + i * 90, y, w: 24, h: 20,
      dir: 1, minX: 0, maxX: p.pos.x + n * 90 + 999,
    }));
    g.enemies.list = formation;
    p.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60, g.level.solids); // 触发冲刺
    let guard = 0;
    // 冲刺本身 + 飞尸连锁都要跑完：飞尸寿命 CORPSE_LIFE 秒，多留几帧让它们飞到头
    while (guard++ < 180 && (g.player.dashing || g.corpses.list.length > 0)) {
      g.update(IDLE, 1 / 60);
    }
    const deadCount = formation.filter(e => !e.alive).length;
    expect(deadCount, '飞尸连锁不该带走全部 10 只，CORPSE_CHAIN_MAX 该拦住').toBeLessThan(n);
    expect(deadCount, '连锁总要打中点什么，不是摆设').toBeGreaterThan(1);
  });

  it('连锁击杀要更新 lastKillBonus：飘字读的是这一帧真加的分，不是上一次直击的旧值', () => {
    // main.ts:544-546 的不变量写得很死：飘的数必须是「这一次真加的」分，统一由
    // game 报出来。直击那支（约 333 行）设了 lastKillBonus，连锁那支（348 行
    // 附近）漏了——飞尸要飞好几帧才追上第二只，连锁帧几乎从不与直击帧共帧，
    // 这个错误数字因此几乎每次连锁都会飘出来，却没有任何测试碰过它。
    const g = new Game(1);
    g.start();
    const p = g.player;
    const y = p.pos.y;
    const e0 = makeEnemy({ kind: 'walker', x: p.pos.x, y, w: 24, h: 20, dir: 1, minX: 0, maxX: 9999 });
    const e1 = makeEnemy({ kind: 'walker', x: p.pos.x + 150, y, w: 24, h: 20, dir: 1, minX: 0, maxX: 9999 });
    g.enemies.list = [e0, e1];
    p.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60, g.level.solids); // 触发冲刺，直击 e0
    let prevBonus = g.score.bonus;
    let sawChainKill = false;
    for (let i = 0; i < 60 && e1.alive; i++) {
      g.update(IDLE, 1 / 60);
      if (!e1.alive) {
        // 冲刺早该结束了才轮到 e1 死，确认这是飞尸连锁的战果，不是二次直击
        expect(g.player.dashing, '这条要测连锁击杀，不该是冲刺本身又直接碰到了 e1').toBe(false);
        expect(g.lastKillBonus).toBe(g.score.bonus - prevBonus);
        sawChainKill = true;
      }
      prevBonus = g.score.bonus;
    }
    expect(sawChainKill, '没等到连锁击杀，测试设置有问题').toBe(true);
  });
});

describe('新敌人首见即教', () => {
  const put = (g: Game, kind: EnemyKind) => {
    g.enemies.list = [makeEnemy({
      kind, x: g.player.pos.x + 200, y: g.player.pos.y, w: 24, h: 20, minX: 0, maxX: 9999,
    })];
  };

  /**
   * 造一局「已经跑过一阵子」的游戏，越过 hint.run(3.2s)/hint.jump(10s)/
   * hint.kill(kills<3) 三道窗口——t≈0 时不可能有盾旱魃（250 步外才解锁），
   * 拿那个不可能出现的时刻去测「提示会不会出现」没有意义，也测不出真实
   * 优先级（旧写法插在 hint.kill 之后，若这三道窗口没让开，会被它们抢先）。
   *
   * elapsed 是公开字段，直接推没有问题；kills 是私有字段，走真实的踩杀
   * 路径拿到 3——「杀够三只」本身就该走一遍真实的击杀矩阵，没必要假造。
   * 特意不用 `update()` 真跑上十几秒去凑 elapsed：那样会牵连长夜追及、
   * procedural 地形缺口这些跟 hint 优先级毫不相干的系统（已实测：原地不动
   * 约 7.7s 被长夜追上，光跑不跳会在约 2.9s 掉进一处需要冲刺才能过的坑），
   * 让测试对不相关的改动也变脆。
   */
  const readyGame = (): Game => {
    const g = new Game(1);
    g.start();
    for (let i = 0; i < 3; i++) {
      const p = g.player;
      g.enemies.list = [makeEnemy({
        kind: 'walker', x: p.pos.x, y: p.pos.y, w: 24, h: 20, dir: 1, minX: 0, maxX: 9999,
      })];
      p.pos.y -= 30; p.vel.y = 400; // 自上方落下踩杀，见上方 confront() 同款手法
      g.update(IDLE, 1 / 60);
    }
    g.enemies.list = [];
    g.elapsed = 11;
    return g;
  };

  it('盾旱魃进屏时讲一次，且只讲一次', () => {
    const g = readyGame();
    put(g, 'shield');
    g.update(IDLE, 1 / 60);
    expect(g.hint).toBe('hint.shield');

    // 讲完这一轮之后再遇到同类，不该再占视线
    for (let i = 0; i < 60 * 5; i++) g.update(IDLE, 1 / 60);
    put(g, 'shield');
    g.update(IDLE, 1 / 60);
    expect(g.hint).not.toBe('hint.shield');
  });

  it('hint 是纯读的：连读两次不会把提示读没', () => {
    const g = readyGame();
    put(g, 'shield');
    g.update(IDLE, 1 / 60);
    expect(g.hint).toBe('hint.shield');
    expect(g.hint, '第二次读拿到的必须还是它').toBe('hint.shield');
  });
});
