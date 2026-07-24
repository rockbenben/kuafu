import { describe, it, expect } from 'vitest';
import {
  overlayPanelBounds, helpPanelBounds, helpSoundCenterY, helpSoundHit, SOUND_BTN,
  langMenuHit, langMenuPanelHit, langMenuRowCenter, MENU_PANEL,
} from '../src/render/ui';
import { LOCALES } from '../src/i18n/keys';
import { WORLD_H } from '../src/game/constants';

describe('overlayPanelBounds', () => {
  it('面板按给定上下边界与宽度比例居中', () => {
    const b = overlayPanelBounds(1000, 0.2, 0.8, 0.4);
    expect(b.y0).toBeCloseTo(WORLD_H * 0.2, 6);
    expect(b.y1).toBeCloseTo(WORLD_H * 0.8, 6);
    expect(b.x0).toBeCloseTo(1000 * 0.3, 6);   // (1-0.4)/2
    expect(b.x1).toBeCloseTo(1000 * 0.7, 6);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(500, 6);
  });

  it('宽度比例变化时仍居中', () => {
    const b = overlayPanelBounds(820, 0.1, 0.9, 0.8);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(410, 6);
    expect(b.x1 - b.x0).toBeCloseTo(820 * 0.8, 6);
  });
});

/**
 * 声音钮改为跟随帮助浮层的内容流之后，绘制位置不再是写死的 fy。
 * 绘制与命中必须共用同一个来源——上一轮正是「画在 my−h/2、命中判 my 起」
 * 差了半个按钮高，点喇叭反而关掉浮层。
 */
describe('帮助浮层声音钮：绘制与命中同源', () => {
  const vw = 820;
  it('中心与上下沿都命中，越界不命中', () => {
    const cy = helpSoundCenterY(true);
    expect(helpSoundHit(vw / 2, cy, vw), '正中').toBe(true);
    expect(helpSoundHit(vw / 2, cy - SOUND_BTN.h / 2 + 2, vw), '上沿内').toBe(true);
    expect(helpSoundHit(vw / 2, cy + SOUND_BTN.h / 2 - 2, vw), '下沿内').toBe(true);
    expect(helpSoundHit(vw / 2, cy - SOUND_BTN.h, vw), '上沿外').toBe(false);
    expect(helpSoundHit(vw / 2, cy + SOUND_BTN.h, vw), '下沿外').toBe(false);
  });

  it('横向同样受限于按钮宽度', () => {
    const cy = helpSoundCenterY(true);
    expect(helpSoundHit(vw / 2 - SOUND_BTN.w / 2 + 2, cy, vw)).toBe(true);
    expect(helpSoundHit(vw / 2 - SOUND_BTN.w / 2 - 4, cy, vw)).toBe(false);
    expect(helpSoundHit(vw / 2 + SOUND_BTN.w / 2 + 4, cy, vw)).toBe(false);
  });

  // 这条要真的对**面板**断言。此前只检查了「在 576px 的世界里某处」——
  // 按钮就算被画到面板之上、浮在遮罩里，那样也照样绿，而内容流布局把按钮
  // 保持在面板内正是本次引入的不变式。
  it('声音钮落在帮助面板之内，且不与关闭提示重叠', () => {
    const b = helpPanelBounds(vw, true);
    const cy = helpSoundCenterY(true);
    expect(cy - SOUND_BTN.h / 2, '越过面板顶').toBeGreaterThan(b.y0);
    expect(cy + SOUND_BTN.h / 2, '越过面板底').toBeLessThan(b.y1);
    // 关闭提示画在 b.y1 - closeH + 6，声音钮不得压到它
    expect(cy + SOUND_BTN.h / 2, '压到关闭提示').toBeLessThan(b.y1 - 34);
  });

  it('无声音钮（键盘端）时面板更矮，内容仍在面板内', () => {
    const b = helpPanelBounds(vw, false);
    const bc = helpPanelBounds(vw, true);
    expect(b.y1 - b.y0).toBeLessThan(bc.y1 - bc.y0);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.y1).toBeLessThanOrEqual(WORLD_H);
  });
});

/**
 * 语言菜单面板为容纳新加的标题与关闭提示而上下撑开，但 langMenuHit 只认行区。
 * 调用方把 null 当成「点外面 → 关闭」，于是点面板自己的标题会把菜单关掉——
 * 而同一次提交加的提示写的正是「点屏幕别处 · 关闭」，等于承诺面板内点不到没事。
 */
describe('语言菜单面板命中带', () => {
  it('五行都落在面板带之内', () => {
    LOCALES.forEach((_, i) => {
      const { fx, fy } = langMenuRowCenter(i);
      expect(langMenuPanelHit(fx, fy), `第 ${i} 行不在面板内`).toBe(true);
    });
  });

  it('标题区在面板内但不是任何一行——点它不该关菜单', () => {
    const titleFy = MENU_PANEL.top + 0.03;
    expect(langMenuPanelHit(0.5, titleFy), '标题不在面板内').toBe(true);
    expect(langMenuHit(0.5, titleFy), '标题被当成了某一行').toBeNull();
  });

  it('关闭提示区同理：在面板内、不是行', () => {
    const closeFy = MENU_PANEL.bottom - 0.02;
    expect(langMenuPanelHit(0.5, closeFy)).toBe(true);
    expect(langMenuHit(0.5, closeFy)).toBeNull();
  });

  it('面板之外确实在外（上、下、左、右）', () => {
    expect(langMenuPanelHit(0.5, MENU_PANEL.top - 0.02), '上方').toBe(false);
    expect(langMenuPanelHit(0.5, MENU_PANEL.bottom + 0.02), '下方').toBe(false);
    expect(langMenuPanelHit(0.05, 0.5), '左侧').toBe(false);
    expect(langMenuPanelHit(0.95, 0.5), '右侧').toBe(false);
  });
});
