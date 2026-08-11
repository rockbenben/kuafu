import { describe, it, expect, afterEach } from 'vitest';
import { drawUI, drawHelp, helpPanelBounds, chipRect, CHIP } from '../src/render/ui';
import { themeAt } from '../src/render/theme';
import { fitWorld, skyCrop, setUiViewport, uiFont, uiHeight, SKY_CROP_MAX, backingSize, setSafeArea, uiInsetL, uiInsetR, uiInsetT, uiInsetB } from '../src/render/viewport';
import { WORLD_H, TILE, PLAYER_H, JUMP_VEL, GRAVITY } from '../src/game/constants';
import { CHUNKS } from '../src/game/chunks';
import type { Game } from '../src/game/game';
import type { BoardState } from '../src/api/leaderboard';

/**
 * 横持手机上「界面太小」的守卫。
 *
 * 世界高恒为 576 且必须整高入屏，故缩放比 = 屏高/576：桌面 900px 高得 1.56
 * CSS px/世界单位，横持手机 390px 高只有 0.68——按 960×576 手调的字号到手机上
 * 一律缩到 43%。对策是裁掉上方纯天空（关卡几何最高只到 y=288）把可见高压到
 * 448，再给字号一道 CSS 像素下限。
 *
 * 这两件事都会挤压纵向余量，而这一屏的东西本来就是贴着 576 排满的。下面的
 * 断言全部对**实际绘制出来的 y** 下手，而不是复述布局公式——公式抄一遍等于
 * 没测，只有「画到哪儿了」才拦得住下一次的溢出。
 */

/** 记录式画布：吞掉所有绘制调用并记下当时的 font。 */
function recordingCtx() {
  const calls: { m: string; a: unknown[]; font: string }[] = [];
  const stub: Record<string, unknown> = {
    canvas: { width: 1688, height: 780 },
    measureText: (s: string) => ({ width: String(s).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(stub, {
    get(t, p) {
      if (p in t) return t[p as string];
      return (...a: unknown[]) => { calls.push({ m: String(p), a, font: String(t.font ?? '') }); };
    },
    set(t, p, v) { t[p as string] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** 每条 fillText 的纵向占位 [top, bottom]（textBaseline 全程为 top）。 */
function textSpans(calls: { m: string; a: unknown[]; font: string }[]) {
  return calls
    .filter(c => c.m === 'fillText')
    .map(c => {
      const size = parseFloat(c.font) || 0;
      const y = (c.a as [unknown, number, number])[2];
      return { text: String(c.a[0]), top: y, bottom: y + size };
    });
}

const fakeGame = (state: string) => ({
  state, mode: 'endless', boardKey: 'endless', deathCause: 'spike',
  dying: false, dyingT: 0,
  runStats: { score: 1234, distanceM: 888, durationMs: 9000 },
  score: { total: 1234, motes: 3, distanceM: 888, multiplier: 1.3 },
  charge: 0.5, chargeReady: true, narration: null, hint: 'hint.run',
  // count 给 ≥2：新加的连击 HUD 只在这个门槛以上才画，若给 0 这条测试
  // 就测不到它，等于没测（连击数 5 落在窗口中段，alpha 取 1 不影响宽高）
  combo: { count: 5, multiplier: 3, alpha: 1 },
} as unknown as Game);

/** 满榜是最坏情况：榜身把底部的「再逐一程」一路往下顶。 */
const fullBoard = {
  status: 'done', rank: 3,
  top: [1, 2, 3, 4, 5].map(i => ({ name: `Runner${i}`, score: 900 - i * 10 })),
} as unknown as BoardState;

/** 真机视口 → 当帧 UI 视口，走的是生产代码那份 fitWorld。 */
function useViewport(cssW: number, cssH: number, dpr = 2) {
  const fit = fitWorld(cssW * dpr, cssH * dpr, dpr);
  setUiViewport(fit.visH, fit.scale / dpr);
  return fit;
}

afterEach(() => setUiViewport(WORLD_H, 1)); // 模块状态跨用例泄漏会让后面的断言测了个寂寞

describe('skyCrop：只在矮屏生效，且不越过关卡几何', () => {
  it('桌面/平板一律不裁', () => {
    for (const h of [1080, 900, 768, 600, 520]) expect(skyCrop(h), `${h}px 高`).toBe(0);
  });

  it('横持手机裁到上限，且上限低于最高关卡几何（y=288）', () => {
    expect(skyCrop(390)).toBe(SKY_CROP_MAX);
    expect(skyCrop(320)).toBe(SKY_CROP_MAX);
    expect(SKY_CROP_MAX).toBeLessThan(288);
  });

  it('裁切随屏高单调不增，中间不跳档', () => {
    let prev = skyCrop(300);
    for (let h = 300; h <= 700; h += 10) {
      const c = skyCrop(h);
      expect(c, `${h}px 高`).toBeLessThanOrEqual(prev);
      prev = c;
    }
  });

  it('裁完的缩放比确实提上去了：横持手机 0.68 → 0.87', () => {
    const fit = useViewport(844, 390);
    expect(390 / WORLD_H).toBeCloseTo(0.677, 2);          // 改动之前
    expect(fit.scale / 2).toBeGreaterThan(0.85);          // 改动之后
    expect(fit.visH).toBe(WORLD_H - SKY_CROP_MAX);
  });

  it('桌面上 fitWorld 与旧式逐项等价（不许顺手改了桌面观感）', () => {
    const fit = fitWorld(1440, 900, 1);
    expect(fit.crop).toBe(0);
    expect(fit.visH).toBe(WORLD_H);
    expect(fit.vw).toBeCloseTo(WORLD_H * 1440 / 900, 6);
    expect(fit.scale).toBeCloseTo(900 / WORLD_H, 6);
  });
});

/**
 * 裁天空的两条前提。任一被破坏，被裁掉的就不再是「纯天空」，而是玩家要看的
 * 落脚点或自己的人像——这正是把 SKY_CROP_MAX 钉在 128 的全部理由。
 */
describe('裁掉的那一截确实空无一物', () => {
  it('没有任何一块关卡把几何摆进被裁区', () => {
    const offenders: string[] = [];
    for (const c of CHUNKS) {
      const firstRow = c.rows.findIndex(r => /[#^o*]/.test(r));
      if (firstRow >= 0 && firstRow * TILE < SKY_CROP_MAX) {
        offenders.push(`${c.id} 第 ${firstRow} 行（y=${firstRow * TILE}）< 裁切 ${SKY_CROP_MAX}`);
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });

  it('自最高台起跳，人像顶端仍留在可见区内', () => {
    const highestSolidY = Math.min(...CHUNKS.map(c => {
      const r = c.rows.findIndex(row => row.includes('#'));
      return r >= 0 ? r * TILE : Infinity;
    }));
    const apexRise = (JUMP_VEL * JUMP_VEL) / (2 * GRAVITY);   // 平跳能升多高
    const headTop = highestSolidY - PLAYER_H - apexRise;
    expect(headTop, `跳跃顶点 ${headTop.toFixed(1)} 已被裁进画外`).toBeGreaterThan(SKY_CROP_MAX);
  });
});

describe('uiFont：只抬小字，从不缩字', () => {
  it('桌面上是恒等变换', () => {
    useViewport(1440, 900, 1);
    for (const px of [11, 12, 13, 15, 22, 48]) expect(uiFont(px)).toBe(px);
  });

  it('横持手机把 11~13px 抬到至少 12 CSS px，大字原样不动', () => {
    const fit = useViewport(844, 390);
    const cssPx = fit.scale / 2;
    for (const px of [11, 12, 13]) {
      expect(uiFont(px), `${px}px`).toBeGreaterThan(px);
      expect(uiFont(px) * cssPx, `${px}px 的屏上尺寸`).toBeGreaterThanOrEqual(12 - 1e-9);
    }
    for (const px of [22, 30, 48, 54]) expect(uiFont(px), `${px}px`).toBe(px);
  });
});

describe('横持手机：三屏文字都不越出可见区', () => {
  it.each([
    ['iPhone 横持 844x390', 844, 390],
    ['小屏横持（未全屏，地址栏吃掉一截）760x320', 760, 320],
    ['桌面 1440x900', 1440, 900],
  ])('%s', (_label, cssW, cssH) => {
    const fit = useViewport(cssW, cssH, cssH > 500 ? 1 : 2);
    for (const state of ['title', 'playing', 'dead']) {
      for (const coarse of [true, false]) {
        const { ctx, calls } = recordingCtx();
        drawUI(ctx, fakeGame(state), themeAt(888), 4321, fullBoard, fit.vw, coarse);
        for (const s of textSpans(calls)) {
          expect(s.top, `${_label} ${state} coarse=${coarse}「${s.text}」顶出画外`).toBeGreaterThanOrEqual(0);
          expect(s.bottom, `${_label} ${state} coarse=${coarse}「${s.text}」沉出画外`).toBeLessThanOrEqual(uiHeight());
        }
      }
    }
  });

  it('结算页末行「再逐一程」是这一屏唯一的出口，满榜时也必须完整可见', () => {
    const fit = useViewport(844, 390);
    const { ctx, calls } = recordingCtx();
    drawUI(ctx, fakeGame('dead'), themeAt(888), 4321, fullBoard, fit.vw, true);
    const last = textSpans(calls).filter(s => s.text.includes('再逐一程'));
    expect(last.length, '没画出重开提示').toBe(1);
    expect(last[0].bottom).toBeLessThanOrEqual(uiHeight());
  });
});

describe('帮助浮层：短屏上整体收拢，内容仍装在面板与屏幕之内', () => {
  it.each([[844, 390, 2], [1440, 900, 1]] as const)('%sx%s', (cssW, cssH, dpr) => {
    const fit = useViewport(cssW, cssH, dpr);
    for (const coarse of [true, false]) {
      const b = helpPanelBounds(fit.vw, coarse);
      expect(b.y0, `coarse=${coarse} 面板顶出画外`).toBeGreaterThanOrEqual(0);
      expect(b.y1, `coarse=${coarse} 面板沉出画外`).toBeLessThanOrEqual(uiHeight());

      const { ctx, calls } = recordingCtx();
      drawHelp(ctx, themeAt(0), fit.vw, false, coarse);
      for (const s of textSpans(calls)) {
        expect(s.top, `coarse=${coarse}「${s.text}」越过面板顶`).toBeGreaterThanOrEqual(b.y0);
        expect(s.bottom, `coarse=${coarse}「${s.text}」越过面板底`).toBeLessThanOrEqual(b.y1);
      }
    }
  });
});

describe('两枚牌：短屏上仍在屏内，且够得着', () => {
  it('横持手机的命中区不小于 44 CSS px（拇指的实际精度）', () => {
    const fit = useViewport(844, 390);
    const cssPx = fit.scale / 2;
    for (const side of ['left', 'right'] as const) {
      const r = chipRect(side, fit.vw);
      expect(r.y, `${side} 顶出画外`).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h, `${side} 沉出画外`).toBeLessThanOrEqual(uiHeight());
      expect((r.w + CHIP.pad * 2) * cssPx, `${side} 命中区太窄`).toBeGreaterThanOrEqual(44);
      expect((r.h + CHIP.pad * 2) * cssPx, `${side} 命中区太矮`).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('画布后备缓冲：取整必须先于比较', () => {
  /**
   * 手机上「一直在闪」的根因。渲染每帧都做这件事：
   *
   *   if (canvas.width !== innerWidth * dpr) canvas.width = innerWidth * dpr;
   *
   * 而 canvas.width 是整数属性，赋小数会被截断。只要 innerHeight * dpr 带小数，
   * 存进去的和比较用的就永远不是同一个数，条件恒真 —— 每帧重分配一次后备缓冲，
   * 而给 canvas.width 赋值会清空整张画布。桌面的 innerHeight 是整数，碰不到。
   */

  /** 模拟 canvas.width 的整数属性语义：赋值截断。 */
  const asCanvasAttr = (v: number) => Math.trunc(v);

  it('输出恒为整数——赋给 canvas 不会被截断', () => {
    // dpr 会被封顶到 2，所以 2.625/3 那些机型算出来是整数、碰不到；真正会踩的是
    // **dpr 本身带小数**的（Android 常见 1.5 / 1.75，桌面浏览器缩放同理），
    // 以及 innerHeight 带小数而 dpr 为 1 的情形。
    for (const [w, h, dpr] of [
      [412, 883, 1.75],      // Android，dpr 1.75
      [412, 883.3, 1.5],     // Android，dpr 1.5 且视口高带小数
      [393, 745.33, 2],      // iOS 工具栏动画中的分数视口高
      [1280, 720.5, 1],      // 桌面缩放
      [390, 844, 2],         // 正常整数——不该被这条改动影响
    ] as [number, number, number][]) {
      const { w: bw, h: bh } = backingSize(w, h, dpr);
      expect(Number.isInteger(bw), `${w}x${h}@${dpr}`).toBe(true);
      expect(Number.isInteger(bh), `${w}x${h}@${dpr}`).toBe(true);
    }
  });

  it('小数视口高下也稳定：第二帧不再判定为「尺寸变了」', () => {
    const dpr = 1.75, cssW = 412, cssH = 883;         // Android dpr=1.75，最常见的一类
    const { w, h } = backingSize(cssW, cssH, dpr);
    const stored = { w: asCanvasAttr(w), h: asCanvasAttr(h) };
    const next = backingSize(cssW, cssH, dpr);         // 下一帧，视口没变
    expect(stored.w).toBe(next.w);
    expect(stored.h).toBe(next.h);
  });

  it('未取整的老写法确实每帧都不相等——这条说明为什么要有上面那条', () => {
    const raw = 883 * 1.75;                             // 老写法直接拿 innerHeight*dpr 比较
    expect(Number.isInteger(raw)).toBe(false);          // 1545.25
    expect(asCanvasAttr(raw)).not.toBe(raw);            // 存进去变成 1545，下一帧照样不等
  });

  it('视口真的变了仍要重分配——修的是误报，不是把检测关掉', () => {
    const a = backingSize(412, 883, 1.75);
    const b = backingSize(412, 940, 1.75);
    expect(a.h).not.toBe(b.h);
  });
});

describe('HUD 的边距：世界单位会在小屏上缩水，而小屏正是有刘海的那些', () => {
  /**
   * HUD 的边距原本写死成世界单位（`HX = 22`、顶 `11`）。世界单位在小屏上物理更小：
   * 桌面 2.11 CSS px/世界 → 22 值 46px；手机 0.87 → 只值 19px，顶边更只有 9.6px。
   * **边距恰好在最需要它的设备上缩了一半**——刘海、圆角、home 指示条只出现在小屏上。
   * 触屏按键一直吃 `env(safe-area-inset-*)`，画在 canvas 里的 HUD 却完全没有。
   */
  const PHONE = 0.871, DESKTOP = 2.110;   // 实测：844x390 与 2560x1215 的 CSS px/世界

  const noSafe = () => setSafeArea({ l: 0, r: 0, t: 0, b: 0 });

  it('无刘海时也给顶边一个物理下限——圆角屏会啃掉贴边的字', () => {
    setUiViewport(448, PHONE); noSafe();
    expect(uiInsetT(11) * PHONE).toBeCloseTo(14, 6);   // 原本只有 9.6 CSS px
  });

  it('桌面不受影响：设计值本来就够宽，floor 顶不上去', () => {
    setUiViewport(576, DESKTOP); noSafe();
    expect(uiInsetL(22)).toBe(22);
    expect(uiInsetT(11)).toBe(11);
  });

  it('有刘海时让开它——iPhone 横持那侧的 inset 约 59px', () => {
    setUiViewport(448, PHONE);
    setSafeArea({ l: 59, r: 0, t: 0, b: 0 });
    expect(uiInsetL(22) * PHONE).toBeGreaterThan(59);          // 必须整个躲开刘海
    expect(uiInsetR(22)).toBe(22);                             // 另一侧不受牵连
    noSafe();
  });

  it('四边各算各的，不共用一个值', () => {
    setUiViewport(448, PHONE);
    setSafeArea({ l: 59, r: 0, t: 0, b: 21 });
    expect(uiInsetL(22)).toBeGreaterThan(uiInsetR(22));
    expect(uiInsetB(16)).toBeGreaterThan(uiInsetT(16));
    noSafe();
  });
});

describe('贴角的牌必须真的让开安全区（打在调用点上，不是只测工具函数）', () => {
  /**
   * 上面那组只证明 `uiInset*` 算得对，证明不了 UI 层用了它——把调用点改回写死的
   * 数字，那组照样全绿。这条打在 `chipRect` 上：它是纯函数、不吃字体（CI 上没有
   * 中日韩字体，像素测量进不了库），而**绘制与命中读的正是它**，所以它一动，
   * 手指点空与画错位会同时发生。
   */
  const VW = 970;
  it('右侧有安全区时，右下角的牌整个躲开它', () => {
    setUiViewport(448, 0.871);
    setSafeArea({ l: 0, r: 0, t: 0, b: 0 });
    const before = chipRect('right', VW);
    setSafeArea({ l: 0, r: 59, t: 0, b: 21 });
    const after = chipRect('right', VW);
    expect(after.x).toBeLessThan(before.x);              // 往里收
    expect((VW - (after.x + after.w)) * 0.871).toBeGreaterThan(59);
    expect(after.y).toBeLessThan(before.y);              // 也抬离 home 指示条
    setSafeArea({ l: 0, r: 0, t: 0, b: 0 });
  });

  it('左侧的牌跟着左安全区走，不被右侧牵连', () => {
    setUiViewport(448, 0.871);
    setSafeArea({ l: 59, r: 0, t: 0, b: 0 });
    const left = chipRect('left', VW);
    expect(left.x * 0.871).toBeGreaterThan(59);
    setSafeArea({ l: 0, r: 0, t: 0, b: 0 });
  });
});
