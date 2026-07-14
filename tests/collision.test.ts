import { describe, it, expect } from 'vitest';
import { aabbOverlap, moveAndCollide } from '../src/game/collision';

const ground = { x: 0, y: 100, w: 1000, h: 32 };

describe('aabbOverlap', () => {
  it('相交为真，边缘相触不算相交', () => {
    expect(aabbOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(aabbOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('moveAndCollide', () => {
  it('自由下落落到地面上并报告 onGround', () => {
    const r = { x: 10, y: 40, w: 20, h: 28 };
    const out = moveAndCollide(r, { x: 0, y: 500 }, 0.5, [ground]);
    expect(out.pos.y).toBeCloseTo(100 - 28); // 贴住地面顶
    expect(out.onGround).toBe(true);
    expect(out.hitY).toBe(true);
  });

  it('水平撞墙贴面停下', () => {
    const wall = { x: 100, y: 0, w: 32, h: 200 };
    const r = { x: 50, y: 50, w: 20, h: 28 };
    const out = moveAndCollide(r, { x: 400, y: 0 }, 1, [wall]);
    expect(out.pos.x).toBeCloseTo(100 - 20);
    expect(out.hitX).toBe(true);
  });

  it('无碰撞时正常位移且 onGround 为假', () => {
    const r = { x: 0, y: 0, w: 20, h: 28 };
    const out = moveAndCollide(r, { x: 100, y: 50 }, 0.1, [ground]);
    expect(out.pos.x).toBeCloseTo(10);
    expect(out.pos.y).toBeCloseTo(5);
    expect(out.onGround).toBe(false);
  });

  it('高速穿透防护：一帧内不会穿过薄平台', () => {
    const thin = { x: 0, y: 100, w: 1000, h: 4 };
    const r = { x: 10, y: 0, w: 20, h: 28 };
    const out = moveAndCollide(r, { x: 0, y: 5000 }, 0.1, [thin]); // 一帧位移 500px
    expect(out.pos.y).toBeCloseTo(100 - 28);
  });

  it('起始重叠时不锁死：可从固体中向外移动', () => {
    const r = { x: 0, y: 90, w: 20, h: 28 }; // 已嵌入 ground（ground.y=100）
    const out = moveAndCollide(r, { x: 0, y: -100 }, 0.5, [ground]);
    expect(out.pos.y).toBeCloseTo(90 - 50); // 自由向上脱出
    expect(out.hitY).toBe(false);
  });
});
