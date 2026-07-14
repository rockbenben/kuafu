import { describe, it, expect } from 'vitest';
import { fnv1a, signPayload } from '../src/sig';
import { validateSubmission } from '../src/validate';

function valid() {
  const base = { name: '影子', score: 500, distanceM: 300, durationMs: 60000, board: 'endless' };
  return { ...base, sig: signPayload(base) };
}

describe('fnv1a', () => {
  it('确定性且 8 位十六进制', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });

  it('跨端一致性锁定值（含榜单键）', () => {
    expect(signPayload({ name: 'a', score: 1, distanceM: 2, durationMs: 3, board: 'endless' }))
      .toBe(fnv1a('a|1|2|3|endless|CL2026'));
  });
});

describe('validateSubmission', () => {
  it('合法提交通过', () => {
    expect(validateSubmission(valid())).toBeNull();
  });
  it('接受：今日挑战榜键', () => {
    const b = { name: 'a', score: 500, distanceM: 300, durationMs: 60000, board: 'daily:2026-07-13' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).toBeNull();
  });
  it('拒绝：昵称为空或过长', () => {
    expect(validateSubmission({ ...valid(), name: '  ' })).not.toBeNull();
    expect(validateSubmission({ ...valid(), name: 'x'.repeat(17) })).not.toBeNull();
  });
  it('拒绝：时长过短', () => {
    const b = { name: 'a', score: 10, distanceM: 5, durationMs: 1000, board: 'endless' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).not.toBeNull();
  });
  it('拒绝：距离超物理上限（12 m/s）', () => {
    const b = { name: 'a', score: 10, distanceM: 500, durationMs: 10000, board: 'endless' }; // 50 m/s
    expect(validateSubmission({ ...b, sig: signPayload(b) })).not.toBeNull();
  });
  it('拒绝：分数与距离不匹配', () => {
    const b = { name: 'a', score: 999999, distanceM: 10, durationMs: 60000, board: 'endless' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).not.toBeNull();
  });
  it('接受：高光点收集的精英成绩（score ≈ dist×5）', () => {
    const b = { name: 'pro', score: 7400, distanceM: 1500, durationMs: 300000, board: 'endless' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).toBeNull();
  });
  it('接受：含击杀加分的精英成绩（score ≈ dist×6）', () => {
    const b = { name: 'hunter', score: 8800, distanceM: 1500, durationMs: 300000, board: 'endless' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).toBeNull();
  });
  it('拒绝：远超合理上限的伪造分（dist×7）', () => {
    const b = { name: 'cheat', score: 10500, distanceM: 1500, durationMs: 300000, board: 'endless' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).not.toBeNull();
  });
  it('拒绝：非法榜单键', () => {
    const b = { name: 'a', score: 500, distanceM: 300, durationMs: 60000, board: 'daily:xx' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).not.toBeNull();
    const b2 = { name: 'a', score: 500, distanceM: 300, durationMs: 60000, board: 'hacker' };
    expect(validateSubmission({ ...b2, sig: signPayload(b2) })).not.toBeNull();
  });
  it('拒绝：跨榜重放（签名覆盖榜单键，改榜即失效）', () => {
    const b = { name: 'a', score: 500, distanceM: 300, durationMs: 60000, board: 'endless' };
    const sig = signPayload(b); // 常规榜签名
    expect(validateSubmission({ ...b, board: 'daily:2026-07-13', sig })).not.toBeNull();
  });
  it('拒绝：签名错误', () => {
    expect(validateSubmission({ ...valid(), sig: '00000000' })).not.toBeNull();
  });
  it('拒绝：非对象/字段缺失/浮点数', () => {
    expect(validateSubmission(null)).not.toBeNull();
    expect(validateSubmission({})).not.toBeNull();
    const b = { name: 'a', score: 10.5, distanceM: 5, durationMs: 30000, board: 'endless' };
    expect(validateSubmission({ ...b, sig: signPayload(b) })).not.toBeNull();
  });
});
