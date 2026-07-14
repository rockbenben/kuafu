import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TouchControls } from '../src/engine/touch';

// 轻量 DOM 桩：按钮记录事件处理器，可手动触发 pointer 事件
function fakeEl() {
  const handlers: Record<string, (e: unknown) => void> = {};
  return {
    handlers,
    classList: { toggle: vi.fn() },
    addEventListener(type: string, cb: (e: unknown) => void) { handlers[type] = cb; },
    setPointerCapture() { /* noop */ },
    fire(type: string, e: Record<string, unknown> = {}) {
      handlers[type]?.({ preventDefault() {}, pointerId: 1, ...e });
    },
  };
}

describe('TouchControls（HTML 覆盖按钮）', () => {
  let els: Record<string, ReturnType<typeof fakeEl>>;
  let im: { keyDown: ReturnType<typeof vi.fn>; keyUp: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    els = {
      'tc': fakeEl(), 'tc-left': fakeEl(), 'tc-right': fakeEl(),
      'tc-jump': fakeEl(), 'tc-dash': fakeEl(), 'tc-ult': fakeEl(),
    };
    (globalThis as unknown as { document: unknown }).document = {
      getElementById: (id: string) => els[id] ?? null,
    };
    im = { keyDown: vi.fn(), keyUp: vi.fn() };
  });
  afterEach(() => { delete (globalThis as unknown as { document?: unknown }).document; });

  it('方向键长按：按下注入、松开释放', () => {
    new TouchControls(im as never, () => {});
    els['tc-right'].fire('pointerdown');
    expect(im.keyDown).toHaveBeenCalledWith('ArrowRight');
    els['tc-right'].fire('pointerup');
    expect(im.keyUp).toHaveBeenCalledWith('ArrowRight');
  });

  it('跳键长按可变高：Space 按下/松开', () => {
    new TouchControls(im as never, () => {});
    els['tc-jump'].fire('pointerdown');
    expect(im.keyDown).toHaveBeenCalledWith('Space');
    els['tc-jump'].fire('pointerup');
    expect(im.keyUp).toHaveBeenCalledWith('Space');
  });

  it('冲键：KeyJ', () => {
    new TouchControls(im as never, () => {});
    els['tc-dash'].fire('pointerdown');
    expect(im.keyDown).toHaveBeenCalledWith('KeyJ');
  });

  it('大招·跨：边沿触发（同次按下 down+up）', () => {
    new TouchControls(im as never, () => {});
    els['tc-ult'].fire('pointerdown');
    expect(im.keyDown).toHaveBeenCalledWith('KeyK');
    expect(im.keyUp).toHaveBeenCalledWith('KeyK');
  });

  it('setVisible / setUltReady 切换 class', () => {
    const tc = new TouchControls(im as never, () => {});
    tc.setVisible(true);
    expect(els['tc'].classList.toggle).toHaveBeenCalledWith('on', true);
    tc.setUltReady(true);
    expect(els['tc-ult'].classList.toggle).toHaveBeenCalledWith('ready', true);
  });

  it('隐藏时释放"由触屏按下"的长按键（防按住死亡后残留）', () => {
    const tc = new TouchControls(im as never, () => {});
    els['tc-right'].fire('pointerdown'); // 触屏按住 ▶ → touchHeld={ArrowRight}
    im.keyUp.mockClear();
    tc.setVisible(false);                 // 死亡/暂停隐藏：应释放该键
    expect(im.keyUp).toHaveBeenCalledWith('ArrowRight');
    // 未被触屏按下的键不应被牵连（键盘输入不受影响）
    for (const code of ['ArrowLeft', 'Space', 'KeyJ']) {
      expect(im.keyUp).not.toHaveBeenCalledWith(code);
    }
  });

  it('隐藏时只清触屏按下的键，从不误清键盘输入（桌面端 touchHeld 恒空）', () => {
    const tc = new TouchControls(im as never, () => {});
    // 桌面端从无触屏按下：每帧 setVisible(false) 不得触发任何 keyUp
    tc.setVisible(false);
    tc.setVisible(false);
    tc.setVisible(false);
    expect(im.keyUp).not.toHaveBeenCalled();
  });

  it('隐藏期间持续幂等释放：松键后再隐藏不重复 keyUp', () => {
    const tc = new TouchControls(im as never, () => {});
    els['tc-right'].fire('pointerdown');
    tc.setVisible(false);   // 释放 ArrowRight 并清空 touchHeld
    im.keyUp.mockClear();
    tc.setVisible(false);   // 再隐藏：touchHeld 已空 → 不再 keyUp
    expect(im.keyUp).not.toHaveBeenCalled();
  });

  it('触屏松手后隐藏不再释放（pointerup 已清 touchHeld）', () => {
    const tc = new TouchControls(im as never, () => {});
    els['tc-right'].fire('pointerdown');
    els['tc-right'].fire('pointerup');   // 正常松手 → touchHeld 清掉 ArrowRight
    im.keyUp.mockClear();
    tc.setVisible(false);
    expect(im.keyUp).not.toHaveBeenCalled();
  });

  it('首次触摸回调触发（解锁音频）', () => {
    const onFirst = vi.fn();
    new TouchControls(im as never, onFirst);
    els['tc-left'].fire('pointerdown');
    expect(onFirst).toHaveBeenCalled();
  });
});
