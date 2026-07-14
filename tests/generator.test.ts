import { describe, it, expect } from 'vitest';
import { mulberry32, difficultyForDistance, ChunkStream, dailySeed } from '../src/game/generator';
import { CHUNKS } from '../src/game/chunks';

describe('dailySeed', () => {
  it('同日期同种子、不同日期不同种子', () => {
    expect(dailySeed('2026-07-13')).toBe(dailySeed('2026-07-13'));
    expect(dailySeed('2026-07-13')).not.toBe(dailySeed('2026-07-14'));
  });
  it('落在 31 位正整数域', () => {
    const s = dailySeed('2026-01-01');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 31);
  });
});

describe('mulberry32', () => {
  it('同种子序列一致，不同种子不同', () => {
    const a1 = mulberry32(42), a2 = mulberry32(42), b = mulberry32(7);
    const s1 = [a1(), a1(), a1()];
    expect([a2(), a2(), a2()]).toEqual(s1);
    expect([b(), b(), b()]).not.toEqual(s1);
  });
  it('输出在 [0,1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('difficultyForDistance', () => {
  it('难度随距离上升', () => {
    expect(difficultyForDistance(0)).toEqual({ min: 1, max: 1 });
    expect(difficultyForDistance(300)).toEqual({ min: 1, max: 2 });
    expect(difficultyForDistance(500)).toEqual({ min: 1, max: 3 });
    expect(difficultyForDistance(700)).toEqual({ min: 2, max: 4 });
    expect(difficultyForDistance(2000)).toEqual({ min: 3, max: 5 });
  });
});

describe('ChunkStream', () => {
  it('开局只出低难度块', () => {
    const cs = new ChunkStream(mulberry32(1));
    for (let i = 0; i < 20; i++) {
      const c = cs.next(0, 14);
      expect(c.difficulty).toBeLessThanOrEqual(2);
    }
  });
  it('入口高度与上一出口差不超过 3', () => {
    const cs = new ChunkStream(mulberry32(2));
    let exitY = 14;
    for (let i = 0; i < 200; i++) {
      const c = cs.next(i * 20, exitY);
      expect(Math.abs(c.entryY - exitY)).toBeLessThanOrEqual(3);
      exitY = c.exitY;
    }
  });
  it('不连续重复同一块', () => {
    const cs = new ChunkStream(mulberry32(3));
    let prev = '';
    let exitY = 14;
    for (let i = 0; i < 100; i++) {
      const c = cs.next(400, exitY);
      expect(c.id).not.toBe(prev);
      prev = c.id;
      exitY = c.exitY;
    }
  });
  it('健壮性：1000 段模拟拼接不中断、覆盖多种块', () => {
    const cs = new ChunkStream(mulberry32(99));
    const seen = new Set<string>();
    let exitY = 14;
    for (let i = 0; i < 1000; i++) {
      const c = cs.next(i * 15, exitY);
      seen.add(c.id);
      exitY = c.exitY;
    }
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(8, CHUNKS.length));
  });
  it('库完整性：每个出口高度都存在可衔接的入口', () => {
    for (const c of CHUNKS) {
      const compatible = CHUNKS.some(n => n.id !== c.id && Math.abs(n.entryY - c.exitY) <= 3);
      expect(compatible, `chunk ${c.id} 出口 ${c.exitY} 无人可接`).toBe(true);
    }
  });
});
