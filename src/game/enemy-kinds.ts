// 敌人是什么、每帧怎么动。enemies.ts 只管「在哪生成、何时清理」，单向依赖本文件。

import { ALERT_R, ALERT_DY, ALERT_SPEED_MUL } from './constants';

export type EnemyKind = 'walker' | 'flyer' | 'shield';

/** 地面族：吃 dir/minX/maxX；空中族（flyer）吃 baseY/phase。 */
export function isGroundKind(k: EnemyKind): boolean {
  return k === 'walker' || k === 'shield';
}

export interface Enemy {
  kind: EnemyKind;
  x: number; y: number; w: number; h: number; // AABB，x/y = 左上角
  dir: 1 | -1;   // 地面族移动/面朝方向；空中族未用
  baseY: number; // 空中族正弦基线；地面族未用
  phase: number; // 空中族相位
  alive: boolean;
  minX: number;  // 地面族巡逻左边界；空中族未用（0）
  maxX: number;  // 地面族巡逻右边界；空中族未用（0）
  /** 已察觉玩家。单向——察觉后不再回巡逻朝向，免得玩家在半径边缘把怪抖成抽搐。
   *  盾旱魃不参与警觉（见 updateGround），故对它恒为 false。 */
  alerted: boolean;
}

/** 新建敌人的字段默认值。所有生成路径都必须经由它，漏字段会被 TS 挡下。 */
export function makeEnemy(p: Partial<Enemy> & Pick<Enemy, 'kind' | 'x' | 'y' | 'w' | 'h'>): Enemy {
  return {
    dir: 1, baseY: 0, phase: 0, alive: true, minX: 0, maxX: 0, alerted: false,
    ...p,
  };
}

const WALKER_SPEED = 60;
/** flyer 正弦摆幅。enemies.ts 生成期用它算净空判据，必须与这里的实际摆动同一份——
 *  两处各写一份字面量的话，改一处不改另一处，飞怪就会半嵌进山体。 */
export const FLYER_SWING = 26;

/** 玩家是否落在这只怪的察觉范围内（半径 + 高度相近）。 */
function senses(e: Enemy, playerCx: number, playerCy: number): boolean {
  const cy = e.y + e.h / 2;
  return Math.abs(playerCx - (e.x + e.w / 2)) <= ALERT_R && Math.abs(playerCy - cy) <= ALERT_DY;
}

/** 来回巡逻，到边界折返。 */
function patrolStep(e: Enemy, dt: number, speed: number) {
  e.x += e.dir * speed * dt;
  if (e.x <= e.minX) { e.x = e.minX; e.dir = 1; }
  else if (e.x >= e.maxX) { e.x = e.maxX; e.dir = -1; }
}

/**
 * 地面族：警觉后转身朝玩家走并提速，但绝不越出自己的巡逻区间。
 *
 * 盾旱魃是例外，不参与警觉追击：警觉后每帧都把 dir 转去对准玩家，会让它
 * 永远没有背可言——数学上可证，dir 恒被设成跟随玩家当前位置的符号，而
 * combat.ts 的 isFrontal 判据正好用这个符号的取反去判等，代入两种符号都不
 * 等，isFrontal 对任何贴身接触的警觉盾恒为 true。接触判定的距离又远小于
 * 察觉半径，意味着「正贴身接触」必然同时满足「已被警觉」，背刺在那套逻辑下
 * 结构性打不中，不是概率低。盾只巡逻、朝向仅在撞到 [minX,maxX] 边界时翻转，
 * 背刺才有真正打得中的窗口：趁它背对着走的时候冲上去。
 */
function updateGround(e: Enemy, dt: number, playerCx: number, playerCy: number) {
  if (e.kind !== 'shield') {
    if (!e.alerted && senses(e, playerCx, playerCy)) e.alerted = true;
    if (e.alerted) {
      e.dir = playerCx > e.x + e.w / 2 ? 1 : -1;
      e.x = Math.min(Math.max(e.x + e.dir * WALKER_SPEED * ALERT_SPEED_MUL * dt, e.minX), e.maxX);
      return;
    }
  }
  patrolStep(e, dt, WALKER_SPEED);
}

/** 空中族：正弦摆动。 */
function updateAir(e: Enemy, dt: number) {
  e.phase += dt * 3;
  e.y = e.baseY + Math.sin(e.phase) * FLYER_SWING;
}

export function updateEnemy(e: Enemy, dt: number, playerCx: number, playerCy: number) {
  if (isGroundKind(e.kind)) updateGround(e, dt, playerCx, playerCy);
  else updateAir(e, dt);
}
