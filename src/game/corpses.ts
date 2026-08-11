// 击飞连锁：被冲刺/跨步杀死的怪向后飞出，撞到谁谁死。清版格斗最标志性的一瞬。
//
// 刻意不与地形碰撞——飞尸穿墙而过即可。为它写一套碰撞解算，收益只有「撞墙会停」
// 这点观感，成本却是又一份 moveAndCollide 的调用方，不值。

import type { Enemy } from './enemies';
import type { Rect } from './types';
import { aabbOverlap } from './collision';
import { resolveProjectile } from './combat';
import { CORPSE_SPEED, CORPSE_LIFE, CORPSE_CHAIN_MAX } from './constants';

export interface CorpseKill { e: Enemy; backstab: boolean }

export interface Corpse {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  t: number;      // 剩余寿命
  chain: number;  // 已经是第几层连锁
}

export class Corpses {
  list: Corpse[] = [];

  /**
   * 记录「这具被撞死的敌人，是被第几层的飞尸打死的」——只在本帧 update() 期间有效。
   *
   * 不塞进 Enemy（enemy-kinds.ts 不该为这一件事多个字段）、也不改 update() 的返回
   * 类型（`Enemy[]` 是 Task 11 定好的接口，调用方靠 `toContain`/`toEqual` 直接
   * 比较敌人对象）。game.ts 要按「chain+1」再生下一层飞尸，只能从这里查。
   */

  /**
   * 让一具尸首飞出去。chain 已达上限则什么也不做——没有这道闸，一次冲刺可以
   * 在一屏里连锁掉整个列阵，连杀倍率跟着爆掉。
   */
  spawn(e: Enemy, dirX: 1 | -1, chain: number) {
    if (chain >= CORPSE_CHAIN_MAX) return;
    this.list.push({
      x: e.x, y: e.y, w: e.w, h: e.h,
      vx: dirX * CORPSE_SPEED, vy: -CORPSE_SPEED * 0.35,
      t: CORPSE_LIFE, chain,
    });
  }

  /**
   * 推进飞尸并解算连锁。返回本帧被撞死的敌人，交由调用方计入连杀、并按各自的
   * chain+1 再生新的飞尸（查 `chainOf`）——本类不认识 Game，也就不该替它做加分。
   */
  update(dt: number, enemies: Enemy[]): CorpseKill[] {
    const killed: CorpseKill[] = [];
    const born: { e: Enemy; dirX: 1 | -1; chain: number }[] = [];
    for (const c of this.list) {
      c.t -= dt;
      const x0 = c.x, y0 = c.y;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 900 * dt;                  // 抛物线下坠，读作「被打飞」而非「飘走」
      // 命中判定用「本帧扫过的区域」而非落点：发射初速把飞尸先往上蹿一截，水平
      // 对上目标那一刻竖直方向可能已经飘出目标框外，单看落点会漏判。真实游戏走
      // src/engine/loop.ts 的固定步长循环（恒 DT=1/60，掉帧走追帧而非放大 dt），
      // 不会有大 dt；但 tests/corpses.test.ts 的首条测试就是用 dt=0.2 单步驱动
      // （brief 原样如此），照抄参考实现在那条测试上直接是错的——落点判定漏了它。
      const swept: Rect = {
        x: Math.min(x0, c.x), y: Math.min(y0, c.y),
        w: Math.abs(c.x - x0) + c.w, h: Math.abs(c.y - y0) + c.h,
      };
      for (const e of enemies) {
        if (!e.alive || !aabbOverlap(swept, e)) continue;
        // 飞尸也吃同一张击杀矩阵。盾的正面挡得住冲刺，就该同样挡得住被冲刺打飞
        // 的尸首——否则「先冲杀一只普通旱魃、让尸首替你清盾」就成了绕开全局唯一
        // 那个读法的后门。撞正面则尸首散掉、盾活着（读作被挡下）。
        const outcome = resolveProjectile(e, c.vx);
        if (outcome === 'bounce') {
          c.t = 0;
          break;
        }
        e.alive = false;
        killed.push({ e, backstab: outcome === 'backstab' });
        // 撞死者本身也化为飞尸，方向沿用撞死它的那一具——不能用玩家当前朝向：
        // 玩家中途一转身，整条连锁就掉头朝他自己飞回去，还会收割他身后那些
        // 这一击根本没碰到的敌人。押后到循环外再入列，免得同一帧把整条链走完。
        born.push({ e, dirX: (Math.sign(c.vx) || 1) as 1 | -1, chain: c.chain + 1 });
        c.t = 0;                         // 撞一个就散，避免一具尸首横扫全场
        break;
      }
    }
    for (const b of born) this.spawn(b.e, b.dirX, b.chain);
    this.list = this.list.filter(c => c.t > 0);
    return killed;
  }

  prune(leftEdgeX: number) {
    this.list = this.list.filter(c => c.x + c.w >= leftEdgeX);
  }

  clear() { this.list = []; }
}
