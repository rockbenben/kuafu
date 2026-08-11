import { describe, it, expect } from 'vitest';
import { Enemies, SPAWN_TERRAIN_MARGIN } from '../src/game/enemies';
import { Level } from '../src/game/level';
import { ChunkStream, mulberry32 } from '../src/game/generator';

/**
 * 今日挑战宣称「全球同日同关卡」——同一个种子必须长出同一个关卡，与玩家怎么跑无关。
 *
 * 这条一直没成立过：生成读的是玩家**实时里程**（`interval(distanceM)`、各道闸门），
 * 而关卡是提前两屏生成的、生成时机随跑法浮动，于是跑得快的人和跑得慢的人打的不是
 * 同一批怪，排行榜不可比。实测改动前 60/60 个种子在三种跑法下两两不一致。
 *
 * 修法是让难度只由**该生成点自己的位置**决定，生成结果成为 (种子, 位置) 的纯函数。
 */
describe('今日挑战：同种子必须同关卡，与跑法无关', () => {
  const END = 24000;
  const paces: [string, (px: number) => number][] = [
    ['匀速', () => 64],
    ['时冲时停', px => (Math.floor(px / 640) % 2 ? 128 : 32)],
    ['磨磨蹭蹭', px => (Math.floor(px / 1280) % 3 ? 48 : 160)],
  ];

  const play = (seed: number, step: (px: number) => number) => {
    const lvl = new Level(new ChunkStream(mulberry32(seed)));
    const en = new Enemies(mulberry32(seed * 7 + 1));
    for (let px = 0; px < END; px += step(px)) {
      lvl.ensure(px + SPAWN_TERRAIN_MARGIN);
      en.ensure(px, lvl.solids, lvl.spikes);
    }
    // 统一终边，免得不同步长的最后一跳造出长短不一的尾巴（那是探针的差异，不是游戏的）
    lvl.ensure(END + SPAWN_TERRAIN_MARGIN);
    en.ensure(END, lvl.solids, lvl.spikes);
    return {
      enemies: en.list.map(e => `${e.kind}@${Math.round(e.x)}`).join('|'),
      terrain: lvl.solids.map(s => `${s.x},${s.y},${s.w}`).join('|'),
    };
  };

  it.each([1, 2, 3, 7, 11, 42])('种子 %i：三种跑法长出同一个关卡', seed => {
    const base = play(seed, paces[0][1]);
    for (const [name, step] of paces.slice(1)) {
      const other = play(seed, step);
      expect(other.terrain, `${name} 的地形与匀速不同`).toBe(base.terrain);
      expect(other.enemies, `${name} 的敌人与匀速不同`).toBe(base.enemies);
    }
  });
});
