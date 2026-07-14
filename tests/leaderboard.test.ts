import { describe, it, expect } from 'vitest';
import { fnv1a, signPayload, submitScore, isOnline, sanitizeRows } from '../src/api/leaderboard';

describe('签名与 worker 一致', () => {
  it('fnv1a 已知值锁定（worker/test 同断言，两边必须同值）', () => {
    expect(fnv1a('abc|1|2|3|CL2026')).toBe(fnv1a('abc|1|2|3|CL2026'));
    expect(signPayload({ name: 'a', score: 1, distanceM: 2, durationMs: 3, board: 'endless' }))
      .toBe(fnv1a('a|1|2|3|endless|CL2026'));
  });
});

describe('离线降级', () => {
  it('API_BASE 为空时 submitScore 返回 false 不发请求', async () => {
    const ok = await submitScore('a', { score: 1, distanceM: 1, durationMs: 5000 });
    expect(ok).toBe(false);
  });
  it('isOnline 在 VITE_API_BASE 为空时为 false', () => {
    expect(isOnline()).toBe(false);
  });
  it('sanitizeRows 过滤畸形行', () => {
    expect(sanitizeRows([{ name: 'a', score: 1, distance_m: 2 }, { name: 5, score: 1, distance_m: 2 }, null])).toEqual([{ name: 'a', score: 1, distance_m: 2 }]);
  });
});
