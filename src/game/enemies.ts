import type { Rect } from './types';
import { aabbOverlap } from './collision';
import { TILE } from './constants';

export type EnemyKind = 'walker' | 'flyer';

export interface Enemy {
  kind: EnemyKind;
  x: number; y: number; w: number; h: number; // AABB，x/y = 左上角
  dir: 1 | -1;   // walker 移动方向；flyer 未用
  baseY: number; // flyer 正弦基线；walker 未用
  phase: number; // flyer 相位
  alive: boolean;
  minX: number;  // walker 巡逻左边界；flyer 未用（0）
  maxX: number;  // walker 巡逻右边界；flyer 未用（0）
}

const NO_SPAWN_UNTIL_M = 30; // 仅前 30 步无怪（学会奔跑），此后即稀疏现怪
const SPAWN_START_X = 1200;
const WALKER_W = 24;
const WALKER_H = 20;
const FLYER_W = 26;
const FLYER_H = 18;
const PLATFORM_MIN_Y = 4 * TILE;
const PLATFORM_MAX_Y = 17 * TILE;
const PLATFORM_MIN_W = 4 * TILE;
const WALKER_SPEED = 60;
const FLYER_SWING = 26;                     // flyer 正弦摆幅
const FLYER_MIN_Y = 6 * TILE;
const FLYER_MAX_Y = 12 * TILE;
// flyer 基线被地形挡住时，按此顺序就近让位（不额外消耗 rng，保持种子可复现）
const FLYER_NUDGE = [-TILE, TILE, -2 * TILE, 2 * TILE, -3 * TILE, 3 * TILE, -4 * TILE, 4 * TILE];

// 早期间距大（稀疏现怪），随路程渐密：约 900px→280px（约 1200 步触底）
function interval(distanceM: number): number {
  return Math.max(280, 900 - distanceM * 0.5);
}

export class Enemies {
  list: Enemy[] = [];
  private nextSpawnX = SPAWN_START_X;

  constructor(private rng: () => number) {}

  ensure(rightEdgeX: number, distanceM: number, solids: Rect[], spikes: Rect[] = []): void {
    while (this.nextSpawnX < rightEdgeX) {
      const x = this.nextSpawnX;
      if (distanceM >= NO_SPAWN_UNTIL_M) {
        this.spawnAt(x, solids, spikes);
      }
      this.nextSpawnX += interval(distanceM) * (0.75 + this.rng() * 0.5);
    }
  }

  /**
   * 求 x 处可供 walker 落脚的「露天地面」：地表格上方既无尖刺也无实体。
   *
   * 只取最高实体是不够的——刺行（'^'）不是实体，所以刺底下那层地面会被当成
   * 地表，小怪就被埋进地形里（玩家进不去，自然也不该有怪）。这里逐格向两侧
   * 扩张出一段真正露天的巡逻区间，够宽才认。
   */
  private standing(x: number, solids: Rect[], spikes: Rect[]) {
    const cands = solids
      .filter(s => x >= s.x && x < s.x + s.w && s.y >= PLATFORM_MIN_Y && s.y <= PLATFORM_MAX_Y)
      .sort((a, b) => a.y - b.y);
    for (const s of cands) {
      const open = (col: number) => {
        const cell: Rect = { x: col, y: s.y - TILE, w: TILE, h: TILE };
        return !spikes.some(k => aabbOverlap(cell, k)) && !solids.some(o => o !== s && aabbOverlap(cell, o));
      };
      const first = s.x + Math.floor((x - s.x) / TILE) * TILE;
      if (!open(first)) continue;
      let lo = first, hi = first + TILE;
      while (lo - TILE >= s.x && open(lo - TILE)) lo -= TILE;
      while (hi + TILE <= s.x + s.w && open(hi)) hi += TILE;
      if (hi - lo >= PLATFORM_MIN_W) return { top: s.y, minX: lo, maxX: hi - WALKER_W };
    }
    return undefined;
  }

  private spawnAt(x: number, solids: Rect[], spikes: Rect[]): void {
    const ground = this.standing(x, solids, spikes);

    if (ground) {
      const { top, minX, maxX } = ground;
      this.list.push({
        kind: 'walker',
        x: Math.min(Math.max(x, minX), maxX),
        y: top - WALKER_H,
        w: WALKER_W, h: WALKER_H,
        dir: this.rng() < 0.5 ? -1 : 1,
        baseY: 0, phase: 0,
        alive: true,
        minX, maxX,
      });
      return;
    }

    // 飞怪：整条摆动带都必须在空中，否则会半嵌在山体里
    const rawY = FLYER_MIN_Y + this.rng() * (FLYER_MAX_Y - FLYER_MIN_Y);
    const phase = this.rng() * Math.PI * 2;
    const blocked = (y: number) =>
      solids.some(s => aabbOverlap({ x, y: y - FLYER_SWING, w: FLYER_W, h: FLYER_H + FLYER_SWING * 2 }, s));
    let baseY = rawY;
    if (blocked(baseY)) {
      const clear = FLYER_NUDGE
        .map(d => rawY + d)
        .find(y => y >= PLATFORM_MIN_Y && y <= FLYER_MAX_Y && !blocked(y));
      if (clear === undefined) return; // 此处上下都是地形，索性不生成
      baseY = clear;
    }
    this.list.push({
      kind: 'flyer',
      x, y: baseY,
      w: FLYER_W, h: FLYER_H,
      dir: 1,
      baseY, phase,
      alive: true,
      minX: 0, maxX: 0,
    });
  }

  update(dt: number, _solids: Rect[]): void {
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.kind === 'walker') {
        e.x += e.dir * WALKER_SPEED * dt;
        if (e.x <= e.minX) { e.x = e.minX; e.dir = 1; }
        else if (e.x >= e.maxX) { e.x = e.maxX; e.dir = -1; }
      } else {
        e.phase += dt * 3;
        e.y = e.baseY + Math.sin(e.phase) * FLYER_SWING;
      }
    }
    this.list = this.list.filter(e => e.alive);
  }

  prune(leftEdgeX: number): void {
    this.list = this.list.filter(e => e.alive && e.x + e.w >= leftEdgeX);
  }
}
