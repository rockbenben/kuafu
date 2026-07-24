import { describe, it, expect } from 'vitest';
import { drawUI, chipRect } from '../src/render/ui';
import { themeAt } from '../src/render/theme';
import { LOCALES } from '../src/i18n/keys';
import { MESSAGES } from '../src/i18n';
import { setLocale, getLocale } from '../src/i18n';
import type { Game } from '../src/game/game';
import type { BoardState } from '../src/api/leaderboard';

/**
 * 记录式画布：吞掉所有绘制调用并记下来。
 *
 * 死亡结算页的语言牌是本次要补的可达性缺口，但浏览器自动化里 rAF 被节流、
 * 撞不出死亡画面（试过站着等黑暗、按住右键跑，游戏时间都几乎不推进）。
 * 与其靠截图，不如在这里断言「dead 状态确实画了牌」——可重复，且不会因为
 * 哪天有人删掉那行绘制而悄悄失效。
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

function fakeGame(state: 'title' | 'dead'): Game {
  return {
    state,
    mode: 'endless',
    boardKey: 'endless',
    deathCause: 'darkness',
    runStats: { score: 120, distanceM: 88, durationMs: 9000 },
    score: { total: 120, motes: 3, distanceM: 88, multiplier: 1.3 },
    charge: 0,
    chargeReady: false,
    narration: null,
    hint: null,
  } as unknown as Game;
}

const BOARD: BoardState = { status: 'offline', rank: null, top: null };
const VW = 960;

function labelCalls(calls: { m: string; a: unknown[] }[]) {
  return calls.filter(c => c.m === 'fillText');
}

describe('语言牌确实画在死亡结算页上', () => {
  it('dead 状态下画出当前语言的自称，位置与 chipRect 一致', () => {
    const { ctx, calls } = recordingCtx();
    drawUI(ctx, fakeGame('dead'), themeAt(0), 500, BOARD, VW, false);

    const r = chipRect('right', VW);
    const native = LOCALES.find(l => l.id === getLocale())!.native;
    const hit = labelCalls(calls).find(c => c.a[0] === native);
    expect(hit, `死亡页没有画语言牌的标签「${native}」`).toBeDefined();
    expect(hit!.a[1], '标签 x 与 chipRect 不一致').toBe(r.x + 30);
    // y 轴同样要验：chipRect 的 x 由 vw 推、y 由 WORLD_H 推，彼此独立，
    // 而前几轮真正出错的恰恰是 y（声音钮差半个按钮高）。只验 x 等于没验。
    expect(hit!.a[2], '标签 y 与 chipRect 不一致').toBe(r.y + r.h / 2 + 1);
  });

  it('死亡页不画帮助牌（本次范围只补语言）', () => {
    const { ctx, calls } = recordingCtx();
    drawUI(ctx, fakeGame('dead'), themeAt(0), 500, BOARD, VW, false);
    const helpLabel = MESSAGES[getLocale()]['help.label'];
    expect(labelCalls(calls).some(c => c.a[0] === helpLabel)).toBe(false);
  });

  it('五个语种在死亡页都画出各自的自称', () => {
    const prev = getLocale();
    try {
      for (const { id, native } of LOCALES) {
        setLocale(id);
        const { ctx, calls } = recordingCtx();
        drawUI(ctx, fakeGame('dead'), themeAt(0), 500, BOARD, VW, false);
        expect(labelCalls(calls).some(c => c.a[0] === native), `${id} 缺语言牌`).toBe(true);
      }
    } finally { setLocale(prev); }
  });
});

describe('标题页两枚牌都画出来', () => {
  it('语言牌与帮助牌各画一次，且位置与 chipRect 一致', () => {
    const { ctx, calls } = recordingCtx();
    drawUI(ctx, fakeGame('title'), themeAt(0), 500, BOARD, VW, false);

    const native = LOCALES.find(l => l.id === getLocale())!.native;
    const helpLabel = MESSAGES[getLocale()]['help.label'];
    const lang = labelCalls(calls).find(c => c.a[0] === native);
    const help = labelCalls(calls).find(c => c.a[0] === helpLabel);

    expect(lang, '标题页没有语言牌').toBeDefined();
    expect(help, '标题页没有帮助牌').toBeDefined();
    const lr = chipRect('right', VW), hr = chipRect('left', VW);
    expect(lang!.a[1]).toBe(lr.x + 30);
    expect(lang!.a[2], '语言牌标签 y 与 chipRect 不一致').toBe(lr.y + lr.h / 2 + 1);
    expect(help!.a[1]).toBe(hr.x + 30);
    expect(help!.a[2], '帮助牌标签 y 与 chipRect 不一致').toBe(hr.y + hr.h / 2 + 1);
  });

  it('被牌子取代的旧提示文字不再出现', () => {
    const { ctx, calls } = recordingCtx();
    drawUI(ctx, fakeGame('title'), themeAt(0), 500, BOARD, VW, false);
    const texts = labelCalls(calls).map(c => String(c.a[0]));
    for (const s of texts) {
      expect(s, `残留旧提示：${s}`).not.toMatch(/点此|여기 누르기|tap here|ここを押す/);
    }
  });
});
