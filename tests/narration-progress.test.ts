import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import type { InputState } from '../src/game/types';

/**
 * 十二段《山海经》跨局累积。
 *
 * 原本每局从 nar.0 重来，而实测中位一局只有 246 步——只够越过 0 与 250 两个里程碑，
 * 九成的人永远看不到后面十段。一局也塞不下：12 段 × 6.5s ≈ 78s，中位一局约 30s。
 * 所以里程碑只决定「什么时候念下一句」，念哪一句由 seenNar 定。
 */
const IDLE: InputState = {
  left: false, right: false, up: false, down: false,
  jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false,
};

/**
 * 把一局推到 distanceM 至少 m，返回这一局念过的句子（按顺序）。
 *
 * 直接推玩家的 x 来推进里程，并清掉尖刺与敌人：这里要验的是「给定 seenNar 该念
 * 哪一句」，与「一个 bot 能不能真跑到 250 步」无关（实测中位一局只有 246 步，
 * 靠真跑会一半的时候死在半路，测的就成了 bot 的水平）。
 */
function runTo(seenNar: number, m: number) {
  const g = new Game(1);
  g.seenNar = seenNar;
  g.start();
  const said: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < 60 * 120 && g.score.distanceM < m; i++) {
    g.level.spikes.length = 0;
    g.enemies.list.length = 0;
    g.player.pos.x += 8;
    // 把人贴到该处的地表：传送式推进会正好落在坑上方，那就成了测坠亡而不是测叙事
    const cx = g.player.pos.x + g.player.rect.w / 2;
    const top = g.level.solids
      .filter(s => cx >= s.x && cx < s.x + s.w)
      .reduce((a, s) => Math.min(a, s.y), Infinity);
    if (top !== Infinity) { g.player.pos.y = top - g.player.rect.h; g.player.vel.y = 0; }
    g.update(IDLE, 1 / 60);
    const k = g.narration?.key ?? null;
    if (k && k !== last) said.push(k);
    last = k;
    if (g.state !== 'playing') break;
  }
  return { said, seenNar: g.seenNar, died: g.state !== 'playing' };
}

describe('叙事跨局累积', () => {
  it('第一局从头讲', () => {
    const r = runTo(0, 260);
    expect(r.died, '前提：这一局没有半路死掉').toBe(false);
    expect(r.said[0]).toBe('nar.0');
    expect(r.said).toContain('nar.1');
  });

  it('下一局从上次断的地方接着讲，而不是从头', () => {
    const r = runTo(2, 260);
    expect(r.said, '看过 nar.0/nar.1 之后不该再从 nar.0 开始').not.toContain('nar.0');
    expect(r.said[0]).toBe('nar.2');
    expect(r.seenNar, '读过的段数要往前推').toBeGreaterThan(2);
  });

  it('十二段读完之后，回到按里程播放', () => {
    const r = runTo(12, 260);
    expect(r.said[0], '读完之后长局里各句仍落在该落的地方').toBe('nar.0');
    expect(r.seenNar, '读完就不再增长').toBe(12);
  });

  it('中位里程（约 250 步）的一局至少能推进两段', () => {
    const before = 4;
    const r = runTo(before, 260);
    expect(r.seenNar - before).toBeGreaterThanOrEqual(2);
  });
});
