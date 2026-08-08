import { describe, it, expect } from 'vitest';
import { Darkness, dangerLevel, DANGER_GAP } from '../src/game/darkness';
import { DT, RUN_SPEED } from '../src/game/constants';

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

describe('dangerLevel（长夜逼近告警）', () => {
  // 视觉暗角与心跳共用这一条曲线；各算各的会出现「画面已经暗了但心跳还慢」的错位。
  it('远离时为 0，贴脸时为 1，中间单调', () => {
    expect(dangerLevel(1000, 1000 - DANGER_GAP * 2)).toBe(0);
    expect(dangerLevel(1000, 1000 - DANGER_GAP)).toBe(0);
    expect(dangerLevel(1000, 1000)).toBe(1);
    const mid = dangerLevel(1000, 1000 - DANGER_GAP / 2);
    expect(mid).toBeCloseTo(0.5, 2);
  });

  it('被追过头（长夜越过玩家）仍夹在 1，不外溢', () => {
    expect(dangerLevel(1000, 1600)).toBe(1);
  });

  it('告警窗口够玩家反应——满速下不少于 1.5 秒', () => {
    expect(DANGER_GAP / RUN_SPEED).toBeGreaterThan(1.5);
  });
});
