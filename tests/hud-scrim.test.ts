import { describe, it, expect, afterEach } from 'vitest';
import { drawUI, HUD_BOTTOM } from '../src/render/ui';
import { themeAt } from '../src/render/theme';
import { uiInsetT } from '../src/render/viewport';
import { setUiViewport, uiFont } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';
import { Popups } from '../src/render/popups';
import type { Game } from '../src/game/game';

/**
 * 短屏上 HUD 那一摞不能露在顶部遮罩之外；浮动反馈不能是全场唯一裸着的字。
 *
 * 两条都出自 568×320 的实拍：「连击 3 ×2.0」4.34、「步」3.78（跌破 4.5），
 * 四条飘字全判低对比。量法用录制式画布跑**真绘制**取遮罩深度，不抄第二份算术。
 */

const BOARD = { status: 'offline', rank: null, top: null } as never;

function recordingCtx() {
  const calls: { m: string; a: unknown[] }[] = [];
  const sets: { prop: string; value: unknown }[] = [];
  const grad = () => ({ addColorStop: () => {} });
  const props: Record<string, unknown> = {
    canvas: { width: 1600, height: 900 },
    createLinearGradient: grad, createRadialGradient: grad,
    measureText: (s: string) => ({ width: String(s).length * 8 }),
  };
  const ctx = new Proxy(props, {
    get(t, p) {
      if (p in t) return t[p as string];
      return (...a: unknown[]) => { calls.push({ m: String(p), a }); };
    },
    set(t, p, v) { t[p as string] = v; sets.push({ prop: String(p), value: v }); return true; },
  });
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D, calls, sets,
  };
}

const playGame = (combo: number) => ({
  state: 'playing', mode: 'endless',
  score: { total: 572, motes: 6, distanceM: 320, multiplier: 1.6 },
  combo: { count: combo, multiplier: 2, alpha: 1 },
  charge: 0.4, chargeReady: false, narration: null, hint: null, dying: false, dyingT: 0,
} as unknown as Game);

/** 真绘制跑一遍，取那条顶部渐变的填充高度（fillRect(0, 0, vw, hudBand)）。 */
function scrimDepth(uiH: number, pxPerWorld: number, combo: number) {
  setUiViewport(uiH, pxPerWorld);
  const { ctx, calls } = recordingCtx();
  drawUI(ctx, playGame(combo), themeAt(300), 960, BOARD, 960, false);
  const fill = calls.find(c => c.m === 'fillRect'
    && Number(c.a[0]) === 0 && Number(c.a[1]) === 0 && Number(c.a[3]) > 0);
  expect(fill, '没画出顶部遮罩').toBeDefined();
  return Number(fill!.a[3]);
}

/** HUD 最后一行的下沿——偏移与字号取渲染器报出来的那一份，不在测试里抄第二遍。 */
const lastRowBottom = (uiH: number, pxPerWorld: number) => {
  setUiViewport(uiH, pxPerWorld);
  return uiInsetT(11) + HUD_BOTTOM.offset + uiFont(HUD_BOTTOM.fontPx);
};

afterEach(() => setUiViewport(WORLD_H, 1));

describe('顶部遮罩跟着 HUD 那一摞走，不按屏高比例', () => {
  it('568×320（上一轮翻车的那一档）：遮罩必须盖过连击行的下沿', () => {
    const uiH = 320, px = 0.555;                 // 568 宽 / 1024 世界宽
    const depth = scrimDepth(uiH, px, 3);
    const bottom = lastRowBottom(uiH, px);
    expect(depth, `遮罩 ${depth.toFixed(1)} 盖不住最后一行 ${bottom.toFixed(1)}`).toBeGreaterThanOrEqual(bottom);
  });

  it('反向对照：旧判据（屏高 16%）在这一档确实盖不住——这就是它当初跌破 4.5 的原因', () => {
    const uiH = 320, px = 0.555;
    expect(320 * 0.16, '16% 如今够用了？那这条守卫该换个档再钉').toBeLessThan(lastRowBottom(uiH, px));
  });

  it('桌面同样由 HUD 那一摞 govern：16% 在这里也差 16 个世界单位（上一轮被暗影掩盖了）', () => {
    const uiH = WORLD_H, px = 1.563;
    expect(uiH * 0.16, '桌面这一档旧判据也盖不住最后一行').toBeLessThan(lastRowBottom(uiH, px));
    expect(scrimDepth(uiH, px, 3)).toBeGreaterThanOrEqual(lastRowBottom(uiH, px));
  });

  it('没有连击时也按满格撑开（否则连击一起来遮罩往下跳一截，读作闪烁）', () => {
    const uiH = 320, px = 0.555;
    expect(scrimDepth(uiH, px, 0)).toBe(scrimDepth(uiH, px, 3));
  });
});

describe('浮动反馈配底衬', () => {
  it('飘字与 HUD 用同一组暗影，不再是全场唯一裸着画的一族', () => {
    const { ctx, sets } = recordingCtx();
    const ps = new Popups();
    ps.spawn(100, 200, '+60', 'rgba(255,210,140,1)', 1.1);
    ps.update(0.17);
    ps.draw(ctx, 0, '16px serif');
    const shadow = sets.find(s => s.prop === 'shadowColor');
    expect(shadow, '飘字没有配暗影——它正是实拍四条低对比的出处').toBeDefined();
    expect(shadow!.value).toBe('rgba(8,4,2,0.9)');
    const blur = sets.find(s => s.prop === 'shadowBlur');
    expect(blur!.value).toBe(12);
  });
});
