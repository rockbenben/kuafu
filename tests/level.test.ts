import { describe, it, expect } from 'vitest';
import { parseChunk, Level } from '../src/game/level';
import { ChunkStream, mulberry32 } from '../src/game/generator';
import { TILE, WORLD_ROWS } from '../src/game/constants';
import type { ChunkDef } from '../src/game/chunks';

const tiny: ChunkDef = {
  id: 'tiny', difficulty: 1, entryY: 16, exitY: 16,
  rows: [
    ...Array.from({ length: WORLD_ROWS - 4 }, () => '........'),
    '.o..*...',
    '..^^....',
    '########',
    '########',
  ],
};

describe('parseChunk', () => {
  it('连续实心合并为一个矩形', () => {
    const out = parseChunk(tiny, 0);
    expect(out.solids).toContainEqual({ x: 0, y: 16 * TILE, w: 8 * TILE, h: TILE });
  });
  it('尖刺为贴地半格矩形', () => {
    const out = parseChunk(tiny, 0);
    expect(out.spikes.length).toBe(2);
    expect(out.spikes[0]).toEqual({ x: 2 * TILE, y: 15 * TILE + TILE / 2, w: TILE, h: TILE / 2 });
  });
  it('光点与水晶取格中心并应用偏移', () => {
    const out = parseChunk(tiny, 100);
    expect(out.motes[0]).toEqual({ x: 100 + 1 * TILE + TILE / 2, y: 14 * TILE + TILE / 2, taken: false });
    expect(out.crystals[0].x).toBe(100 + 4 * TILE + TILE / 2);
  });
  it('宽度正确', () => {
    expect(parseChunk(tiny, 0).width).toBe(8 * TILE);
  });
});

describe('Level', () => {
  it('ensure 扩展世界至覆盖目标右边界', () => {
    const lv = new Level(new ChunkStream(mulberry32(1)));
    lv.ensure(5000, 0);
    const maxRight = Math.max(...lv.solids.map(s => s.x + s.w));
    expect(maxRight).toBeGreaterThanOrEqual(5000);
  });
  it('prune 清理左侧过期实体', () => {
    const lv = new Level(new ChunkStream(mulberry32(1)));
    lv.ensure(8000, 0);
    lv.prune(3000);
    expect(lv.solids.every(s => s.x + s.w >= 3000)).toBe(true);
    expect(lv.motes.every(m => m.x >= 3000)).toBe(true);
  });
});
