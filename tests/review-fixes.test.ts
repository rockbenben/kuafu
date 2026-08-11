import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { makeEnemy } from '../src/game/enemies';
import { Player } from '../src/game/player';
import { BOUNCE_SPEED, STRIDE_KILL_BONUS, CHARGE_PER_KILL, DASH_TIME, TILE, STRIDE_TIME, PLAYER_W, PLAYER_H } from '../src/game/constants';
import type { InputState, Rect } from '../src/game/types';

const IDLE: InputState = {
  left: false, right: false, up: false, down: false,
  jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false,
};

/** 开一局。夹具沿用 tests/game.test.ts 的 confront：怪与玩家重叠，单帧驱动。 */
function fresh() {
  const g = new Game(1);
  g.start();
  return g;
}

describe('同帧踩踏不得把玩家判死', () => {
  it('踩中两只重叠的怪：第一只死，玩家活着', () => {
    const g = fresh();
    const p = g.player;
    g.enemies.list = [
      makeEnemy({ kind: 'walker', x: p.pos.x, y: p.pos.y, w: 24, h: 20, minX: 0, maxX: 9999 }),
      makeEnemy({ kind: 'walker', x: p.pos.x + 4, y: p.pos.y, w: 24, h: 20, minX: 0, maxX: 9999 }),
    ];
    p.pos.y -= 30; p.vel.y = 400;        // 自上方落下（与 game.test.ts 的 confront 同法）
    g.update(IDLE, 1 / 60);
    expect(g.justKilledEnemy, '前提：踩踏确实生效了').toBe(true);
    expect(g.state, 'stompBounce 翻了 vel.y，第二只怪于是判成撞死').toBe('playing');
  });
});

describe('弹回必须把玩家推离盾，而不是推进盾里', () => {
  it('玩家在盾右侧撞其正面：被推向右', () => {
    const g = fresh();
    const p = g.player;
    // 盾朝右（dir=1），玩家站在它右侧 → isFrontal 为真
    g.enemies.list = [makeEnemy({
      kind: 'shield', x: p.pos.x, y: p.pos.y, w: 24, h: 20, dir: 1, minX: 0, maxX: 9999,
    })];
    // 向右冲：玩家最终停在怪心右侧，dir=1 → isFrontal 为真 → 弹回
    p.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60, g.level.solids);
    g.update(IDLE, 1 / 60);
    expect(g.justBounced, '前提：确实弹回了').toBe(true);
    expect(p.vel.x, '玩家在盾右侧，应被推向右（正值）').toBe(BOUNCE_SPEED);
  });

  it('玩家在盾左侧撞其正面：被推向左', () => {
    const g = fresh();
    const p = g.player;
    g.enemies.list = [makeEnemy({
      kind: 'shield', x: p.pos.x, y: p.pos.y, w: 24, h: 20, dir: -1, minX: 0, maxX: 9999,
    })];
    // 向左冲：玩家最终停在怪心左侧，dir=-1 → isFrontal 为真 → 弹回
    p.update({ ...IDLE, dashPressed: true, left: true }, 1 / 60, g.level.solids);
    g.update(IDLE, 1 / 60);
    expect(g.justBounced).toBe(true);
    expect(p.vel.x, '玩家在盾左侧，应被推向左（负值）').toBe(-BOUNCE_SPEED);
  });
});

describe('跨步落地后的无敌余威，按普通击杀记分', () => {
  it('那 3 秒里的击杀要进连杀、要充神力', () => {
    const g = fresh();
    const p = g.player;
    p.stride();
    for (let i = 0; i < 60; i++) g.update(IDLE, 1 / 60);   // 跨步早已结束，仍在无敌窗口
    expect(p.striding, '前提：横越已结束').toBe(false);
    expect(p.invincible, '前提：仍在跨步余威的无敌窗口内').toBe(true);

    const bonusBefore = g.score.bonus, chargeBefore = g.charge;
    g.enemies.list = [makeEnemy({
      kind: 'walker', x: p.pos.x, y: p.pos.y, w: 24, h: 20, minX: 0, maxX: 9999,
    })];
    g.update(IDLE, 1 / 60);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.combo.count, '余威期的击杀该计入连杀').toBe(1);
    expect(g.score.bonus - bonusBefore, '不该只给 STRIDE_KILL_BONUS').not.toBe(STRIDE_KILL_BONUS);
    expect(g.charge - chargeBefore, '余威期的击杀该充神力').toBeCloseTo(CHARGE_PER_KILL, 5);
  });
});

describe('弹回只夺走水平控制权，不该连跳跃一起吞掉', () => {
  it('弹回窗口内按跳仍然起跳', () => {
    const g = fresh();
    const p = g.player;
    // 玩家出生在地面上方 32px，先落地站稳——不然 coyote 早已归零，测的就不是弹回了
    for (let i = 0; i < 20 && !p.onGround; i++) g.update(IDLE, 1 / 60);
    expect(p.onGround, '前提：已落地').toBe(true);
    g.enemies.list = [makeEnemy({
      kind: 'shield', x: p.pos.x, y: p.pos.y, w: 24, h: 20, dir: 1, minX: 0, maxX: 9999,
    })];
    p.update({ ...IDLE, dashPressed: true, right: true }, 1 / 60, g.level.solids);
    g.update(IDLE, 1 / 60);
    expect(g.justBounced, '前提：确实弹回了').toBe(true);
    expect(p.bouncing, '前提：仍在弹回窗口内').toBe(true);

    // 在崖边被弹一下还不能跳，人就被推下去了——代价该是掉速，不是断手
    const before = p.vel.y;
    p.update({ ...IDLE, jumpPressed: true, jumpHeld: true }, 1 / 60, g.level.solids);
    expect(p.vel.y, '弹回期间按跳应当起跳（vel.y 转为明显向上）').toBeLessThan(before - 100);
  });
});

describe('冲刺撞墙不再把人钉在半空', () => {
  const DT = 1 / 60;
  const inp = (o: Partial<InputState> = {}): InputState => ({
    left: false, right: false, up: false, down: false,
    jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false, ...o,
  });
  const FRAMES = Math.round(DASH_TIME * 60);

  /** 下落中向右冲；withWall 时右侧紧贴一堵高墙。地面远在下方，整段不会落地。 */
  function dashRight(withWall: boolean) {
    const solids: Rect[] = [{ x: 0, y: 1800, w: 4000, h: 100 }];
    if (withWall) solids.push({ x: 400, y: 0, w: TILE, h: 900 });
    const p = new Player({ x: 360, y: 300 });
    p.vel.y = 200;
    const y0 = p.pos.y;
    p.update(inp({ right: true, dashPressed: true }), DT, solids);
    for (let i = 0; i < FRAMES; i++) p.update(inp({ right: true }), DT, solids);
    return { dy: p.pos.y - y0, dashing: p.dashing };
  }

  it('贴墙冲刺期间人要继续下落，不是悬着', () => {
    // 冲刺会按住 vel.y（跳+冲跨 9.5 格全靠它）。可横向一旦走不动，这个「按住」
    // 就只剩「人贴在墙上停在半空」这一个效果——实测整段 Δy 为 0。
    // 坏掉时这个值是**准确的 0**，所以门槛设在哪都能抓住回退；取 10 留足余量。
    const { dy } = dashRight(true);
    expect(dy).toBeGreaterThan(10);
  });

  it('没墙时照旧冻结 vel.y——修的是撞墙，不是把冲刺改瘸', () => {
    const free = dashRight(false);
    expect(free.dy).toBeLessThan(12);   // 起冲那一帧之后基本不掉
    expect(free.dashing).toBe(true);    // 整段冲刺仍在进行
  });

  it('撞墙作废的是冲刺本身，且不白送一次新的冲刺', () => {
    const { dashing } = dashRight(true);
    expect(dashing).toBe(false);
  });
});

describe('跨步落进山体时，兜底要把人放到整摞石板的顶上', () => {
  const DT = 1 / 60;
  const idle: InputState = { left: false, right: false, up: false, down: false, jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false };
  /** 按 parseChunk 的口径造地形：每行一个 1 格高的 Rect，从不纵向合并。 */
  const rows = (x: number, w: number, yTop: number, n: number): Rect[] =>
    Array.from({ length: n }, (_, i) => ({ x, y: yTop + i * TILE, w, h: TILE }));
  const embeddedIn = (p: Player, s: Rect[]) =>
    s.filter(q => p.pos.x < q.x + q.w && p.pos.x + PLAYER_W > q.x && p.pos.y < q.y + q.h && p.pos.y + PLAYER_H > q.y);

  /** 跨步一整程，落点正好在一座多行厚的山里。 */
  function strideIntoHill() {
    const solids = [...rows(0, 4000, 500, 4), ...rows(950, 6 * TILE, 260, 8)];
    const p = new Player({ x: 64, y: 500 - PLAYER_H });
    p.stride();
    for (let i = 0; i <= Math.round(STRIDE_TIME * 60); i++) p.update(idle, DT, solids);
    return { p, solids };
  }

  it('落点不得留在石板内部', () => {
    // 人高 28px 装得进单独一行（格高 32），托到「最高的重叠实体」的顶就等于塞进上一行。
    const { p, solids } = strideIntoHill();
    expect(embeddedIn(p, solids).map(s => `y=${s.y}`)).toEqual([]);
  });

  it('要站在山顶那一行上，不是半山腰某一行上', () => {
    const { p } = strideIntoHill();
    expect(p.pos.y).toBe(260 - PLAYER_H);   // 山顶行 y=260
  });

  it('嵌住的人不会自己掉出来——所以兜底必须一次到位', () => {
    // 碰撞会忽略「起始已重叠」的实体以允许脱出，于是嵌住的人既不下落也不被顶开，
    // 只会站在山体内部不动。这条钉住那个前提，说明为什么上面两条不能只靠后续帧修正。
    const solids = [...rows(0, 4000, 500, 4), ...rows(950, 6 * TILE, 260, 8)];
    const stuck = new Player({ x: 1034, y: 328 });   // 整个落在 y=324 那一行内部
    const y0 = stuck.pos.y;
    for (let i = 0; i < 120; i++) stuck.update(idle, DT, solids);
    expect(stuck.pos.y).toBe(y0);
    expect(embeddedIn(stuck, solids).length).toBeGreaterThan(0);
  });
});
