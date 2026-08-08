import { describe, it, expect } from 'vitest';
import { CHUNKS, type ChunkDef } from '../src/game/chunks';
import { parseChunk } from '../src/game/level';
import { Player } from '../src/game/player';
import { MAX_SEAM_CLIMB } from '../src/game/generator';
import { aabbOverlap } from '../src/game/collision';
import { TILE, WORLD_H, DT, PLAYER_H } from '../src/game/constants';
import type { InputState } from '../src/game/types';

/**
 * 关卡可通过性回归测试。
 *
 * 用真实 Player 物理做 BFS 搜索：每块前接一段助跑平地、后接一段出口平地，
 * 判定「能否跑到出口且以出口高度出场」。只给「跑 + 跳 + 前冲」——上冲/斜上冲
 * 是隐藏技巧，关卡不该强制要求。
 *
 * grain = 决策粒度（帧）：每 grain 帧才允许改一次输入，pressed 只在首帧生效。
 * grain=6（100ms）粗于人手精度，能过说明容错窗口够宽，而非帧完美才行。
 */

const LEAD = 10;
const GRAIN = 6;

function buildWorld(def: ChunkDef) {
  const flat = (id: string, y: number, w: number): ChunkDef => ({
    id, difficulty: 1, entryY: y, exitY: y,
    rows: def.rows.map((_, r) => (r >= y ? '#' : '.').repeat(w)),
  });
  const a = parseChunk(flat('lead', def.entryY, LEAD), 0);
  const b = parseChunk(def, LEAD * TILE);
  const c = parseChunk(flat('tail', def.exitY, 4), LEAD * TILE + b.width);
  return {
    solids: [...a.solids, ...b.solids, ...c.solids],
    spikes: [...a.spikes, ...b.spikes, ...c.spikes],
    crystals: [...a.crystals, ...b.crystals],
    goalX: LEAD * TILE + b.width + 3 * TILE,
  };
}

function inp(o: Partial<InputState>): InputState {
  return {
    left: false, right: true, up: false, down: false,
    jumpPressed: false, jumpHeld: true, dashPressed: false, ultimatePressed: false, ...o,
  };
}
const RUN = inp({});
const JUMP = inp({ jumpPressed: true });
const DASH = inp({ dashPressed: true });

const snapshot = (p: Player) => JSON.parse(JSON.stringify(p));
const revive = (s: unknown) =>
  Object.assign(Object.create(Player.prototype), JSON.parse(JSON.stringify(s))) as Player;

function clearable(def: ChunkDef, actions: InputState[], maxStates = 400000): boolean {
  const w = buildWorld(def);
  const start = new Player({ x: 16, y: def.entryY * TILE - PLAYER_H });
  const queue: { p: unknown; taken: boolean[]; f: number }[] =
    [{ p: snapshot(start), taken: w.crystals.map(() => false), f: 0 }];
  const seen = new Set<string>();
  let states = 0;

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.f > 320) continue;
    for (const act of actions) {
      const p = revive(cur.p);
      const taken = [...cur.taken];
      let dead = false, won = false;
      for (let k = 0; k < GRAIN; k++) {
        p.update(k === 0 ? act : { ...act, jumpPressed: false, dashPressed: false }, DT, w.solids);
        const r = p.rect;
        if (p.pos.y > WORLD_H + 64 || w.spikes.some(s => aabbOverlap(r, s))) { dead = true; break; }
        const cx = p.pos.x + r.w / 2, cy = p.pos.y + r.h / 2;
        for (let i = 0; i < w.crystals.length; i++) {
          if (!taken[i] && Math.hypot(w.crystals[i].x - cx, w.crystals[i].y - cy) <= 24) {
            taken[i] = true;
            p.refillDash();
          }
        }
        if (p.pos.x >= w.goalX) { won = true; break; }
      }
      if (dead) continue;
      if (won) return true;
      const key = [
        Math.round(p.pos.x / 4), Math.round(p.pos.y / 4),
        Math.round(p.vel.x / 30), Math.round(p.vel.y / 40),
        +p.canDash, +p.dashing, +p.onGround, taken.filter(Boolean).length,
      ].join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      if (++states > maxStates) return false;
      queue.push({ p: snapshot(p), taken, f: cur.f + 1 });
    }
  }
  return false;
}

describe('关卡可通过性', () => {
  it('每一块都能用「跑+跳+前冲」通过，不依赖上冲/斜上冲', () => {
    const stuck = CHUNKS.filter(c => !clearable(c, [RUN, JUMP, DASH])).map(c => c.id);
    expect(stuck, `这些块跳不过去: ${stuck.join(', ')}`).toEqual([]);
  }, 120000);

  // 设计契约：坑宽按**纯跳**极限设，冲刺只做省时/吃分的捷径，不做通关门票。
  // 冲刺的真实包络比直觉大得多（最优时机是起跳后 500ms、正在下落时冲，靠冲刺结束
  // 时 vel.y 归零续滞空，能跨 9.5 格）——照那个极限画图，玩家按直觉起跳即冲只跨
  // 得了 7 格，会掉进设计者以为"过得去"的坑里。所以门槛一律压在纯跳的 6.13 格内。
  it('每一块都只靠跑跳就能过，冲刺不是通关门票', () => {
    const stuck = CHUNKS.filter(c => !clearable(c, [RUN, JUMP])).map(c => c.id);
    expect(stuck, `这些块必须冲刺才能过: ${stuck.join(', ')}`).toEqual([]);
  }, 120000);
});

describe('可通过性判定自身有效', () => {
  // 这两块都能通过 validateChunk（结构合法），只有跑物理才看得出过不去——
  // 若下面两条不再 FAIL，说明判定失灵了，上面的绿灯也不可信。
  const pad = (bottom: string[]): string[] => [
    ...Array.from({ length: 18 - bottom.length }, () => '.'.repeat(bottom[0].length)),
    ...bottom,
  ];

  it('一跃爬升 4 格 → 判定为过不去', () => {
    const badClimb: ChunkDef = {
      id: 'bad-climb', difficulty: 5, entryY: 15, exitY: 11,
      rows: pad([
        '................', '.........*..o...', '............####',
        '................', '................', '................',
        '####^^^^^^^^....', '################', '################',
      ]),
    };
    expect(clearable(badClimb, [RUN, JUMP, DASH])).toBe(false);
  }, 120000);

  it('无水晶的 12 格深渊 → 判定为过不去', () => {
    const badGap: ChunkDef = {
      id: 'bad-gap', difficulty: 5, entryY: 14, exitY: 14,
      rows: pad([
        '................', '................', '................',
        '##............##', '##............##', '##............##', '##............##',
      ]),
    };
    expect(clearable(badGap, [RUN, JUMP, DASH])).toBe(false);
  }, 120000);
});

describe('跳跃包络', () => {
  const ground = [{ x: -1000, y: 14 * TILE, w: 4000, h: TILE }];
  const arc = (plan: (f: number) => Partial<InputState>) => {
    const p = new Player({ x: 0, y: 14 * TILE - PLAYER_H });
    for (let f = 0; f < 40; f++) p.update(RUN, DT, ground); // 助跑到满速
    const x0 = p.pos.x, y0 = p.pos.y;
    let rise = 0;
    for (let f = 0; f < 200; f++) {
      p.update(inp(plan(f)), DT, ground);
      rise = Math.max(rise, y0 - p.pos.y);
      if (f > 2 && p.onGround) break;
    }
    return { dist: p.pos.x - x0, rise };
  };

  it('纯跳最多升约 3 格 / 越约 5 格', () => {
    const { dist, rise } = arc(f => (f === 0 ? { jumpPressed: true } : {}));
    expect(rise).toBeGreaterThan(2 * TILE);
    expect(rise).toBeLessThan(3.2 * TILE);
    expect(dist).toBeGreaterThan(4.5 * TILE);
  });

  it('接缝爬升上限须落在纯跳升幅之内', () => {
    const { rise } = arc(f => (f === 0 ? { jumpPressed: true } : {}));
    expect(MAX_SEAM_CLIMB * TILE).toBeLessThan(rise);
  });

  it('前冲只延长滞空、不加高度：升幅不变而距离显著变远', () => {
    const plain = arc(f => (f === 0 ? { jumpPressed: true } : {}));
    const dashed = arc(f => (f === 0 ? { jumpPressed: true } : f === 20 ? { dashPressed: true } : {}));
    expect(dashed.rise).toBeCloseTo(plain.rise, 0);
    expect(dashed.dist).toBeGreaterThan(plain.dist + 2 * TILE);
  });
});
