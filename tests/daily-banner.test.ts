import { describe, it, expect, afterEach } from 'vitest';
import { drawUI } from '../src/render/ui';
import { themeAt } from '../src/render/theme';
import { setUiViewport } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';
import { t } from '../src/render/strings';
import type { Game } from '../src/game/game';

/**
 * 今日挑战的横幅上不许出现日期。
 *
 * 种子按 UTC 日派发是全球同关的前提，改不得；但把那个 UTC 日直接念给玩家看，
 * UTC+8 的人每天 00:00–08:00 会读到"昨天"（实拍本机 10-06 显示 10-05），
 * 西岸反过来读到"明天"。一句读起来像 bug 的真话不如不说。
 */
const BOARD = { status: 'offline', rank: null, top: null } as never;

function banner(mode: 'daily' | 'endless'): string[] {
  setUiViewport(WORLD_H, 1.563);
  const texts: string[] = [];
  const grad = () => ({ addColorStop: () => {} });
  const props: Record<string, unknown> = {
    canvas: { width: 1600, height: 900 },
    createLinearGradient: grad, createRadialGradient: grad,
    measureText: (s: string) => ({ width: String(s).length * 8 }),
  };
  const ctx = new Proxy(props, {
    get(tt, p) {
      if (p in tt) return tt[p as string];
      return (...a: unknown[]) => { if (p === 'fillText') texts.push(String(a[0])); };
    },
    set(tt, p, v) { tt[p as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawUI(ctx, {
    state: 'title', mode, boardKey: mode === 'daily' ? 'daily:2026-10-05' : 'endless',
    score: { total: 0, motes: 0, distanceM: 0, multiplier: 1 },
    combo: { count: 0, multiplier: 1, alpha: 0 }, charge: 0, chargeReady: false,
    narration: null, hint: null,
  } as unknown as Game, themeAt(0), 3120, BOARD, 960, false);
  return texts;
}

afterEach(() => setUiViewport(WORLD_H, 1));

describe('今日挑战横幅', () => {
  it('就是 mode.daily 本身，不拼日期（boardKey 里那个 UTC 日不外泄）', () => {
    const lines = banner('daily');
    expect(lines).toContain(t('mode.daily'));
    expect(lines.filter(s => /2026|10-05|\d{4}-\d{2}-\d{2}/.test(s))).toEqual([]);
  });

  it('常规无尽那侧同样不带尾巴', () => {
    expect(banner('endless')).toContain(t('mode.endless'));
  });
});
