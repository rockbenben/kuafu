import { describe, it, expect } from 'vitest';
import { uiLetterbox, clientToWorld, worldToClient } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';

/**
 * 这些断言**刻意不走往返**。
 *
 * 此前的视口测试都是「世界 → 屏幕 → 世界」，而两个方向共用同一个 uiLetterbox，
 * 于是变换里的任何错误都在往返中抵消：把 Math.min 换成 Math.max(...)*1.37+11
 * 那样离谱的 scale，整套测试照样全绿。所以这里直接对几何量本身下断言。
 */
describe('uiLetterbox 几何', () => {
  it('16:9 画布对 vw=1400：横向填满、上下留黑', () => {
    const { scale, offX, offY } = uiLetterbox(1600, 900, 1400);
    expect(scale).toBeCloseTo(1600 / 1400, 6);   // 取较小者 = 宽度比
    expect(offX).toBeCloseTo(0, 6);
    expect(offY).toBeCloseTo((900 - WORLD_H * (1600 / 1400)) / 2, 6);
  });

  it('高瘦画布（竖屏手机）：横向填满、上下大留黑', () => {
    // 800/820 = 0.976 小于 1600/576 = 2.778，故仍取宽度比
    const { scale, offX, offY } = uiLetterbox(800, 1600, 820);
    expect(scale).toBeCloseTo(800 / 820, 6);
    expect(offX).toBeCloseTo(0, 6);
    expect(offY).toBeCloseTo((1600 - WORLD_H * (800 / 820)) / 2, 6);
    expect(offY).toBeGreaterThan(500);            // 竖屏下留黑极大，正是命中错位的根源
  });

  it('超宽画布：纵向填满、左右留黑', () => {
    // 2560/1400 = 1.829 大于 1080/576 = 1.875？否——1.829 更小，仍取宽度比；
    // 造一个真正高度受限的：画布 3000x600 对 vw=1400
    const { scale, offX, offY } = uiLetterbox(3000, 600, 1400);
    expect(scale).toBeCloseTo(600 / WORLD_H, 6);  // 此时高度比更小
    expect(offY).toBeCloseTo(0, 6);
    expect(offX).toBeGreaterThan(0);
  });

  // 下面三条是「包含式适配」的定义性质，任一被破坏都说明变换错了
  const CASES: [number, number, number][] = [
    [1600, 900, 1400], [800, 1600, 820], [1024, 768, 820],
    [780, 1688, 820], [2560, 1080, 1400], [900, 900, 820],
  ];

  it('内容必须完整装进画布——scale 取大就会裁掉 HUD', () => {
    for (const [cw, ch, vw] of CASES) {
      const { scale } = uiLetterbox(cw, ch, vw);
      expect(vw * scale, `${cw}x${ch}/${vw} 横向溢出`).toBeLessThanOrEqual(cw + 1e-6);
      expect(WORLD_H * scale, `${cw}x${ch}/${vw} 纵向溢出`).toBeLessThanOrEqual(ch + 1e-6);
    }
  });

  it('必须尽可能填满：至少有一个方向刚好贴边', () => {
    for (const [cw, ch, vw] of CASES) {
      const { scale, offX, offY } = uiLetterbox(cw, ch, vw);
      expect(Math.min(offX, offY), `${cw}x${ch}/${vw} 两个方向都留黑，没填满`).toBeCloseTo(0, 6);
      expect(scale).toBeGreaterThan(0);
    }
  });

  it('必须居中：留黑均分在两侧', () => {
    for (const [cw, ch, vw] of CASES) {
      const { scale, offX, offY } = uiLetterbox(cw, ch, vw);
      expect(offX).toBeCloseTo((cw - vw * scale) / 2, 6);
      expect(offY).toBeCloseTo((ch - WORLD_H * scale) / 2, 6);
      expect(offX).toBeGreaterThanOrEqual(-1e-6);
      expect(offY).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe('clientToWorld 定点换算', () => {
  // 1600x900 设备像素、CSS 盒 800x450（dpr=2）、vw=1400
  // scale = 1600/1400 = 1.142857，offX = 0，offY = (900-658.286)/2 = 120.857
  const rect = { left: 0, top: 0, width: 800, height: 450 };

  it('画布中心映射到世界中心', () => {
    const w = clientToWorld({ clientX: 400, clientY: 225, rect, canvasW: 1600, canvasH: 900, vw: 1400 });
    expect(w.x).toBeCloseTo(700, 4);
    expect(w.y).toBeCloseTo(WORLD_H / 2, 4);
  });

  it('世界左上角对应上留黑之下的那一点，而非画布左上角', () => {
    const w = clientToWorld({ clientX: 0, clientY: 0, rect, canvasW: 1600, canvasH: 900, vw: 1400 });
    expect(w.x).toBeCloseTo(0, 4);
    expect(w.y).toBeLessThan(0);              // 画布顶端在世界之上（留黑区）
    expect(w.y).toBeCloseTo(-120.857 / (1600 / 1400), 3);
  });

  it('rect 与 innerWidth/Height 不一致时按 rect 走（移动端 100vh ≠ innerHeight）', () => {
    const stretched = { left: 0, top: 0, width: 800, height: 500 }; // CSS 盒被拉高
    const a = clientToWorld({ clientX: 400, clientY: 250, rect: stretched, canvasW: 1600, canvasH: 900, vw: 1400 });
    expect(a.y).toBeCloseTo(WORLD_H / 2, 4);  // 拉伸后中心仍是中心
    const b = clientToWorld({ clientX: 400, clientY: 250, rect, canvasW: 1600, canvasH: 900, vw: 1400 });
    expect(b.y).not.toBeCloseTo(a.y, 1);      // 若忽略 rect，两者会相同——那就是旧缺陷
  });

  it('rect 有偏移时扣掉 left/top', () => {
    const off = { left: 40, top: 12, width: 800, height: 450 };
    const w = clientToWorld({ clientX: 440, clientY: 237, rect: off, canvasW: 1600, canvasH: 900, vw: 1400 });
    expect(w.x).toBeCloseTo(700, 4);
    expect(w.y).toBeCloseTo(WORLD_H / 2, 4);
  });
});

describe('worldToClient 与 clientToWorld 互逆（辅助性质，不能替代上面的定点断言）', () => {
  it('往返回到原点', () => {
    const rect = { left: 7, top: 3, width: 800, height: 450 };
    const p = worldToClient(123, 456, rect, 1600, 900, 1400);
    const w = clientToWorld({ ...p, rect, canvasW: 1600, canvasH: 900, vw: 1400 });
    expect(w.x).toBeCloseTo(123, 6);
    expect(w.y).toBeCloseTo(456, 6);
  });
});
