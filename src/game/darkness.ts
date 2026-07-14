const START_X = -560;      // 起步更靠后，给新手更多缓冲
const BASE_SPEED = 84;
const WARMUP = 9;          // 前 9 秒维持慢速，之后才开始加速（新手学操作）
const ACCEL = 2.6;
const MAX_SPEED = 330;
const MAX_LAG = 1200;

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
