import { describe, it, expect } from 'vitest';
import { Audio2 } from '../src/engine/audio';

/**
 * 音效必须有起音包络。
 *
 * 增益从 0 瞬跳到峰值会在波形头上切出一个阶跃，耳朵听到的是一记爆音；音量越大、
 * 频率越低越明显。死亡音那记「噪音特别大」有一半来自这里，另一半来自它原本是
 * 扫到 40Hz 的锯齿波——手机喇叭推不出那么低，只会还成失真。
 *
 * 这里不测「听起来怎么样」（测不了），只钉住两件能验的事：增益不是瞬跳上去的，
 * 以及死亡音不再是扫进次低频的锯齿。
 */

type Call = { m: string; a: number[] };

/** 记录式 AudioContext：把所有自动化调用记下来。 */
function stubCtx() {
  const calls: Call[] = [];
  const param = (tag: string) => ({
    value: 0,
    setValueAtTime: (v: number, t: number) => calls.push({ m: `${tag}.set`, a: [v, t] }),
    exponentialRampToValueAtTime: (v: number, t: number) => calls.push({ m: `${tag}.exp`, a: [v, t] }),
    linearRampToValueAtTime: (v: number, t: number) => calls.push({ m: `${tag}.lin`, a: [v, t] }),
  });
  const osc = { type: '', frequency: param('freq'), connect: () => node, start() {}, stop() {} };
  const node = { connect: () => node };
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: node,
    createOscillator: () => osc,
    createGain: () => ({ gain: param('gain'), connect: () => node }),
    createDynamicsCompressor: () => ({
      threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
      attack: { value: 0 }, release: { value: 0 }, connect: () => node,
    }),
  };
  return { ctx, calls, osc };
}

function play(fn: (a: Audio2) => void) {
  const a = new Audio2();
  const { ctx, calls, osc } = stubCtx();
  (a as unknown as { ctx: unknown }).ctx = ctx;
  fn(a);
  return { calls, osc };
}

describe('音效包络', () => {
  const sounds: [string, (a: Audio2) => void][] = [
    ['death', a => a.death()], ['jump', a => a.jump()], ['dash', a => a.dash()],
    ['mote', a => a.mote()], ['crystal', a => a.crystal()], ['kill', a => a.kill()],
    ['stride', a => a.stride()], ['charged', a => a.charged()], ['heartbeat', a => a.heartbeat(1)],
  ];

  it.each(sounds)('%s：增益不得从 0 瞬跳到峰值', (_name, fn) => {
    const { calls } = play(fn);
    const gain = calls.filter(c => c.m.startsWith('gain.'));
    expect(gain.length, '没有任何增益自动化').toBeGreaterThan(0);
    const first = gain[0];
    expect(first.m, '第一步必须是 setValueAtTime（起点）').toBe('gain.set');
    expect(first.a[0], '起点必须接近 0，否则开头就是一记阶跃').toBeLessThan(0.01);
    const rise = gain[1];
    expect(rise?.m, '起点之后必须有一段爬升，而不是直接开始衰减').toMatch(/gain\.(exp|lin)/);
    expect(rise.a[1], '爬升要落在起音时间内（听不出延迟）').toBeGreaterThan(0);
    expect(rise.a[1], '起音不能长到听得出来').toBeLessThanOrEqual(0.02);
    expect(rise.a[0], '爬升的目标应当是峰值').toBeGreaterThan(first.a[0]);
  });

  it('死亡音不再是扫进次低频的锯齿', () => {
    const { calls, osc } = play(a => a.death());
    expect(osc.type, '锯齿含全部谐波，低频段直接糊成噪音').not.toBe('sawtooth');
    const end = calls.filter(c => c.m === 'freq.exp')[0];
    expect(end.a[0], '终点低于 50Hz 手机喇叭只会还成失真').toBeGreaterThanOrEqual(50);
    const peak = calls.filter(c => c.m === 'gain.exp')[0];
    expect(peak.a[0], '死亡音不该是全场最响的').toBeLessThanOrEqual(0.12);
  });
});
