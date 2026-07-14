import type { Rect, Vec2 } from './types';

export function aabbOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 单轴扫掠：把 delta 拆成不超过半个体宽/体高的子步，逐步推进防穿透。 */
function sweepAxis(rect: Rect, delta: number, axis: 'x' | 'y', solids: Rect[]): { moved: number; hit: boolean } {
  const size = axis === 'x' ? rect.w : rect.h;
  const maxStep = Math.max(1, size / 2);
  let remaining = delta;
  let moved = 0;
  while (remaining !== 0) {
    const step = Math.abs(remaining) <= maxStep ? remaining : Math.sign(remaining) * maxStep;
    const probe = { ...rect };
    probe[axis] = rect[axis] + moved + step;
    const blocker = solids.find(s => aabbOverlap(probe, s));
    if (blocker) {
      // 贴面
      if (step > 0) moved = (axis === 'x' ? blocker.x - rect.w : blocker.y - rect.h) - rect[axis];
      else moved = (axis === 'x' ? blocker.x + blocker.w : blocker.y + blocker.h) - rect[axis];
      return { moved, hit: true };
    }
    moved += step;
    remaining -= step;
  }
  return { moved, hit: false };
}

export function moveAndCollide(rect: Rect, vel: Vec2, dt: number, solids: Rect[]) {
  const active = solids.filter(s => !aabbOverlap(rect, s)); // 起始已嵌入的固体忽略，允许脱出
  const rx = sweepAxis(rect, vel.x * dt, 'x', active);
  const afterX: Rect = { ...rect, x: rect.x + rx.moved };
  const ry = sweepAxis(afterX, vel.y * dt, 'y', active);
  return {
    pos: { x: afterX.x, y: afterX.y + ry.moved },
    hitX: rx.hit,
    hitY: ry.hit,
    onGround: ry.hit && vel.y > 0,
  };
}
