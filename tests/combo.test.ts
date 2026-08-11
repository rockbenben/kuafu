import { describe, it, expect } from 'vitest';
import { Combo } from '../src/game/combo';
import { COMBO_WINDOW, COMBO_MAX, KILL_BONUS, RUN_SPEED } from '../src/game/constants';
import { interval } from '../src/game/enemies';

describe('连杀', () => {
  it('未连杀时倍率为 0，不发白工', () => {
    const c = new Combo();
    expect(c.count).toBe(0);
    expect(c.multiplier).toBe(0);
  });

  it('首杀 ×1，之后每杀 +0.5', () => {
    const c = new Combo();
    c.hit(); expect(c.multiplier).toBe(1);
    c.hit(); expect(c.multiplier).toBe(1.5);
    c.hit(); expect(c.multiplier).toBe(2);
    expect(c.bonus).toBe(KILL_BONUS * 2);
  });

  it('倍率封顶，不至于让连杀盖过路程成为唯一玩法', () => {
    const c = new Combo();
    for (let i = 0; i < 50; i++) c.hit();
    expect(c.multiplier).toBe(COMBO_MAX);
  });

  it('窗口内续上不断', () => {
    const c = new Combo();
    c.hit();
    c.update(COMBO_WINDOW - 0.1);
    c.hit();
    expect(c.count).toBe(2);
  });

  it('超时归零', () => {
    const c = new Combo();
    c.hit(); c.hit();
    c.update(COMBO_WINDOW + 0.01);
    expect(c.count).toBe(0);
    expect(c.multiplier).toBe(0);
  });

  it('末段淡出：窗口只剩最后 0.6s 才开始淡，之前恒满', () => {
    // 只采「alpha 严格小于 1」两点不够：把 alpha 的除数从 0.6 换成 COMBO_WINDOW
    // 后，随手挑一个中间点算出来的 alpha 一样落在 (0,1) 里，测试照样全绿——
    // 这条测试本该守住「最后 0.6s」这个具体阈值，不是「淡出会发生」这件事。
    const c = new Combo();
    c.hit();
    // 剩余 0.7s（> 0.6s 门槛）：还没进末段，理应满值
    c.update(COMBO_WINDOW - 0.7);
    expect(c.alpha).toBe(1);
    // 再走 0.2s，剩余 0.5s（< 0.6s 门槛）：已进末段，线性淡出
    c.update(0.2);
    expect(c.alpha).toBeCloseTo(0.5 / 0.6);
    expect(c.alpha).toBeLessThan(1);
  });
});

describe('连杀窗口与敌人间距的关系', () => {
  // 这一条不是在测「窗口等于 4.0」——那种断言只是把常量抄了一遍，改坏了也照样绿。
  // 它测的是窗口**够不够得着下一只怪**：连击能不能成立，先由生成间距决定。
  it('窗口必须盖得住开局那档敌人间距，否则连击在数学上不成立', () => {
    const worst = interval(0) / RUN_SPEED;   // 最稀的一档：满速跑完两只之间要多久
    expect(COMBO_WINDOW).toBeGreaterThan(worst);
  });

  it('沿路每一档间距都够得着，不只开局', () => {
    for (let m = 0; m <= 1400; m += 50) {
      expect(COMBO_WINDOW, `${m}m 处间距 ${(interval(m) / RUN_SPEED).toFixed(2)}s`)
        .toBeGreaterThan(interval(m) / RUN_SPEED);
    }
  });

  it('但不该宽到把抖动也盖住——漏掉一只仍要断', () => {
    // 间距带 0.75~1.25 抖动，最坏一对是名义值的 1.25 倍。窗口若连它都盖住，
    // 就成了「随便杀杀都连得上」，连击不再是「一只都不放过」的奖励。
    expect(COMBO_WINDOW).toBeLessThan(interval(0) * 1.25 / RUN_SPEED);
  });
});
