import { describe, it, expect } from 'vitest';
import { fnv1a, signPayload, submitScore, isOnline, sanitizeRows } from '../src/api/leaderboard';
import { scoreCeiling } from '../worker/src/validate';
import { Darkness } from '../src/game/darkness';
import { interval } from '../src/game/enemies';
import { CHUNKS } from '../src/game/chunks';
import { RUN_SPEED, PX_PER_METER, MULT_MAX, KILL_BONUS, COMBO_MAX, MOTE_SCORE } from '../src/game/constants';

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

describe('排行榜的分数上限必须盖得住真人满配', () => {
  /**
   * 这道校验是防伪造分的，但它首先不能拒收真人。上限写在 worker 里、能打出多少分
   * 却由游戏常量决定，两边隔着一个包，谁也不会想到去对一眼——原值 `×6 + 600` 的
   * 注释把加分估成约 3 分/米，实测击杀单项就有 6.8~12.4，理论满配是上限的 1.78 倍。
   *
   * 所以这里拿游戏自身的常量重算一遍满配，再去问 worker 的上限够不够。
   */

  /** 一局的硬顶：长夜封顶 330px/s 快过满跑 260，追上是必然。满速零失误能跑多远。 */
  function ceilingDistanceM(): number {
    const d = new Darkness();
    let x = 64, t = 0;
    while (!d.caught(x) && t < 600) { x += RUN_SPEED / 60; t += 1 / 60; d.update(1 / 60, t, x); }
    return (x - 64) / PX_PER_METER;
  }

  /** 这段路上会铺出多少只怪：间距就是 interval()，抖动均值为 1。 */
  function enemyCount(distanceM: number): number {
    let x = 0, n = 0;
    while (x < distanceM * PX_PER_METER) { x += interval(x / PX_PER_METER); n++; }
    return n;
  }

  /** 关卡块里的日光密度（颗/米）。 */
  function moteDensity(): number {
    let o = 0, w = 0;
    for (const c of CHUNKS) { o += c.rows.reduce((a, r) => a + [...r].filter(ch => ch === 'o').length, 0); w += c.rows[0].length; }
    return o / w;
  }

  it('把怪杀干净、连击拉满的人不会被判成作弊', () => {
    const d = ceilingDistanceM();
    const best =
      d * MULT_MAX +                                   // 路程 × 倍率封顶
      enemyCount(d) * KILL_BONUS * COMBO_MAX +         // 全杀且全程满连击
      moteDensity() * d * MOTE_SCORE;                  // 日光直接加分
    expect(scoreCeiling(d), `满配约 ${best.toFixed(0)} 分（${d.toFixed(0)}m）`).toBeGreaterThan(best);
  });

  it('上限仍留有余量，但没宽到失去意义', () => {
    const d = ceilingDistanceM();
    const best = d * MULT_MAX + enemyCount(d) * KILL_BONUS * COMBO_MAX + moteDensity() * d * MOTE_SCORE;
    const headroom = scoreCeiling(d) / best;
    expect(headroom).toBeGreaterThan(1.1);   // 风格分、飞尸连锁、列阵局部密集都还没算
    expect(headroom).toBeLessThan(2.0);      // 再宽就等于没这道校验
  });
});
