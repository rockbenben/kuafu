// 连杀：数窗口内的击杀并给出倍率。清版格斗的分数引擎——杀 5 只不该等于杀 1 只
// 五次。只做这一件事，不碰计分、不碰特效，两者各自读它。

import { COMBO_WINDOW, COMBO_STEP, COMBO_MAX, KILL_BONUS } from './constants';

export class Combo {
  count = 0;
  private timer = 0;

  /** 记一次击杀，返回当前倍率。 */
  hit(): number {
    this.count++;
    this.timer = COMBO_WINDOW;
    return this.multiplier;
  }

  /** 未连杀时为 0：调用方据此判断「这一局还没开始连」，而不是误算成 ×1。 */
  get multiplier(): number {
    return this.count === 0 ? 0 : Math.min(1 + (this.count - 1) * COMBO_STEP, COMBO_MAX);
  }

  get bonus(): number {
    return Math.round(KILL_BONUS * this.multiplier);
  }

  /** HUD 淡出用：窗口末段（最后 0.6s）线性淡出，让「要断了」看得见。 */
  get alpha(): number {
    if (this.count === 0) return 0;
    return Math.max(0, Math.min(1, this.timer / 0.6));
  }

  update(dt: number) {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0; this.count = 0; }
  }

  reset() { this.count = 0; this.timer = 0; }
}
