import { describe, it, expect } from 'vitest';
import { CHIP, chipRect, chipHit } from '../src/render/ui';
import { clientToWorld, uiLetterbox, worldToClient } from '../src/render/viewport';
import { WORLD_H } from '../src/game/constants';
import { LOCALES } from '../src/i18n/keys';
import { MESSAGES } from '../src/i18n';
import { estWidth } from '../src/render/text';

describe('牌子几何', () => {
  it('左牌贴左边距，右牌贴右边距，两者同尺寸同高', () => {
    const l = chipRect('left', 1000), r = chipRect('right', 1000);
    expect(l.x).toBe(CHIP.margin);
    expect(r.x + r.w).toBe(1000 - CHIP.margin);
    expect(l.w).toBe(r.w);
    expect(l.h).toBe(r.h);
    expect(l.y).toBe(r.y);
    expect(l.y + l.h).toBe(WORLD_H - CHIP.bottom);
  });

  it('命中矩形以绘制矩形为准，并四周外扩 CHIP.pad', () => {
    const p = CHIP.pad;
    for (const side of ['left', 'right'] as const) {
      const r = chipRect(side, 900);
      expect(chipHit(side, r.x + r.w / 2, r.y + r.h / 2, 900), `${side} 正中`).toBe(true);
      expect(chipHit(side, r.x + 1, r.y + 1, 900), `${side} 左上角内`).toBe(true);
      expect(chipHit(side, r.x + r.w - 1, r.y + r.h - 1, 900), `${side} 右下角内`).toBe(true);
      // 外扩区内仍算命中——手指没有像素级精度，差一点不该变成「直接开局」
      expect(chipHit(side, r.x - p + 1, r.y + r.h / 2, 900), `${side} 左侧外扩内`).toBe(true);
      expect(chipHit(side, r.x + r.w / 2, r.y - p + 1, 900), `${side} 上方外扩内`).toBe(true);
      expect(chipHit(side, r.x + r.w / 2, r.y + r.h + p - 1, 900), `${side} 下方外扩内`).toBe(true);
      // 外扩之外不再命中
      expect(chipHit(side, r.x - p - 2, r.y + r.h / 2, 900), `${side} 左外`).toBe(false);
      expect(chipHit(side, r.x + r.w + p + 2, r.y + r.h / 2, 900), `${side} 右外`).toBe(false);
      expect(chipHit(side, r.x + r.w / 2, r.y - p - 2, 900), `${side} 上外`).toBe(false);
      expect(chipHit(side, r.x + r.w / 2, r.y + r.h + p + 2, 900), `${side} 下外`).toBe(false);
    }
  });

  it('两枚牌互不重叠——连外扩后的命中区也不重叠（最窄视口下）', () => {
    const l = chipRect('left', 820), r = chipRect('right', 820);
    expect(l.x + l.w).toBeLessThan(r.x);
    expect(l.x + l.w + CHIP.pad, '外扩后命中区相接').toBeLessThan(r.x - CHIP.pad);
  });

  it('左右牌互不误伤：点左牌不会命中右牌，反之亦然', () => {
    const vw = 820;
    const l = chipRect('left', vw), r = chipRect('right', vw);
    expect(chipHit('right', l.x + l.w / 2, l.y + l.h / 2, vw)).toBe(false);
    expect(chipHit('left', r.x + r.w / 2, r.y + r.h / 2, vw)).toBe(false);
  });
});

/**
 * 牌子画在 renderUI 的信箱化变换里，命中必须先经 Renderer.screenToWorld。
 * 这里走**生产代码里那份** clientToWorld，模拟真实视口下「点到牌子画出来的
 * 那个像素」，坐标系一错就必然红。
 */
describe('牌子在真实视口下可点', () => {
  it.each([
    ['竖屏手机 390x844', 390, 844, 1],
    ['4:3 平板 1024x768', 1024, 768, 1],
    ['16:9 桌面 1920x1080', 1920, 1080, 1],
    ['超宽 2560x1080', 2560, 1080, 1],
    ['横屏 + 15% 纵向拉伸', 844, 390, 1.15],
    ['竖屏 + 12% 纵向拉伸', 390, 844, 1.12],
  ])('%s：点牌子中心命中，点牌外不命中', (_label, cssW, cssH, stretchY) => {
    const dpr = 2, canvasW = cssW * dpr, canvasH = cssH * dpr;
    const rect = { left: 0, top: 0, width: cssW, height: cssH * stretchY };
    const vw = Math.max(820, Math.min(1400, WORLD_H * canvasW / canvasH));

    for (const side of ['left', 'right'] as const) {
      const r = chipRect(side, vw);
      const hit = (wx: number, wy: number) => {
        const p = worldToClient(wx, wy, rect, canvasW, canvasH, vw);
        const w = clientToWorld({ ...p, rect, canvasW, canvasH, vw });
        return chipHit(side, w.x, w.y, vw);
      };
      expect(hit(r.x + r.w / 2, r.y + r.h / 2), `${_label} ${side} 中心`).toBe(true);
      expect(hit(r.x + r.w / 2, r.y - CHIP.pad - 6), `${_label} ${side} 牌上方（外扩之外）`).toBe(false);
    }
  });

  it('牌子始终落在画布可见范围内（不被信箱化推出屏幕）', () => {
    for (const [cssW, cssH] of [[390, 844], [1024, 768], [1920, 1080], [2560, 1080]]) {
      const dpr = 2, canvasW = cssW * dpr, canvasH = cssH * dpr;
      const vw = Math.max(820, Math.min(1400, WORLD_H * canvasW / canvasH));
      const { scale, offX, offY } = uiLetterbox(canvasW, canvasH, vw);
      for (const side of ['left', 'right'] as const) {
        const r = chipRect(side, vw);
        expect(r.x * scale + offX, `${cssW}x${cssH} ${side} 左越界`).toBeGreaterThanOrEqual(0);
        expect((r.x + r.w) * scale + offX, `${cssW}x${cssH} ${side} 右越界`).toBeLessThanOrEqual(canvasW);
        expect((r.y + r.h) * scale + offY, `${cssW}x${cssH} ${side} 下越界`).toBeLessThanOrEqual(canvasH);
      }
    }
  });
});

describe('牌子标签装得下', () => {
  // 必须与 drawLangChip/drawHelpChip 传给 fillText 的 maxWidth 一致：
  // 牌宽 − 图标与左内边距(30) − 右侧键位徽标预留(24)。写宽了等于没守。
  const LABEL_W = CHIP.w - 54;

  it('五语种的语言自称都不溢出', () => {
    const over = LOCALES
      .filter(l => estWidth(l.native, 13) > LABEL_W)
      .map(l => `${l.id}「${l.native}」${Math.round(estWidth(l.native, 13))}>${LABEL_W}`);
    expect(over, over.join('; ')).toEqual([]);
  });

  it('五语种的帮助标签都不溢出', () => {
    const over: string[] = [];
    for (const { id } of LOCALES) {
      const label = MESSAGES[id]['help.label' as keyof (typeof MESSAGES)['en']];
      const w = estWidth(String(label), 13);
      if (w > LABEL_W) over.push(`${id}「${label}」${Math.round(w)}>${LABEL_W}`);
    }
    expect(over, over.join('; ')).toEqual([]);
  });
});
