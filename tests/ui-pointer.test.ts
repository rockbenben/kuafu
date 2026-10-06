import { describe, it, expect, afterEach } from 'vitest';
import {
  drawUI, chipRect, uiTargetAt, uiLevel, langMenuRowCenter, helpSoundCenterY,
  type UiChrome, type UiTarget,
} from '../src/render/ui';
import { themeAt, rgb } from '../src/render/theme';
import { setUiViewport, uiHeight } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';
import { LOCALES } from '../src/render/strings';
import type { Game } from '../src/game/game';

/**
 * 画布控件的指针态：点选、悬停、按压、光标**共用一份判据**，且悬停真的会改这一帧。
 *
 * 上一轮实拍量到四枚画布控件的悬停帧与静止帧 PNG md5 逐字节相同（DOM 控件与
 * 触屏虚拟键都会变）——界面全画在 canvas 里，浏览器不会替我们给指针反馈。
 * 这一组守卫钉两件事：① 「哪枚被指着」只有一份答案；② 答案变了，画出来的东西
 * 真的变，而且只变那一枚（亮这枚、开那枚是这类改动最典型的翻车方式）。
 */

const VW = 960;
const BOARD = { status: 'offline', rank: null, top: null } as never;

function gameIn(state: string) {
  return {
    state, mode: 'endless', boardKey: 'endless', deathCause: 'darkness',
    runStats: { score: 4180, distanceM: 620, durationMs: 42000 },
    score: { total: 4180, motes: 6, distanceM: 620, multiplier: 1.6 },
    combo: { count: 0, multiplier: 1, alpha: 0 }, charge: 0, chargeReady: false,
    narration: null, hint: null, dying: false, dyingT: 0,
  } as unknown as Game;
}

/** 记录式画布：方法调用与属性赋值都记下来，样式改动要从赋值上认。 */
function recordCtx() {
  const log: ({ k: 'call'; m: string; a: unknown[] } | { k: 'set'; prop: string; value: unknown })[] = [];
  const grad = () => ({ addColorStop: () => {} });
  const props: Record<string, unknown> = {
    canvas: { width: 1600, height: 900 },
    // 渐变与量字不是"画了什么"的证据，走旁路，别混进日志
    createLinearGradient: grad,
    createRadialGradient: grad,
    measureText: (s: string) => ({ width: String(s).length * 8 }),
  };
  const ctx = new Proxy(props, {
    get(t, p) {
      if (p in t) return t[p as string];
      return (...a: unknown[]) => { log.push({ k: 'call', m: String(p), a }); };
    },
    set(t, p, v) { t[p as string] = v; log.push({ k: 'set', prop: String(p), value: v }); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

const CHROME = (over: Partial<UiChrome> = {}): UiChrome =>
  ({ avatarOpen: false, reduceMotion: true, hover: null, pressed: null, ...over });

function drawTitle(chrome: UiChrome) {
  setUiViewport(WORLD_H, 1.563);
  const { ctx, log } = recordCtx();
  drawUI(ctx, gameIn('title'), themeAt(0), 3120, BOARD, VW, false, chrome);
  return log;
}

/**
 * 一枚牌在日志里的「描边样式」：圆角路径的第一次 moveTo 带得出它的几何
 * （roundRectPath 走 moveTo(x + r, y)），**其后**最近的 strokeStyle 赋值就是这枚牌的
 * ——chipBase 是先落路径、再上色描边，往前找会找到上一个元素的笔。
 */
function chipStrokeOf(log: ReturnType<typeof drawTitle>, side: 'left' | 'right') {
  const r = chipRect(side, VW);
  const rr = Math.min(r.h / 2, r.w / 2);
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.k !== 'call' || e.m !== 'moveTo') continue;
    if (Math.abs(Number(e.a[0]) - (r.x + rr)) > 0.5 || Math.abs(Number(e.a[1]) - r.y) > 0.5) continue;
    for (let j = i + 1; j < log.length; j++) {
      const s = log[j];
      if (s.k === 'set' && s.prop === 'strokeStyle') return s.value;
    }
  }
  return null;
}

const presence = (over = {}) => ({ state: 'title', langMenuOpen: false, helpOpen: false, coarse: false, ...over });
const center = (side: 'left' | 'right') => {
  const r = chipRect(side, VW);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

afterEach(() => setUiViewport(WORLD_H, 1));

describe('指针落在哪枚控件上：与屏上有几枚控件同一份门禁', () => {
  it('标题页两枚牌都指得着；结算页只有语言牌（帮助牌压根没画）', () => {
    setUiViewport(WORLD_H, 1.563);
    expect(uiTargetAt(center('left'), VW, presence())).toEqual({ id: 'chipL' });
    expect(uiTargetAt(center('right'), VW, presence())).toEqual({ id: 'chipR' });
    expect(uiTargetAt(center('left'), VW, presence({ state: 'dead' }))).toBeNull();
    expect(uiTargetAt(center('right'), VW, presence({ state: 'dead' }))).toEqual({ id: 'chipR' });
  });

  it('战斗中屏上没有牌，指在牌的老位置也不算命中（否则亮一枚并不存在的控件）', () => {
    setUiViewport(WORLD_H, 1.563);
    expect(uiTargetAt(center('left'), VW, presence({ state: 'playing' }))).toBeNull();
    expect(uiTargetAt(center('right'), VW, presence({ state: 'playing' }))).toBeNull();
  });

  it('菜单开着时行才指得着，且报的是**那一行**；声音钮只在触屏端的帮助浮层里指得着', () => {
    setUiViewport(WORLD_H, 1.563);
    const row = langMenuRowCenter(2);
    const p = { x: row.fx * VW, y: row.fy * uiHeight() };
    expect(uiTargetAt(p, VW, presence({ langMenuOpen: true }))).toEqual({ id: 'langRow', index: 2 });
    expect(uiTargetAt(p, VW, presence())).toBeNull();
    const s = { x: VW / 2, y: helpSoundCenterY(true) };
    expect(uiTargetAt(s, VW, presence({ helpOpen: true, coarse: true }))).toEqual({ id: 'sound' });
    expect(uiTargetAt(s, VW, presence({ helpOpen: true }))).toBeNull();   // 键盘端没画这枚钮
  });

  it('菜单行号与 LOCALES 同序：亮第 3 行就得选到第 3 种语言', () => {
    setUiViewport(WORLD_H, 1.563);
    for (let i = 0; i < LOCALES.length; i++) {
      const row = langMenuRowCenter(i);
      const hit = uiTargetAt({ x: row.fx * VW, y: row.fy * uiHeight() }, VW, presence({ langMenuOpen: true }));
      expect(hit, `第 ${i} 行`).toEqual({ id: 'langRow', index: i });
    }
  });
});

describe('档位：静止 / 悬停 / 按下是三相，不是一相', () => {
  const chipR: UiTarget = { id: 'chipR' };
  it('各归各档，按下盖过悬停', () => {
    expect(uiLevel(chipR, CHROME())).toBe(0);
    expect(uiLevel(chipR, CHROME({ hover: chipR }))).toBe(1);
    expect(uiLevel(chipR, CHROME({ hover: chipR, pressed: chipR }))).toBe(2);
    expect(uiLevel(chipR, CHROME({ pressed: chipR }))).toBe(2);
  });
  it('指着别处不算指着它——langRow 还要比行号', () => {
    expect(uiLevel(chipR, CHROME({ hover: { id: 'chipL' } }))).toBe(0);
    const row1: UiTarget = { id: 'langRow', index: 1 };
    const row2: UiTarget = { id: 'langRow', index: 2 };
    expect(uiLevel(row1, CHROME({ hover: row2 }))).toBe(0);
    expect(uiLevel(row1, CHROME({ hover: row1 }))).toBe(1);
  });
});

describe('悬停真的会改这一帧，而且只改那一枚', () => {
  it('静止描边按 0.45 画；悬停加一档，抬起回到原样', () => {
    const rest = chipStrokeOf(drawTitle(CHROME()), 'right');
    const over = chipStrokeOf(drawTitle(CHROME({ hover: { id: 'chipR' } })), 'right');
    expect(rest, '没画出语言牌').not.toBeNull();
    expect(rest).toBe(rgb(themeAt(0).glow, 0.45));
    expect(over).not.toBe(rest);
    const up = chipStrokeOf(drawTitle(CHROME({ pressed: { id: 'chipR' } })), 'right');
    expect(up).not.toBe(rest);
    expect(up).not.toBe(over);
  });

  it('亮的是被指着的那枚：悬停语言牌不许动帮助牌', () => {
    const base = drawTitle(CHROME());
    const hoverR = drawTitle(CHROME({ hover: { id: 'chipR' } }));
    expect(chipStrokeOf(hoverR, 'left'), '帮助牌不该跟着亮').toBe(chipStrokeOf(base, 'left'));
    expect(chipStrokeOf(hoverR, 'right')).not.toBe(chipStrokeOf(base, 'right'));
  });

  it('屏上没有牌的时候，悬停不许凭空改画面', () => {
    setUiViewport(WORLD_H, 1.563);
    const { ctx, log } = recordCtx();
    drawUI(ctx, gameIn('playing'), themeAt(0), 3120, BOARD, VW, false, CHROME());
    const { ctx: ctx2, log: log2 } = recordCtx();
    drawUI(ctx2, gameIn('playing'), themeAt(0), 3120, BOARD, VW, false, CHROME({ hover: { id: 'chipR' } }));
    expect(log2.map(String)).toEqual(log.map(String));
  });
});
