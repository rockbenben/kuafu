import { describe, it, expect, afterEach } from 'vitest';
import { chipRect, CHIP, drawLangHint } from '../src/render/ui';
import { themeAt } from '../src/render/theme';
import { estWidth } from '../src/render/text';
import { setUiViewport, uiFont, uiInsetR, uiHeight, setSafeArea } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';
import { LOCALES, setLocale, t, type Locale } from '../src/render/strings';

/**
 * 角落的牌不许把字挤扁；语言提示的右边距与它说的那枚牌同源。
 *
 * 上一轮实拍在 568×320 与 320×568 上量到「简体中文」「帮助」走了 drawFit 的
 * maxWidth 分支——牌宽写死 112，而字号有 12 CSS px 地板，屏一矮字就不再缩，
 * 于是只能横向变形。
 */
const SIZES: Array<[string, number, number]> = [
  ['1440×900 桌面', WORLD_H, 1.563],
  ['844×390 横持手机', 448, 0.871],
  ['568×320 极短窗', 320, 0.555],
  ['320×568 竖持', 568, 0.312],
];

/** 牌里的文字预算：牌宽减去图标列与键位列（与 drawLangChip 的 r.w - 54 同一式）。 */
const textBudget = (side: 'left' | 'right') => chipRect(side, 960).w - 54;
const natural = (label: string) => estWidth(label, uiFont(13));

afterEach(() => { setUiViewport(WORLD_H, 1); setLocale('zh-Hans'); setSafeArea({ l: 0, r: 0, t: 0, b: 0 }); });

describe('牌宽由文字推出，不靠挤', () => {
  for (const [name, uiH, px] of SIZES) {
    it(`${name}：五语种的标签都装得下`, () => {
      for (const l of LOCALES) {
        setUiViewport(uiH, px);
        setLocale(l.id as Locale);
        expect(textBudget('right'), `${name} / ${l.id}「${l.native}」被压扁`).toBeGreaterThanOrEqual(natural(l.native));
        // 左牌标签按**当前 locale 的真串**量，不在此抄一份五语种对照表
        expect(textBudget('left'), `${name} / ${l.id} 帮助牌被压扁`).toBeGreaterThanOrEqual(natural(t('help.label')));
      }
    });
  }

  it('反向对照：写死 112 的旧宽度在极短档确实装不下（这就是"压扁"的出处）', () => {
    setUiViewport(320, 0.555);
    expect(112 - 54, '旧宽度如今够用？那这条守卫该换个档再钉').toBeLessThan(natural('简体中文'));
    expect(chipRect('right', 960).w).toBeGreaterThan(112);
  });

  it('桌面短标签仍是最小宽 112（不因为这条改动变胖）', () => {
    setUiViewport(WORLD_H, 1.563);
    expect(chipRect('right', 960).w).toBe(CHIP.w);
  });
});

describe('语言提示与语言牌同右边距', () => {
  it('提示的右边缘就是牌的外边缘（安全区变化时两者一起走）', () => {
    setUiViewport(WORLD_H, 1.563);
    const texts: { x: number }[] = [];
    const grad = () => ({ addColorStop: () => {} });
    const props: Record<string, unknown> = {
      canvas: { width: 1600, height: 900 },
      createLinearGradient: grad, createRadialGradient: grad,
      measureText: (s: string) => ({ width: String(s).length * 8 }),
    };
    const ctx = new Proxy(props, {
      get(t, p) { if (p in t) return t[p as string]; return (...a: unknown[]) => { if (p === 'fillText') texts.push({ x: Number(a[1]) }); }; },
      set(t, p, v) { t[p as string] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const vw = 960;
    drawLangHint(ctx, themeAt(0), vw, 1);
    const r = chipRect('right', vw);
    expect(texts.length, '没画出语言提示').toBeGreaterThan(0);
    expect(texts[0].x).toBe(r.x + r.w);
    expect(r.x + r.w).toBeCloseTo(vw - uiInsetR(CHIP.margin), 6);
    expect(uiHeight()).toBe(WORLD_H);
  });

  it('横屏刘海机：牌内收了，提示必须跟着内收（写死 16 就会压进刘海）', () => {
    setUiViewport(WORLD_H, 1.563);
    setSafeArea({ l: 44, r: 44, t: 0, b: 21 });
    const texts: { x: number }[] = [];
    const grad = () => ({ addColorStop: () => {} });
    const props: Record<string, unknown> = {
      canvas: { width: 1600, height: 900 },
      createLinearGradient: grad, createRadialGradient: grad,
      measureText: (s: string) => ({ width: String(s).length * 8 }),
    };
    const ctx = new Proxy(props, {
      get(t, p) { if (p in t) return t[p as string]; return (...a: unknown[]) => { if (p === 'fillText') texts.push({ x: Number(a[1]) }); }; },
      set(t, p, v) { t[p as string] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const vw = 960;
    drawLangHint(ctx, themeAt(0), vw, 1);
    const r = chipRect('right', vw);
    expect(uiInsetR(CHIP.margin), '安全区没生效，这条测的是个空场景').toBeGreaterThan(CHIP.margin);
    expect(texts[0].x).toBe(r.x + r.w);
  });
});
