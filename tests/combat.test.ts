import { describe, it, expect } from 'vitest';
import { resolveHit, armorFrontal, isFrontal, type KillMethod, type HitOutcome } from '../src/game/combat';
import { makeEnemy, type Enemy, type EnemyKind } from '../src/game/enemies';

/**
 * 击杀矩阵：5 种敌人 × 3 种解法。
 *
 * 这张表就是本次改动的全部深度——「冲/踩/跨对每只怪效果相同」正是要消灭的
 * 现状。表一旦松动，玩家就又回到「不需要读敌人、只需要按」。
 */
const at = (kind: EnemyKind, extra: Partial<Enemy> = {}) =>
  makeEnemy({ kind, x: 100, y: 100, w: 24, h: 20, dir: 1, ...extra });

// 敌人中心 x = 112。玩家在右（120）= 站在 dir=1 的正面；在左（80）= 背面。
const FRONT = 120, BACK = 80;

describe('击杀矩阵', () => {
  const cases: [string, Enemy, KillMethod, number, HitOutcome][] = [
    ['旱魃 · 正面冲',        at('walker'),                      'dash',   FRONT, 'kill'],
    ['旱魃 · 踩',            at('walker'),                      'stomp',  FRONT, 'kill'],
    ['旱魃 · 跨',            at('walker'),                      'stride', FRONT, 'kill'],
    ['金乌 · 正面冲',        at('flyer'),                       'dash',   FRONT, 'kill'],
    ['盾旱魃 · 正面冲 → 弹回', at('shield'),                     'dash',   FRONT, 'bounce'],
    ['盾旱魃 · 背后冲 → 背刺', at('shield'),                     'dash',   BACK,  'backstab'],
    ['盾旱魃 · 踩',          at('shield'),                      'stomp',  FRONT, 'kill'],
    ['盾旱魃 · 跨',          at('shield'),                      'stride', FRONT, 'kill'],
  ];

  it.each(cases)('%s', (_label, e, method, px, want) => {
    expect(resolveHit(e, method, px)).toBe(want);
  });

  it('踩踏与跨步永不被装甲挡下——它们是装甲敌人唯一的通用解', () => {
    for (const kind of ['walker', 'flyer', 'shield'] as EnemyKind[]) {
      const e = at(kind);
      for (const method of ['stomp', 'stride'] as KillMethod[]) {
        expect(resolveHit(e, method, FRONT), `${kind} ${method}`).toBe('kill');
      }
    }
  });

  it('只有盾旱魃有正面装甲', () => {
    expect(armorFrontal(at('shield'))).toBe(true);
    expect(armorFrontal(at('walker'))).toBe(false);
    expect(armorFrontal(at('flyer'))).toBe(false);
  });

  it('背刺只对盾旱魃成立——别的怪没有「背面」这层含义', () => {
    expect(resolveHit(at('walker'), 'dash', BACK)).toBe('kill');
    expect(resolveHit(at('shield'), 'dash', BACK)).toBe('backstab');
  });

  it('正面判定跟着 dir 走：怪转身，正面就换边', () => {
    const facingLeft = at('shield', { dir: -1 });
    expect(isFrontal(facingLeft, BACK)).toBe(true);    // 怪朝左，玩家在左 = 正面
    expect(resolveHit(facingLeft, 'dash', BACK)).toBe('bounce');
    expect(resolveHit(facingLeft, 'dash', FRONT)).toBe('backstab');
  });


  it('中心重合时算正面——装甲宁严勿松', () => {
    // 敌人中心 x = 112，冲刺中心重合应判为正面，被装甲弹回
    const CENTER = 112;
    expect(resolveHit(at('shield'), 'dash', CENTER)).toBe('bounce');
    // dir=-1 的敌人，中心重合也是正面
    expect(resolveHit(at('shield', { dir: -1 }), 'dash', CENTER)).toBe('bounce');
  });
});
