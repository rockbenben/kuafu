import { describe, it, expect } from 'vitest';
import { CHUNKS, validateChunk, type ChunkDef } from '../src/game/chunks';
import { WORLD_ROWS } from '../src/game/constants';

describe('validateChunk', () => {
  const base: ChunkDef = {
    id: 't', difficulty: 1, entryY: 14, exitY: 14,
    rows: Array.from({ length: WORLD_ROWS }, (_, r) =>
      r === 14 ? '########' : '........'),
  };
  it('合法块通过', () => {
    expect(validateChunk(base)).toEqual([]);
  });
  it('行数不对报错', () => {
    expect(validateChunk({ ...base, rows: base.rows.slice(1) })).not.toEqual([]);
  });
  it('入口无地面报错', () => {
    const rows = [...base.rows];
    rows[14] = '.#######';
    expect(validateChunk({ ...base, rows })).not.toEqual([]);
  });
  it('非法字符报错', () => {
    const rows = [...base.rows];
    rows[0] = 'x.......';
    expect(validateChunk({ ...base, rows })).not.toEqual([]);
  });
});

describe('CHUNKS 内容库', () => {
  it('至少 20 块且 id 唯一', () => {
    expect(CHUNKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CHUNKS.map(c => c.id)).size).toBe(CHUNKS.length);
  });
  it('难度 1~5 每级至少 2 块', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      expect(CHUNKS.filter(c => c.difficulty === d).length, `难度 ${d}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('每一块都通过校验', () => {
    for (const c of CHUNKS) {
      expect(validateChunk(c), `chunk ${c.id}: ${validateChunk(c).join('; ')}`).toEqual([]);
    }
  });
  it('难度 1 和 2 各至少 3 块（开局供给）', () => {
    expect(CHUNKS.filter(c => c.difficulty === 1).length).toBeGreaterThanOrEqual(3);
    expect(CHUNKS.filter(c => c.difficulty === 2).length).toBeGreaterThanOrEqual(3);
  });
});
