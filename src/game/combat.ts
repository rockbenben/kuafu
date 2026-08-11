// 击杀判定：给定敌人、解法与玩家位置，判出结果。
//
// 抽成纯函数是因为这张矩阵同时被三方读：game.ts 的碰撞解算、renderer 的
// 「这只怪现在能不能冲」提示、以及测试。本仓库吃过「绘制一份、命中一份、
// 测试再一份」的亏（见 render/viewport.ts 的注释），这里不再开第二个口子。

import type { Enemy } from './enemies';

export type KillMethod = 'dash' | 'stomp' | 'stride';
export type HitOutcome = 'kill' | 'backstab' | 'bounce';

/**
 * 这只怪当前是否有**正面**装甲。
 *
 * 只有盾旱魃有。它不追人、朝向仅在巡逻折返时翻转，所以「它现在朝哪边」就是
 * 玩家唯一要读的东西：正面撞上去弹回，绕到背后冲就是背刺。
 */
export function armorFrontal(e: Enemy): boolean {
  return e.kind === 'shield';
}

/**
 * 玩家是否站在敌人面朝的那一侧。
 *
 * `e.dir` 恒为 ±1 不会是 0，但 `Math.sign(playerCx - center)` 在中心重合时返回 0。
 * 用 `!== -e.dir` 代替 `=== e.dir` 是为了让中心重合时算正面：`0 !== ±1` 永真，
 * 装甲宁严勿松，避免玩家在中心重合一帧时白嫖背刺或躲过弹回。
 */
export function isFrontal(e: Enemy, playerCx: number): boolean {
  return Math.sign(playerCx - (e.x + e.w / 2)) !== -e.dir;
}

/**
 * 踩踏与跨步永远有效——它们是装甲敌人唯一的通用解，也是「装甲」这件事不至于
 * 变成无解路障的保证。只有冲刺会被正面装甲弹回。
 */
export function resolveHit(e: Enemy, method: KillMethod, playerCx: number): HitOutcome {
  if (method !== 'dash') return 'kill';
  // 有正面装甲的就是盾（armorFrontal 目前只认它），所以背面必是背刺——别在这里
  // 再写一次 kind === 'shield'：那会让日后新增第二种正面装甲敌人时，它的背面击中
  // 被默默判成普通击杀（无加分、无飘字），而读代码的人以为背刺已经覆盖全部装甲。
  if (armorFrontal(e)) return isFrontal(e, playerCx) ? 'bounce' : 'backstab';
  return 'kill';
}

/**
 * 抛射物版判定：来向由**速度方向**决定，而不是「谁的中心坐标大」。
 *
 * 飞尸生成在死者的框上，而死者常常已经与目标重叠（敌人之间没有碰撞，旱魃还会
 * 警觉追击贴上盾），此时拿两个几乎重合的中心去比大小，判出的正面/背面基本是
 * 掷硬币——「先冲杀一只普通旱魃、让尸首替你清盾」那道后门就是这么漏的。
 * 速度方向没有这个问题：尸首朝哪飞，就是从相反那侧打过来的。
 */
export function resolveProjectile(e: Enemy, vx: number): HitOutcome {
  if (!armorFrontal(e)) return 'kill';
  // vx 为 0 时按正面算（装甲宁严勿松，与 isFrontal 对中心重合的处理同调）
  const from = -Math.sign(vx);
  return from === e.dir || from === 0 ? 'bounce' : 'backstab';
}
