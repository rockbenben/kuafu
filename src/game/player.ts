import type { InputState, Rect, Vec2 } from './types';
import { moveAndCollide, aabbOverlap } from './collision';
import {
  PLAYER_W, PLAYER_H, RUN_SPEED, RUN_ACCEL, GRAVITY, MAX_FALL,
  JUMP_VEL, JUMP_CUT, COYOTE_TIME, JUMP_BUFFER,
  DASH_SPEED, DASH_TIME, DASH_END_KEEP, STRIDE_SPEED, STRIDE_TIME, STRIDE_RISE, STRIDE_RISE_SPEED, STRIDE_INVULN,
} from './constants';

export class Player {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };
  onGround = false;
  facing: 1 | -1 = 1;
  canDash = true;
  dashing = false;
  striding = false; // 大招·夸父跨步（无敌横越）

  justJumped = false;
  justDashed = false;
  justLanded = false;

  minYReached = Infinity; // 测试用：记录到达过的最高点

  private coyote = 0;
  private jumpBuffer = 0;
  private dashTimer = 0;
  private strideTimer = 0;
  private smashTimer = 0; // 冲刺结束后的短暂"击碎"宽限，避免贴脸冲刺判成撞死
  private invulnTimer = 0; // 跨步结束后的无敌时长
  private dashDir: Vec2 = { x: 1, y: 0 };
  private wasHoldingJump = false;

  /** 处于可击碎小怪的状态：冲刺中 / 跨步中 / 冲刺刚结束的宽限内。 */
  get smashing(): boolean {
    return this.dashing || this.striding || this.smashTimer > 0;
  }

  /** 无敌（免尖刺、撞碎敌人）：跨步中 或 跨步结束后的无敌窗口内。 */
  get invincible(): boolean {
    return this.striding || this.invulnTimer > 0;
  }

  /** 无敌剩余比例 0~1（用于光环强度）。 */
  get invulnFrac(): number {
    return Math.max(0, Math.min(1, this.invulnTimer / STRIDE_INVULN));
  }

  constructor(pos: Vec2) {
    this.pos = { ...pos };
  }

  get rect(): Rect {
    return { x: this.pos.x, y: this.pos.y, w: PLAYER_W, h: PLAYER_H };
  }

  refillDash() {
    this.canDash = true;
  }

  /** 踩踏回弹：下落踏碎小怪后小幅上弹并恢复冲刺（马里奥式踩踏手感）。 */
  stompBounce() {
    this.vel.y = JUMP_VEL * 0.68;
    this.onGround = false;
    this.canDash = true;
  }

  /** 发动大招·夸父跨步：向前平飞一屏，无碰撞穿越。 */
  stride() {
    this.striding = true;
    this.strideTimer = STRIDE_TIME;
    this.dashing = false;
    this.facing = 1;
  }

  update(input: InputState, dt: number, solids: Rect[]) {
    this.justJumped = this.justDashed = this.justLanded = false;

    // --- 大招·夸父跨步：先腾空、再高空横越，无碰撞 ---
    if (this.striding) {
      this.strideTimer -= dt;
      const elapsed = STRIDE_TIME - this.strideTimer;
      if (elapsed < STRIDE_RISE) {
        // 上升期：先飞到空中（同时缓速前移），避免在低处/坑里够不到高台
        this.vel = { x: STRIDE_SPEED * 0.5, y: -STRIDE_RISE_SPEED };
      } else {
        // 横越期：高空平推
        this.vel = { x: STRIDE_SPEED, y: 0 };
      }
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.onGround = false;
      this.minYReached = Math.min(this.minYReached, this.pos.y);
      if (this.strideTimer <= 0) {
        this.striding = false;
        this.vel.x *= 0.4;
        this.canDash = true;
        this.invulnTimer = STRIDE_INVULN; // 落地后短暂无敌，防砸尖刺/撞敌即死
        // 落点若嵌进平台，托到平台顶（否则 moveAndCollide 会让其穿地坠落）
        const r = this.rect;
        let top = Infinity;
        for (const s of solids) {
          if (aabbOverlap(r, s) && s.y < top) top = s.y;
        }
        if (top !== Infinity) {
          this.pos.y = top - PLAYER_H;
          this.vel.y = 0;
          this.onGround = true;
        }
      }
      this.wasHoldingJump = input.jumpHeld;
      return;
    }

    // --- 冲刺状态 ---
    if (this.dashing) {
      this.dashTimer -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.y = this.dashDir.y * DASH_SPEED;
      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.vel.x *= DASH_END_KEEP;
        this.vel.y *= DASH_END_KEEP;
      }
    } else if (input.dashPressed && this.canDash) {
      // --- 触发冲刺（优先于跳跃；同帧按下时冲刺生效）---
      const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const raw = dx === 0 && dy === 0 ? { x: this.facing, y: 0 } : { x: dx, y: dy };
      const len = Math.hypot(raw.x, raw.y);
      this.dashDir = { x: raw.x / len, y: raw.y / len };
      this.dashing = true;
      this.dashTimer = DASH_TIME;
      this.canDash = false;
      this.justDashed = true;
      this.vel = { x: this.dashDir.x * DASH_SPEED, y: this.dashDir.y * DASH_SPEED };
    } else {
      // --- 水平 ---
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) this.facing = dir as 1 | -1;
      const target = dir * RUN_SPEED;
      const delta = target - this.vel.x;
      const accel = RUN_ACCEL * dt;
      this.vel.x += Math.abs(delta) <= accel ? delta : Math.sign(delta) * accel;

      // --- 重力与可变跳高 ---
      this.vel.y = Math.min(this.vel.y + GRAVITY * dt, MAX_FALL);
      if (this.wasHoldingJump && !input.jumpHeld && this.vel.y < 0) {
        this.vel.y *= JUMP_CUT;
      }

      // --- 跳跃（coyote + 缓冲）---
      if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
      else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.coyote = this.onGround ? COYOTE_TIME : Math.max(0, this.coyote - dt);

      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.vel.y = JUMP_VEL;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.justJumped = true;
      }
    }
    this.wasHoldingJump = input.jumpHeld;

    // --- 移动与碰撞 ---
    const wasGround = this.onGround;
    const out = moveAndCollide(this.rect, this.vel, dt, solids);
    this.pos = out.pos;
    if (out.hitX) this.vel.x = 0;
    if (out.hitY) {
      if (this.dashing && this.vel.y > 0) this.dashing = false; // 下冲落地取消冲刺
      this.vel.y = 0;
    }
    // 地面状态：向下 1px 位置探针，与速度解耦（排除已嵌入的固体）
    const r = this.rect;
    this.onGround = solids.some(s => aabbOverlap({ x: r.x, y: r.y + 1, w: r.w, h: r.h }, s) && !aabbOverlap(r, s));
    if (this.onGround) {
      this.canDash = true;
      if (!wasGround) this.justLanded = true;
    }
    // 击碎宽限：冲刺中保持满值，结束后短暂保留（贴脸冲刺不至于判成撞死）
    this.smashTimer = this.dashing ? 0.12 : Math.max(0, this.smashTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.minYReached = Math.min(this.minYReached, this.pos.y);
  }
}
