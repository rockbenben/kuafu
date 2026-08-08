const START_X = -560;      // 起步更靠后，给新手更多缓冲
const BASE_SPEED = 84;
const WARMUP = 9;          // 前 9 秒维持慢速，之后才开始加速（新手学操作）
const ACCEL = 2.6;
const MAX_SPEED = 330;
const MAX_LAG = 1200;

/**
 * 长夜逼近到多近就开始告警（px）。满速 260px/s 下约合 1.65s 的余量——
 * 够玩家反应，又不至于长时间挂着告警而麻木。
 */
export const DANGER_GAP = 430;

/**
 * 0 = 安全，1 = 贴脸。视觉暗角与心跳共用这一条曲线，两者才同步；
 * 各算各的会出现「画面已经红了但心跳还慢」的错位。
 */
export function dangerLevel(playerX: number, darknessX: number): number {
  return Math.max(0, Math.min(1, 1 - (playerX - darknessX) / DANGER_GAP));
}

export class Darkness {
  x = START_X;

  speedAt(elapsed: number): number {
    return Math.min(BASE_SPEED + Math.max(0, elapsed - WARMUP) * ACCEL, MAX_SPEED);
  }

  update(dt: number, elapsed: number, playerX: number) {
    this.x += this.speedAt(elapsed) * dt;
    if (playerX - this.x > MAX_LAG) this.x = playerX - MAX_LAG;
  }

  caught(playerX: number): boolean {
    return this.x >= playerX;
  }
}
