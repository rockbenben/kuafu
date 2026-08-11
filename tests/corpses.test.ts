import { describe, it, expect } from 'vitest';
import { Corpses } from '../src/game/corpses';
import { makeEnemy } from '../src/game/enemies';
import { CORPSE_CHAIN_MAX, CORPSE_LIFE } from '../src/game/constants';

const enemyAt = (x: number) => makeEnemy({ kind: 'walker', x, y: 100, w: 24, h: 20, minX: 0, maxX: 9999 });

describe('飞尸连锁', () => {
  it('撞到敌人即击杀，并把被撞者报回给调用方', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);
    const victim = enemyAt(160);
    const killed = c.update(0.2, [victim]);
    expect(victim.alive).toBe(false);
    expect(killed.map(k => k.e)).toContain(victim);
  });

  it('一次只吃一个：撞死一个之后原来那具就散了，场上只剩新生的下一层', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);
    const before = c.list[0];
    c.update(0.2, [enemyAt(160)]);
    expect(c.list.length, '不该同时留着旧的和新的').toBe(1);
    expect(c.list[0], '原来那具必须已经散掉').not.toBe(before);
    expect(c.list[0].chain, '新生的是下一层').toBe(1);
  });

  it('链深到顶就不再生下一层，场上归零', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, CORPSE_CHAIN_MAX - 1);   // 撞死后 chain 会到上限
    c.update(0.2, [enemyAt(160)]);
    expect(c.list.length).toBe(0);
  });

  it('链深封顶，防雪崩', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, CORPSE_CHAIN_MAX);
    expect(c.list.length, '已达链深上限的击杀不再产生新飞尸').toBe(0);
  });

  it('寿命到期自行消散', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);
    c.update(CORPSE_LIFE + 0.01, []);
    expect(c.list.length).toBe(0);
  });

  it('已死的敌人不会被重复计入', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);
    const dead = enemyAt(160);
    dead.alive = false;
    expect(c.update(0.2, [dead])).toEqual([]);
  });
});

/**
 * 盾是全局唯一有「读法」的敌人：正面挡冲刺、背面可背刺。飞尸若无视这条，
 * 「先冲杀一只普通旱魃、让尸首替你清盾」就成了绕开这个读法的后门——而那是
 * 这一作战斗深度的全部。飞尸走的是同一张击杀矩阵（combat.ts），不另立规则。
 */
describe('飞尸也要认盾的正面', () => {
  const shieldAt = (x: number, dir: 1 | -1) =>
    makeEnemy({ kind: 'shield', x, y: 100, w: 24, h: 20, dir, minX: 0, maxX: 9999 });

  // 尸首向**右**飞（spawn 的 dirX=1），所以它是从目标的**左**侧打过来的。
  // 盾 dir=-1（朝左）时正面朝左 → 挡下；dir=1（朝右）时背面朝左 → 背刺。
  // 上一版把这两条写反了：它拿飞尸自己的中心去比大小，而尸首生成时就与目标
  // 重叠，判出的正反基本是掷硬币，只在 dt=0.2 那个人造步长下碰巧成立。
  it('撞盾的正面：尸首被挡下散掉，盾活着', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);
    const shield = shieldAt(160, -1);
    const killed = c.update(0.2, [shield]);
    expect(shield.alive, '盾不该被飞尸秒掉').toBe(true);
    expect(killed).toEqual([]);
    expect(c.list.length, '尸首应当在盾上撞散').toBe(0);
  });

  it('撞盾的背面：照杀，且算作背刺', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);
    const shield = shieldAt(160, 1);
    const killed = c.update(0.2, [shield]);
    expect(shield.alive).toBe(false);
    expect(killed.map(k => k.e)).toContain(shield);
    expect(killed[0].backstab, '飞尸背刺也该记成背刺').toBe(true);
  });

  it('判定看的是飞行方向，不是两个中心谁大——重叠生成也不能翻车', () => {
    // 尸首与盾**完全重叠**生成：靠中心比大小的写法在这里必然掷硬币
    const c = new Corpses();
    c.spawn(enemyAt(160), 1, 0);          // 与下面的盾同一坐标
    const shield = shieldAt(160, -1);     // 正面朝左，而尸首正是从左边来
    c.update(1 / 60, [shield]);
    expect(shield.alive, '重叠生成时仍须按来向判成正面').toBe(true);
  });

  it('普通旱魃不受影响，朝哪边都照杀', () => {
    for (const dir of [1, -1] as const) {
      const c = new Corpses();
      c.spawn(enemyAt(100), 1, 0);
      const w = makeEnemy({ kind: 'walker', x: 160, y: 100, w: 24, h: 20, dir, minX: 0, maxX: 9999 });
      expect(c.update(0.2, [w]).map(k => k.e)).toContain(w);
    }
  });

  it('连锁再生的飞尸沿用撞死它的那一具的方向，不跟玩家转身', () => {
    const c = new Corpses();
    c.spawn(enemyAt(100), 1, 0);                    // 向右飞
    const victim = makeEnemy({ kind: 'walker', x: 160, y: 100, w: 24, h: 20, minX: 0, maxX: 9999 });
    c.update(0.2, [victim]);
    expect(c.list.length, '撞死者应当化为下一层飞尸').toBe(1);
    expect(Math.sign(c.list[0].vx), '新飞尸必须继续向右，不能掉头').toBe(1);
  });
});
