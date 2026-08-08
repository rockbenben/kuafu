import { describe, it, expect } from 'vitest';
import { singleFrameMotion } from '../src/render/renderer';

/**
 * 单帧形象的程序化律动只有一处能出错：参数调过头。
 * 调大到角色翻面（scaleX 变负）、压扁到没有（det≈0）、或飘出画面，都是靠肉眼
 * 逐帧截图才发现的那种 bug。这里把变换矩阵累起来直接验边界。
 */
type M = [number, number, number, number, number, number];

function recorder() {
  let m: M = [1, 0, 0, 1, 0, 0];
  const mul = (n: M) => {
    const [a, b, c, d, e, f] = m;
    const [A, B, C, D, E, F] = n;
    m = [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  };
  return {
    translate: (x: number, y: number) => mul([1, 0, 0, 1, x, y]),
    rotate: (r: number) => mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
    scale: (x: number, y: number) => mul([x, 0, 0, y, 0, 0]),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => mul([a, b, c, d, e, f]),
    get m() { return m; },
    get det() { return m[0] * m[3] - m[1] * m[2]; },
  };
}

const DRAW_H = 47.6; // PLAYER_H * 1.7，角色在游戏里的实际绘制高度
const run = (
  p: { dashing?: boolean; onGround?: boolean; vy?: number },
  running: boolean, phase: number, speedK = 1,
) => {
  const r = recorder();
  singleFrameMotion(
    r,
    { dashing: !!p.dashing, onGround: p.onGround ?? true, vel: { y: p.vy ?? 0 } },
    running, phase, DRAW_H, speedK,
  );
  return r;
};

describe('单帧律动', () => {
  it('站定不施加任何变换——相位不推进，一动就会歪着定住', () => {
    expect(run({}, false, 137).m).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('奔跑整周期内都不翻面、不退化', () => {
    for (let i = 0; i < 32; i++) {
      const r = run({}, true, i * 1.7);
      expect(r.det, `phase ${i}`).toBeGreaterThan(0.8); // 远离 0 才不会被压成一条线
      expect(r.m[0], `phase ${i}`).toBeGreaterThan(0);  // scaleX 转负 = 角色左右翻面
    }
  });

  // 枢轴在肩不在脚：绕脚底转时半径最大的是头，整个上半身跟着甩，看久了晃眼。
  // 这条断言就是那次修正的护栏——谁把 pivotY 改回 0，它立刻变红。
  // 度量的是一个步频周期内的**峰峰值**，不是绝对位移：随速度前倾是静态偏移，
  // 速度恒定时它不变，眼睛看不出来；晃眼的只有来回摆动这一部分。
  it('奔跑时上半身稳、腿摆大', () => {
    const pt = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    let hLo = Infinity, hHi = -Infinity, fLo = Infinity, fHi = -Infinity;
    for (let i = 0; i < 32; i++) {
      const m = run({}, true, i * 1.7).m;
      const h = pt(m, 0, -DRAW_H)[0], f = pt(m, 0, 0)[0];
      hLo = Math.min(hLo, h); hHi = Math.max(hHi, h);
      fLo = Math.min(fLo, f); fHi = Math.max(fHi, f);
    }
    const headSwing = hHi - hLo, footSwing = fHi - fLo;
    expect(footSwing).toBeGreaterThan(headSwing * 2.5); // 摆的是腿，不是头
    expect(headSwing).toBeLessThan(DRAW_H * 0.065);     // 头几乎钉住
    expect(footSwing).toBeGreaterThan(DRAW_H * 0.12);   // 但腿是真的在摆
  });

  // 竖直跳动与挤压拉伸贡献的全是**头的上下位移**，而人眼对垂直跳动最敏感——
  // 黑剪影还看不太出来，彩色形象脸上的眼睛一跳就晃眼。两者都已从奔跑里砍掉。
  it('奔跑只做摆动，不做竖直跳动与挤压拉伸', () => {
    let maxDy = 0, maxScaleDev = 0;
    for (let i = 0; i < 32; i++) {
      const m = run({}, true, i * 1.7).m;
      maxDy = Math.max(maxDy, Math.abs(m[5]));
      maxScaleDev = Math.max(maxScaleDev, Math.abs(m[0] - 1), Math.abs(m[3] - 1));
    }
    expect(maxDy).toBeLessThan(DRAW_H * 0.02);  // 加回 bob 会让这条立刻变红
    expect(maxScaleDev).toBeLessThan(0.02);     // 加回 squash & stretch 同理
  });

  it('冲刺前倾：上身相对脚底前移（切变项为负，朝向翻转由外层负责）', () => {
    const m = run({ dashing: true }, false, 0).m;
    expect(m[2]).toBeLessThan(0);
    expect(m[0]).toBeGreaterThan(1); // 横向拉长压出速度感
  });

  it('腾空按竖直速度拉伸，静止悬停时不变形', () => {
    expect(run({ onGround: false, vy: 0 }, false, 0).m).toEqual([1, 0, 0, 1, 0, 0]);
    const fast = run({ onGround: false, vy: -640 }, false, 0).m;
    expect(fast[3]).toBeGreaterThan(1); // 竖直拉长
    expect(fast[0]).toBeLessThan(1);    // 同时收窄，体积守恒的错觉
  });

  // 速度进两处：步频（相位，由调用方按位移累积）与幅度/前倾（这里）。
  // 少了它，起步慢跑和全速疾奔的画面一模一样，加速过程没有体感。
  it('摆幅随速度增长，慢跑不做大摆', () => {
    const swing = (k: number) => {
      let max = 0;
      for (let i = 0; i < 32; i++) {
        const m = run({}, true, i * 1.7, k).m;
        max = Math.max(max, Math.abs(m[0] * 0 + m[2] * 0 + m[4])); // 脚底横向摆幅
      }
      return max;
    };
    const slow = swing(0.25), full = swing(1);
    expect(full).toBeGreaterThan(slow * 1.5);
    expect(slow).toBeGreaterThan(0); // 慢跑仍在动，只是收着
  });

  it('前倾随速度单调递增，且始终缓于冲刺', () => {
    const lean = (k: number) => run({}, true, 0, k).m[2]; // 切变项，越负越前倾
    expect(lean(1)).toBeLessThan(lean(0.5));
    expect(lean(0.5)).toBeLessThan(lean(0));
    expect(Math.abs(lean(1))).toBeLessThan(Math.abs(run({ dashing: true }, false, 0).m[2]));
  });

  it('speedK 越界不炸——夹在 0..1，冲刺残速可能让它冲到 2', () => {
    for (const k of [-1, 0, 2, 99]) {
      const r = run({}, true, 7, k);
      expect(Number.isFinite(r.det)).toBe(true);
      expect(r.det).toBeGreaterThan(0.8);
    }
  });

  it('冲刺优先于腾空——空中冲刺该是冲刺姿态，不是坠落姿态', () => {
    const a = run({ dashing: true, onGround: false, vy: 500 }, false, 0).m;
    const b = run({ dashing: true, onGround: true }, false, 0).m;
    expect(a).toEqual(b);
  });
});
