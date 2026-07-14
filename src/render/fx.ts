// 游戏感特效：屏幕震动（trauma 衰减）、顿帧（hitstop）、动态相机（前瞻+死亡拉近）。
// 纯状态机，不碰 DOM；渲染层读 camera() 应用变换，主循环读 hitstopActive 决定是否推进逻辑。

export interface CameraFX {
  shakeX: number;
  shakeY: number;
  extraCamX: number; // 相机前瞻偏移（按玩家速度平滑拉镜）
  zoom: number;      // 1 = 正常
  flash: number;     // 0..1 全屏白闪强度
}

const MAX_SHAKE_PX = 16;

export class FX {
  private trauma = 0;    // 0..1 震动强度
  private hitstopT = 0;  // 剩余顿帧秒数
  private lookAhead = 0; // 平滑后的相机前瞻
  private zoom = 1;
  private punchZoom = 0; // 瞬时拉近（击杀特写），快速衰减
  private flash = 0;     // 全屏白闪，快速衰减

  addShake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  hitstop(sec: number) { this.hitstopT = Math.max(this.hitstopT, sec); }
  punch(amount: number) { this.punchZoom = Math.max(this.punchZoom, amount); }
  triggerFlash(amount: number) { this.flash = Math.min(1, this.flash + amount); }
  get hitstopActive() { return this.hitstopT > 0; }

  update(dt: number, playerVx: number, dead: boolean) {
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    if (this.hitstopT > 0) this.hitstopT = Math.max(0, this.hitstopT - dt);
    this.punchZoom = Math.max(0, this.punchZoom - dt * 5);
    this.flash = Math.max(0, this.flash - dt * 6); // ~0.16s 内闪回
    const targetLook = Math.max(-40, Math.min(150, playerVx * 0.2));
    this.lookAhead += (targetLook - this.lookAhead) * Math.min(1, dt * 6);
    const targetZoom = dead ? 1.07 : 1;
    this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 5);
  }

  camera(): CameraFX {
    const s = this.trauma * this.trauma; // 平方：弱抖更柔、强抖更猛
    const mag = MAX_SHAKE_PX * s;
    const ang = Math.random() * Math.PI * 2;
    return {
      shakeX: Math.cos(ang) * mag,
      shakeY: Math.sin(ang) * mag * 0.8,
      extraCamX: this.lookAhead,
      zoom: this.zoom + this.punchZoom,
      flash: this.flash,
    };
  }
}
