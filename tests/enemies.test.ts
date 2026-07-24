import { describe, it, expect } from 'vitest';
import { Enemies } from '../src/game/enemies';
import { Level } from '../src/game/level';
import { ChunkStream, mulberry32 } from '../src/game/generator';
import { aabbOverlap } from '../src/game/collision';
import { TILE } from '../src/game/constants';
import type { Rect } from '../src/game/types';

describe('Enemies.ensure', () => {
  it('distanceM=0 时（未到 30 步）不生成任何敌人', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(8000, 0, []);
    expect(en.list.length).toBe(0);
  });

  it('过 30 步即稀疏现怪：早期就出现，但间距大（数量克制）', () => {
    const early = new Enemies(mulberry32(1));
    early.ensure(3000, 40, []);              // 40 步、约 3 屏范围
    expect(early.list.length).toBeGreaterThan(0);   // 很早就有怪
    expect(early.list.length).toBeLessThan(4);      // 但稀疏（大间距）
    // 早期间距应明显大于后期（越跑越密）
    const late = new Enemies(mulberry32(1));
    late.ensure(3000, 1500, []);             // 同样宽度、后期
    expect(late.list.length).toBeGreaterThan(early.list.length);
  });

  it('distanceM=500 时在 1200..8000 范围内产生多个敌人', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(8000, 500, []);
    expect(en.list.length).toBeGreaterThan(3);
    for (const e of en.list) {
      expect(e.x).toBeGreaterThanOrEqual(1200);
      expect(e.x).toBeLessThan(8000);
    }
  });

  it('平台足够宽时在平台上生成 walker，y 贴平台顶', () => {
    const platform: Rect = { x: 1100, y: 10 * TILE, w: 8 * TILE, h: TILE };
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, 500, [platform]);
    const walker = en.list.find(e => e.kind === 'walker');
    expect(walker).toBeDefined();
    expect(walker!.y).toBe(platform.y - walker!.h);
    expect(walker!.minX).toBe(platform.x);
    expect(walker!.maxX).toBe(platform.x + platform.w - walker!.w);
  });

  it('无可站立平台（或平台过窄）时生成 flyer，baseY 落在 [6*TILE, 12*TILE]', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, 500, []);
    expect(en.list.length).toBe(1);
    const flyer = en.list[0];
    expect(flyer.kind).toBe('flyer');
    expect(flyer.baseY).toBeGreaterThanOrEqual(6 * TILE);
    expect(flyer.baseY).toBeLessThanOrEqual(12 * TILE);
  });

  it('平台过窄（<4*TILE）时生成 flyer 而非 walker', () => {
    const narrow: Rect = { x: 1100, y: 10 * TILE, w: 3 * TILE, h: TILE };
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, 500, [narrow]);
    expect(en.list.length).toBe(1);
    expect(en.list[0].kind).toBe('flyer');
  });
});

describe('小怪不得埋进地形', () => {
  // 玩家进不去的地方就不该有怪：刺行底下那层地面不是"地表"，屋檐压顶的夹层也不是。
  it('walker 的巡逻带绝不与尖刺相交', () => {
    let walkers = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const lv = new Level(new ChunkStream(mulberry32(seed)));
      lv.ensure(30000, 900);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(30000, 900, lv.solids, lv.spikes);
      for (const e of en.list) {
        if (e.kind !== 'walker') continue;
        walkers++;
        const patrol: Rect = { x: e.minX, y: e.y, w: e.maxX - e.minX + e.w, h: e.h };
        const buried = lv.spikes.find(s => aabbOverlap(patrol, s));
        expect(buried, `seed ${seed}: walker@(${e.x.toFixed(0)},${e.y.toFixed(0)}) 埋在尖刺里`)
          .toBeUndefined();
      }
    }
    expect(walkers).toBeGreaterThan(100); // 确保样本量足够，不是"零个怪所以全过"
  });

  it('walker 头顶留有实体空隙（不是站在夹层/岩层里）', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const lv = new Level(new ChunkStream(mulberry32(seed)));
      lv.ensure(20000, 900);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(20000, 900, lv.solids, lv.spikes);
      for (const e of en.list) {
        if (e.kind !== 'walker') continue;
        const body: Rect = { x: e.minX, y: e.y, w: e.maxX - e.minX + e.w, h: e.h };
        const inside = lv.solids.find(s => aabbOverlap(body, s));
        expect(inside, `seed ${seed}: walker@(${e.x.toFixed(0)},${e.y.toFixed(0)}) 嵌在实体里`)
          .toBeUndefined();
      }
    }
  });

  it('flyer 的整条摆动带都在空中', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const lv = new Level(new ChunkStream(mulberry32(seed)));
      lv.ensure(30000, 900);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(30000, 900, lv.solids, lv.spikes);
      for (const e of en.list) {
        if (e.kind !== 'flyer') continue;
        const swept: Rect = { x: e.x, y: e.baseY - 26, w: e.w, h: e.h + 52 };
        const inside = lv.solids.find(s => aabbOverlap(swept, s));
        expect(inside, `seed ${seed}: flyer@(${e.x.toFixed(0)},${e.baseY.toFixed(0)}) 嵌在山体里`)
          .toBeUndefined();
      }
    }
  });
});

describe('Enemies.update', () => {
  it('walker 巡逻到平台边缘折返，且 x 保持在 [minX,maxX] 内', () => {
    const platform: Rect = { x: 1150, y: 10 * TILE, w: 4 * TILE, h: TILE };
    const en = new Enemies(mulberry32(1));
    en.ensure(1250, 500, [platform]);
    const walker = en.list.find(e => e.kind === 'walker');
    expect(walker).toBeDefined();
    const w = walker!;
    let flips = 0;
    let lastDir = w.dir;
    for (let i = 0; i < 600; i++) {
      en.update(1 / 60, [platform]);
      expect(w.x).toBeGreaterThanOrEqual(w.minX);
      expect(w.x).toBeLessThanOrEqual(w.maxX);
      if (w.dir !== lastDir) { flips++; lastDir = w.dir; }
    }
    expect(flips).toBeGreaterThan(0);
  });

  it('flyer 正弦运动，y 在 baseY±26 范围内摆动', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, 500, []);
    const flyer = en.list[0];
    let maxY = -Infinity, minY = Infinity;
    for (let i = 0; i < 300; i++) {
      en.update(1 / 60, []);
      maxY = Math.max(maxY, flyer.y);
      minY = Math.min(minY, flyer.y);
    }
    expect(maxY).toBeLessThanOrEqual(flyer.baseY + 26 + 1e-6);
    expect(minY).toBeGreaterThanOrEqual(flyer.baseY - 26 - 1e-6);
    expect(maxY - minY).toBeGreaterThan(10);
  });

  it('死亡（alive=false）的敌人在 update 后被移除', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, 500, []);
    expect(en.list.length).toBe(1);
    en.list[0].alive = false;
    en.update(1 / 60, []);
    expect(en.list.length).toBe(0);
  });
});

describe('Enemies.prune', () => {
  it('清理左侧过期敌人', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(8000, 500, []);
    const before = en.list.length;
    expect(before).toBeGreaterThan(0);
    en.prune(3000);
    expect(en.list.every(e => e.x + e.w >= 3000)).toBe(true);
    expect(en.list.length).toBeLessThan(before);
  });
});
