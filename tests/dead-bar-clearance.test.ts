import { describe, it, expect, afterEach } from 'vitest';
import { drawUI, chipRect, deadBarAtCorner } from '../src/render/ui';
import { themeAt } from '../src/render/theme';
import { setUiViewport, uiFont } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';
import { t } from '../src/render/strings';
import type { Game } from '../src/game/game';
import type { BoardState } from '../src/api/leaderboard';

/**
 * 结算页的换形象条与「最后一行出口」不能抢同一条带。
 *
 * 实拍（横持手机 844×390）量到胶囊居中时压在「点下半屏 · 再逐一程」上 100×14 CSS px，
 * 五语种全中；修法是短屏把那一条让到左下角。这条守卫钉的是**两者的关系**：
 * 只要居中的净空放不下一条胶囊，角上规则就必须是开的。
 *
 * 量法用录制式画布跑一遍**真绘制**取最后一行的 y——不把排版算术抄第二份。
 */
function recordingCtx() {
  const calls: { m: string; a: unknown[] }[] = [];
  const stub: Record<string, unknown> = {
    canvas: { width: 1600, height: 900 },
    measureText: (s: string) => ({ width: String(s).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(stub, {
    get(t, p) {
      if (p in t) return t[p as string];
      return (...a: unknown[]) => { calls.push({ m: String(p), a }); };
    },
    set(t, p, v) { t[p as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const BOARD: BoardState = {
  status: 'done', rank: 37,
  top: [1, 2, 3, 4, 5].map(i => ({ name: `n${i}`, score: 1000 - i * 100, distance_m: i })),
};

function lastLineBottom(uiH: number, pxPerWorld: number): number {
  setUiViewport(uiH, pxPerWorld);
  const { ctx, calls } = recordingCtx();
  const game = {
    state: 'dead', mode: 'endless', boardKey: 'endless', deathCause: 'darkness',
    runStats: { score: 4180, distanceM: 620, durationMs: 42000 },
    score: { total: 4180, motes: 6, distanceM: 620, multiplier: 1.6 },
    charge: 0, chargeReady: false, narration: null, hint: null, dying: false, dyingT: 0,
  } as unknown as Game;
  drawUI(ctx, game, themeAt(600), 3120, BOARD, 960, false);
  const restart = calls.filter(c => c.m === 'fillText' && c.a[0] === t('death.restart')).pop();
  expect(restart, '结算页没画出重开那一行').toBeDefined();
  // textBaseline 在这一屏是 'top'，下沿 = y + 实际字号
  return Number(restart!.a[2]) + uiFont(16);
}

afterEach(() => setUiViewport(WORLD_H, 1));

describe('结算页：换形象条与出口行的净空', () => {
  it('反向对照：短屏居中的净空确实放不下一条胶囊（这就是它必须让到角上的原因）', () => {
    const uiH = 448;                              // 横持手机吃满 SKY_CROP_MAX 后的可见高
    const bottom = lastLineBottom(uiH, 0.871);
    const clearance = uiH * 0.99 - bottom;        // 锚点 0.99H、向上生长
    expect(clearance, `净空 ${clearance.toFixed(1)} 世界单位，本该不够`).toBeLessThan(40);
    expect(deadBarAtCorner(uiH), '净空不够时角上规则必须是开的').toBe(true);
  });

  it('桌面（不裁天空）居中的净空够，规则就该是关的', () => {
    const uiH = WORLD_H;
    const bottom = lastLineBottom(uiH, 1.563);
    const clearance = uiH * 0.99 - bottom;
    expect(clearance, `净空 ${clearance.toFixed(1)}`).toBeGreaterThanOrEqual(40);
    expect(deadBarAtCorner(uiH)).toBe(false);
  });

  it('判据与榜行数的判据同源：裁了天空才砍榜行，也才让角', () => {
    for (const uiH of [448, 470, 500, 520, 560, 576]) {
      const cropped = uiH < WORLD_H;
      expect(deadBarAtCorner(uiH), `uiH=${uiH}`).toBe(cropped);
      lastLineBottom(uiH, 0.9);                   // 顺带确认真绘制在这些高度都画得出最后一行
    }
  });

  it('语言牌画在右下，与让到角上的换形象条分居两侧', () => {
    setUiViewport(448, 0.871);
    const r = chipRect('right', 960);
    expect(r.x + r.w).toBeLessThanOrEqual(960);
    expect(r.x, '牌在右半，换形象条让到左半').toBeGreaterThan(960 / 2);
  });
});
