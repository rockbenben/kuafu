import type { Rect } from './types';
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

// 早期间距大（稀疏现怪），随路程渐密：约 900px→280px（约 1200 步触底）
function interval(distanceM: number): number {
  return Math.max(280, 900 - distanceM * 0.5);
}

export class Enemies {
  list: Enemy[] = [];
  private nextSpawnX = SPAWN_START_X;

  constructor(private rng: () => number) {}

  ensure(rightEdgeX: number, distanceM: number, solids: Rect[]): void {
    while (this.nextSpawnX < rightEdgeX) {
      const x = this.nextSpawnX;
      if (distanceM >= NO_SPAWN_UNTIL_M) {
        this.spawnAt(x, solids);
      }
      this.nextSpawnX += interval(distanceM) * (0.75 + this.rng() * 0.5);
    }
  }

  private spawnAt(x: number, solids: Rect[]): void {
    let platform: Rect | undefined;
    for (const s of solids) {
      if (x < s.x || x >= s.x + s.w) continue;
      if (s.y < PLATFORM_MIN_Y || s.y > PLATFORM_MAX_Y) continue;
      if (!platform || s.y < platform.y) platform = s;
    }

    if (platform && platform.w >= PLATFORM_MIN_W) {
      const minX = platform.x;
      const maxX = platform.x + platform.w - WALKER_W;
      this.list.push({
        kind: 'walker',
        x: Math.min(Math.max(x, minX), maxX),
        y: platform.y - WALKER_H,
        w: WALKER_W, h: WALKER_H,
        dir: this.rng() < 0.5 ? -1 : 1,
        baseY: 0, phase: 0,
        alive: true,
        minX, maxX,
      });
    } else {
      const baseY = 6 * TILE + this.rng() * 6 * TILE;
      this.list.push({
        kind: 'flyer',
        x, y: baseY,
        w: FLYER_W, h: FLYER_H,
        dir: 1,
        baseY, phase: this.rng() * Math.PI * 2,
        alive: true,
        minX: 0, maxX: 0,
      });
    }
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
        e.y = e.baseY + Math.sin(e.phase) * 26;
      }
    }
    this.list = this.list.filter(e => e.alive);
  }

  prune(leftEdgeX: number): void {
    this.list = this.list.filter(e => e.alive && e.x + e.w >= leftEdgeX);
  }
}
