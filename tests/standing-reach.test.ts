import { describe, it, expect } from 'vitest';
import { Enemies, isGroundKind } from '../src/game/enemies';
import { Level } from '../src/game/level';
import { ChunkStream, mulberry32 } from '../src/game/generator';
import { JUMP_VEL, GRAVITY, TILE } from '../src/game/constants';
import type { Rect } from '../src/game/types';

/**
 * 小怪不得生成在玩家够不着的面上。
 *
 * `standing()` 按 y 升序取最高的候选实体，只要它上方一格是空的就认作「露天地面」。
 * 隧道的顶板正好满足这一条——`level.ts` 的 parseChunk **按行**生成 1 格高的 Rect、
 * 从不纵向合并，于是 `ceiling-squeeze-3` 与 `spike-tunnel-4` 那块悬空石板上方是天，
 * 被当成了地面，小怪站到隧道**顶上**，而玩家在下面的隧道里跑。
 *
 * 平跳只能升 93px，那块板离地 96px——差 3px，够不着。够不着的怪既打不着也不构成
 * 威胁，白占一个生成额度；盾旱魃还会在那儿画一块高对比的亮石板，明晃晃浮在天上。
 *
 * 这条性质直接在**真实生成的关卡**上验，不搭夹具：手搭的垫片模拟不出前后关卡在
 * 出入口高度上的相接，会把合法高台误判成孤岛。
 */
const APEX = (JUMP_VEL * JUMP_VEL) / (2 * GRAVITY);

/** 该列在 y 之下最近的一个落脚面顶，没有则 undefined。 */
function surfaceBelow(cx: number, y: number, solids: Rect[]): number | undefined {
  return solids.filter(s => cx >= s.x && cx < s.x + s.w && s.y > y + 1)
    .map(s => s.y).sort((a, b) => a - b)[0];
}

/** 该列在 y 高度上有没有实体顶面（容差 1px）。 */
function surfaceAt(cx: number, y: number, solids: Rect[]): boolean {
  return solids.some(s => cx >= s.x && cx < s.x + s.w && Math.abs(s.y - y) < 1);
}

/**
 * 站在 top 上的怪，能不能从别处过来？
 *
 * 侧向探针必须先走到**这块面的两端之外**再看。就地挪两格是错的——落点还在同一块
 * 石板上，`|top - top| = 0` 必然通过，等于什么都没测（第一版就是这么写的）。
 */
function reachable(top: number, cx: number, solids: Rect[]): boolean {
  const below = surfaceBelow(cx, top, solids);
  if (below === undefined) return true;              // 最底层的地面，玩家本就站在上面
  if (below - top <= APEX) return true;              // 从正下方跳得上来
  // 走到这块连续面的两端
  let lo = cx, hi = cx;
  while (surfaceAt(lo - TILE, top, solids)) lo -= TILE;
  while (surfaceAt(hi + TILE, top, solids)) hi += TILE;
  // 端外一格若有落差在跳跃范围内的面，就能平跑/小跳过来
  return [lo - TILE, hi + TILE].some(side =>
    solids.some(s => side >= s.x && side < s.x + s.w && Math.abs(s.y - top) <= APEX));
}

describe('小怪不得站在够不着的面上', () => {
  it('30 个真实关卡里，没有一只地面族敌人站在够不着的面上', () => {
    const bad: string[] = [];
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = new Level(new ChunkStream(mulberry32(seed)));
      lvl.ensure(20000);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(20000, lvl.solids, lvl.spikes);
      for (const e of en.list) {
        if (!isGroundKind(e.kind)) continue;
        total++;
        const feet = e.y + e.h;
        if (!reachable(feet, e.x + e.w / 2, lvl.solids)) {
          bad.push(`seed${seed} ${e.kind} x=${Math.round(e.x)} feet=${feet}`);
        }
      }
    }
    expect(bad.slice(0, 8), `${bad.length}/${total} 只站在够不着的面上`).toEqual([]);
  });

  it('够不着的那批多半是落回了下面的真地面，而不是凭空消失', () => {
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = new Level(new ChunkStream(mulberry32(seed)));
      lvl.ensure(20000);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(20000, lvl.solids, lvl.spikes);
      total += en.list.filter(e => isGroundKind(e.kind)).length;
    }
    // 基线在难度改为按位置计算之后重新量过：同样 30 个种子 × 20000px，地面族
    // 648 只、够不着的 0 只。此前的 889/944 是拿「整段路都按 1200 步」的探针量的，
    // 那个密度在真实游戏里不存在，不能再当基准。
    // 跌破 560 说明判据变严、把合法高台也误伤了——那会连带砍掉敌人的变化性。
    expect(total, `地面族总量 ${total}`).toBeGreaterThan(560);
  });
});
