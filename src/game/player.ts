import type { InputState, Rect, Vec2 } from './types';
import { moveAndCollide, aabbOverlap } from './collision';
import {
  PLAYER_W, PLAYER_H, RUN_SPEED, RUN_ACCEL, GRAVITY, MAX_FALL,
  JUMP_VEL, JUMP_CUT, COYOTE_TIME, JUMP_BUFFER,
  DASH_SPEED, DASH_TIME, DASH_END_KEEP, STRIDE_SPEED, STRIDE_TIME, STRIDE_RISE, STRIDE_RISE_SPEED, STRIDE_INVULN,
  BOUNCE_SPEED, BOUNCE_TIME, DASH_LOCK, WORLD_ROWS,
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
  private bounceT = 0;   // 弹回窗口：期间水平输入不接管
  private dashLock = 0;  // 弹回后的冲刺锁定

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
    // 一并解锁：不清 dashLock 的话，弹回后拾到的甘泉会被白吃掉——水晶消失了、
    // 拾取特效也放了，玩家读到「冲刺已续上」，接下来半秒按冲却毫无反应。
    this.dashLock = 0;
  }

  /** 踩踏回弹：下落踏碎小怪后小幅上弹并恢复冲刺（马里奥式踩踏手感）。 */
  stompBounce() {
    this.vel.y = JUMP_VEL * 0.68;
    this.onGround = false;
    this.canDash = true;
    this.dashLock = 0;   // 同 refillDash：踩踏承诺的「恢复冲刺」不能是假的
  }

  /** 弹回窗口内：水平输入不接管，人被推着后退。 */
  get bouncing(): boolean { return this.bounceT > 0; }

  /**
   * 冲刺撞上装甲正面：弹回，不死。
   *
   * 必须连 smashTimer 一起清零——那 0.12s 的击碎宽限本是给「贴脸冲刺」用的，
   * 留着的话弹回后紧接的那一下仍会把怪撞碎，装甲就形同虚设。
   * dashLock 也是必需的：update 末尾落地即 canDash = true，不加锁弹回几乎无代价。
   */
  bounceOff(awayX: 1 | -1) {
    this.dashing = false;
    this.smashTimer = 0;
    this.vel.x = BOUNCE_SPEED * awayX;
    this.bounceT = BOUNCE_TIME;
    this.canDash = false;
    this.dashLock = DASH_LOCK;
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
        // **「最高的重叠实体」不是这摞石板的顶**：`parseChunk` 按行生成 1 格高的 Rect、
        // 从不纵向合并，而人高 28px < 格高 32px，装得进单独一行。托到那一行的顶，等于
        // 把人塞进上面那一行里——合成场景实测：落在 y=324 那行、被托到 328，然后 2 秒
        // 一动不动地站在山体内部。所以要沿这一摞连续往上走完。
        // （这与 `enemies.ts` 的 `reachable()` 栽过的第 ① 个坑是同一个，换了个地方。
        //   现有关卡块的几何碰不到它——400 局 485 次跨步落地 0 次嵌入——但兜底逻辑
        //   本就是给意外几何兜底的，它自己不能有洞。）
        for (let guard = 0; guard < WORLD_ROWS && top !== Infinity; guard++) {
          const above = solids.find(s =>
            Math.abs(s.y + s.h - top) < 1 && s.x < r.x + r.w && s.x + s.w > r.x);
          if (!above) break;
          top = above.y;
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

    // --- 土狼时间与跳跃缓冲：每帧都走表 ---
    // 曾经只在下面的 else 分支里递减，于是冲刺期间两个计时器都冻结：跑出崖沿后
    // 冲刺 0.15s，coyote 一格没掉，冲刺结束仍可起跳——实测能在崖外 120px 处起跳，
    // 白赚约 3 格跨距，关卡的「跳跃极限」因此完全不可信。
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? COYOTE_TIME : Math.max(0, this.coyote - dt);

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
    } else if (input.dashPressed && this.canDash && this.dashLock <= 0) {
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
    } else if (this.bounceT > 0) {
      // 弹回窗口：只夺走**水平**控制权，让人真的被推回去。不这么做的话，玩家按住
      // → 当帧就把 BOUNCE_SPEED 拉回正值，弹回等于没发生，「读错敌人要付代价」
      // 这条设计随之落空。
      //
      // 但跳跃必须照常受理：这一段原本整个跳过了下面那个 else，于是 jumpBuffer
      // (0.12s) 与 coyote (0.1s) 在被推的这 0.25 秒里空转过期——在崖边的盾上弹一
      // 下，接着四分之一秒你按跳毫无反应，人被推下崖或推进长夜里，全程没有操作权。
      // 代价该是掉速，不是断手。
      this.bounceT -= dt;
      this.vel.y = Math.min(this.vel.y + GRAVITY * dt, MAX_FALL);
      if (this.wasHoldingJump && !input.jumpHeld && this.vel.y < 0) this.vel.y *= JUMP_CUT;
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.vel.y = JUMP_VEL;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.justJumped = true;
      }
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

      // --- 跳跃（coyote + 缓冲，计时器已在上面走过表）---
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
    if (out.hitX) {
      // 水平被挡住的纯横向冲刺当帧作废。冲刺期间 vel.y 被按住（跳+冲能跨 9.5 格
      // 全靠它），可一旦横向也走不动，这个「按住」就只剩一个效果：人贴在墙面上
      // 停在半空，整整 DASH_TIME 不掉。实测贴墙冲刺 9 帧内 Δy=0，而同一段无墙时
      // 走 112px。代价还不止观感——出来时水平速度已被墙清零，接着直上直下落下，
      // 常常以 vx=0 的姿态落在坑沿前，而站定起跳跨不过按满速设计的坑。
      // 斜向冲刺不在此列：它还在往上/下走，不算「停住」。
      if (this.dashing && this.dashDir.y === 0) this.dashing = false;
      this.vel.x = 0;
    }
    if (out.hitY) {
      if (this.dashing && this.vel.y > 0) this.dashing = false; // 下冲落地取消冲刺
      this.vel.y = 0;
    }
    // 地面状态：向下 1px 位置探针，与速度解耦（排除已嵌入的固体）
    const r = this.rect;
    this.onGround = solids.some(s => aabbOverlap({ x: r.x, y: r.y + 1, w: r.w, h: r.h }, s) && !aabbOverlap(r, s));
    this.dashLock = Math.max(0, this.dashLock - dt);
    if (this.onGround) {
      if (this.dashLock <= 0) this.canDash = true;
      if (!wasGround) this.justLanded = true;
    }
    // 击碎宽限：冲刺中保持满值，结束后短暂保留（贴脸冲刺不至于判成撞死）
    this.smashTimer = this.dashing ? 0.12 : Math.max(0, this.smashTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.minYReached = Math.min(this.minYReached, this.pos.y);
  }
}
