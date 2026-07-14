import { describe, it, expect } from 'vitest';
import { InputManager } from '../src/engine/input';

describe('InputManager', () => {
  it('方向键映射为电平信号', () => {
    const im = new InputManager();
    im.keyDown('ArrowLeft');
    expect(im.snapshot().left).toBe(true);
    im.keyUp('ArrowLeft');
    im.keyDown('KeyD');
    const s = im.snapshot();
    expect(s.left).toBe(false);
    expect(s.right).toBe(true);
  });

  it('跳跃按下是边沿信号，快照后清除；held 保持', () => {
    const im = new InputManager();
    im.keyDown('Space');
    const s1 = im.snapshot();
    expect(s1.jumpPressed).toBe(true);
    expect(s1.jumpHeld).toBe(true);
    const s2 = im.snapshot();
    expect(s2.jumpPressed).toBe(false);
    expect(s2.jumpHeld).toBe(true);
  });

  it('长按不重复触发边沿（模拟 OS 重复 keydown）', () => {
    const im = new InputManager();
    im.keyDown('KeyJ');
    im.keyDown('KeyJ');
    expect(im.snapshot().dashPressed).toBe(true);
    im.keyDown('KeyJ');           // 仍未松开
    expect(im.snapshot().dashPressed).toBe(false);
  });

  it('W/↑ 同时算跳跃与向上', () => {
    const im = new InputManager();
    im.keyDown('KeyW');
    const s = im.snapshot();
    expect(s.jumpPressed).toBe(true);
    expect(s.up).toBe(true);
  });
});
