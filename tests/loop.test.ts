import { describe, it, expect } from 'vitest';
import { createLoop } from '../src/engine/loop';

describe('createLoop', () => {
  it('按固定步长累积调用 update', () => {
    let updates = 0;
    const loop = createLoop(() => updates++, () => {});
    loop.tick(0);            // 初始化基准时间
    loop.tick(1000 / 60 * 3 + 1); // 经过约 3 帧
    expect(updates).toBe(3);
  });

  it('大卡顿时钳制单次追帧数量（不超过 5 帧）', () => {
    let updates = 0;
    const loop = createLoop(() => updates++, () => {});
    loop.tick(0);
    loop.tick(2000);         // 2 秒卡顿
    expect(updates).toBe(5);
  });

  it('render 收到 0~1 的插值 alpha', () => {
    let alpha = -1;
    const loop = createLoop(() => {}, a => { alpha = a; });
    loop.tick(0);
    loop.tick(1000 * (0.5 / 60)); // 半帧
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  });

  it('start 幂等：运行中重复 start 不叠加帧循环', () => {
    let scheduled = 0;
    let updates = 0;
    const cbs: (() => void)[] = [];
    const loop = createLoop(() => updates++, () => {}, { raf: cb => { scheduled++; cbs.push(cb); } });
    loop.start();
    loop.start(); // 重复调用
    expect(scheduled).toBe(1); // 只挂了一个帧循环
    loop.stop();
  });
});
