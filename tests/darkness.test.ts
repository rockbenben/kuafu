import { describe, it, expect } from 'vitest';
import { Darkness } from '../src/game/darkness';
import { DT } from '../src/game/constants';

describe('Darkness', () => {
  it('速度：热身期恒定，之后加速到上限', () => {
    const d = new Darkness();
    expect(d.speedAt(0)).toBeCloseTo(84);
    expect(d.speedAt(9)).toBeCloseTo(84);           // 热身期内恒定
    expect(d.speedAt(9 + 60)).toBeCloseTo(84 + 60 * 2.6);
    expect(d.speedAt(9999)).toBeCloseTo(330);
  });
  it('update 按当前速度推进', () => {
    const d = new Darkness();
    const x0 = d.x;
    d.update(1, 0, 10000);
    expect(d.x).toBeGreaterThan(x0 + 80);
  });
  it('橡皮筋：不会落后玩家超过 1200px', () => {
    const d = new Darkness();
    d.update(DT, 0, 5000);
    expect(d.x).toBeGreaterThanOrEqual(5000 - 1200);
  });
  it('追上玩家判定', () => {
    const d = new Darkness();
    expect(d.caught(100)).toBe(false);
    d.x = 150;
    expect(d.caught(100)).toBe(true);
  });
});
