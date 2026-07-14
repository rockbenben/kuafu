import { describe, it, expect } from 'vitest';
import { Score } from '../src/game/score';
import { PX_PER_METER, MOTE_SCORE, MULT_MAX, AIRTIME_BONUS, KILL_BONUS } from '../src/game/constants';

describe('Score', () => {
  it('距离换算为米且单调不减', () => {
    const s = new Score();
    s.updateDistance(320);
    expect(s.distanceM).toBe(320 / PX_PER_METER);
    s.updateDistance(160); // 往回走
    expect(s.distanceM).toBe(320 / PX_PER_METER);
  });
  it('光点提升倍率并有上限', () => {
    const s = new Score();
    expect(s.multiplier).toBe(1);
    for (let i = 0; i < 5; i++) s.collectMote();
    expect(s.multiplier).toBeCloseTo(1.5);
    for (let i = 0; i < 100; i++) s.collectMote();
    expect(s.multiplier).toBe(MULT_MAX);
  });
  it('总分 = 距离×倍率 + 光点 + 风格加分', () => {
    const s = new Score();
    s.updateDistance(100 * PX_PER_METER); // 100m
    s.collectMote();                       // mult 1.1
    s.styleBonus();
    expect(s.total).toBe(Math.floor(100 * 1.1) + MOTE_SCORE + AIRTIME_BONUS);
  });
  it('击杀敌人获得击杀加分', () => {
    const s = new Score();
    s.killBonus();
    expect(s.bonus).toBe(KILL_BONUS);
    s.killBonus();
    expect(s.bonus).toBe(KILL_BONUS * 2);
  });
});
