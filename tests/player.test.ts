import { describe, it, expect } from 'vitest';
import { Player } from '../src/game/player';
import { DT, COYOTE_TIME, JUMP_BUFFER, RUN_SPEED, DASH_TIME, DASH_SPEED, STRIDE_TIME, PLAYER_H, BOUNCE_SPEED, DASH_LOCK } from '../src/game/constants';
import type { InputState, Rect } from '../src/game/types';

export const IDLE: InputState = {
  left: false, right: false, up: false, down: false,
  jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false,
};
const GROUND: Rect[] = [{ x: -1000, y: 300, w: 4000, h: 64 }];

/** 让玩家先落到地面 */
function grounded(): Player {
  const p = new Player({ x: 0, y: 300 - 28 });
  p.update(IDLE, DT, GROUND);
  return p;
}
function steps(p: Player, input: InputState, n: number, solids = GROUND) {
  for (let i = 0; i < n; i++) p.update({ ...input, jumpPressed: i === 0 && input.jumpPressed, dashPressed: i === 0 && input.dashPressed }, DT, solids);
}

describe('Player 基础移动', () => {
  it('按住右可加速到最大跑速', () => {
    const p = grounded();
    steps(p, { ...IDLE, right: true }, 30);
    expect(p.vel.x).toBeCloseTo(RUN_SPEED, 0);
    expect(p.facing).toBe(1);
  });

  it('地面起跳获得向上速度，可变跳高：早松开跳得矮', () => {
    const pHold = grounded();
    for (let i = 0; i < 40; i++) pHold.update({ ...IDLE, jumpHeld: true, jumpPressed: i === 0 }, DT, GROUND);
    const apexHold = pHold.minYReached;

    const pTap = grounded();
    for (let i = 0; i < 40; i++) pTap.update({ ...IDLE, jumpHeld: i < 4, jumpPressed: i === 0 }, DT, GROUND);
    const apexTap = pTap.minYReached;

    expect(apexHold).toBeLessThan(apexTap - 20); // 长按明显更高（y 越小越高）
  });

  it('coyote time：走出平台边缘后短时间内仍可起跳', () => {
    const ledge: Rect[] = [{ x: 0, y: 300, w: 100, h: 64 }];
    const p = new Player({ x: 95, y: 300 - 28 });
    p.update(IDLE, DT, ledge);                       // 落稳
    steps(p, { ...IDLE, right: true }, 6, ledge);    // 走出边缘（离地约 2~3 帧）
    expect(p.onGround).toBe(false);
    p.update(IDLE, DT, ledge);                       // 再空中 1 帧，仍在 coyote 窗口内
    p.update({ ...IDLE, jumpHeld: true, jumpPressed: true }, DT, ledge);
    expect(p.vel.y).toBeLessThan(0); // 成功起跳
  });

  it('coyote 窗口过后不能空中起跳', () => {
    const p = new Player({ x: 0, y: 0 }); // 空中
    for (let i = 0; i < Math.ceil((COYOTE_TIME + 0.05) / DT); i++) p.update(IDLE, DT, GROUND);
    p.update({ ...IDLE, jumpHeld: true, jumpPressed: true }, DT, GROUND);
    expect(p.vel.y).toBeGreaterThan(0); // 仍在下落
  });

  it('跳跃缓冲：落地前按跳，落地瞬间自动起跳', () => {
    const p = new Player({ x: 0, y: 300 - 28 - 8 }); // 距地 8px 下落（约 5 帧后落地，仍在 0.12s 缓冲窗口内）
    p.update({ ...IDLE, jumpHeld: true, jumpPressed: true }, DT, GROUND); // 提前按跳
    let jumped = false;
    for (let i = 0; i < Math.ceil(JUMP_BUFFER / DT) + 20; i++) {
      p.update({ ...IDLE, jumpHeld: true }, DT, GROUND);
      if (p.vel.y < 0) { jumped = true; break; }
    }
    expect(jumped).toBe(true);
  });
});

describe('Player 冲刺与地面状态（评审修复）', () => {
  it('地面水平冲刺不丢失 onGround，也不触发虚假 justLanded', () => {
    const p = grounded();
    p.update({ ...IDLE, dashPressed: true }, DT, GROUND);
    let spurious = false;
    for (let i = 0; i < Math.ceil(DASH_TIME / DT) + 3; i++) {
      p.update(IDLE, DT, GROUND);
      expect(p.onGround).toBe(true);
      if (p.justLanded) spurious = true;
    }
    expect(spurious).toBe(false);
  });
  it('同帧跳+冲：冲刺优先，justJumped 不虚报', () => {
    const p = grounded();
    p.update({ ...IDLE, jumpHeld: true, jumpPressed: true, dashPressed: true }, DT, GROUND);
    expect(p.justDashed).toBe(true);
    expect(p.justJumped).toBe(false);
    expect(Math.abs(p.vel.x)).toBeCloseTo(DASH_SPEED);
    expect(p.vel.y).toBeCloseTo(0);
  });
});

describe('Player 冲刺', () => {
  it('无方向输入时向面朝方向水平冲刺', () => {
    const p = grounded();
    p.update({ ...IDLE, dashPressed: true }, DT, GROUND);
    expect(p.dashing).toBe(true);
    expect(p.vel.x).toBeCloseTo(DASH_SPEED);
    expect(p.vel.y).toBeCloseTo(0);
  });

  it('斜向冲刺速度归一化（右上冲刺）', () => {
    const p = new Player({ x: 0, y: 0 }); // 空中
    p.update({ ...IDLE, right: true, up: true, dashPressed: true }, DT, []);
    const speed = Math.hypot(p.vel.x, p.vel.y);
    expect(speed).toBeCloseTo(DASH_SPEED, 0);
    expect(p.vel.y).toBeLessThan(0);
  });

  it('空中只能冲刺一次，落地重置', () => {
    const p = new Player({ x: 0, y: 100 });
    p.update({ ...IDLE, dashPressed: true }, DT, GROUND);   // 空中第一次
    expect(p.justDashed).toBe(true);
    for (let i = 0; i < Math.ceil(DASH_TIME / DT) + 2; i++) p.update(IDLE, DT, GROUND);
    p.update({ ...IDLE, dashPressed: true }, DT, GROUND);   // 空中第二次
    expect(p.justDashed).toBe(false);
    // 落地
    for (let i = 0; i < 120; i++) p.update(IDLE, DT, GROUND);
    expect(p.onGround).toBe(true);
    expect(p.canDash).toBe(true);
  });

  it('refillDash 允许空中再次冲刺（水晶）', () => {
    const p = new Player({ x: 0, y: 0 });
    p.update({ ...IDLE, dashPressed: true }, DT, []);
    for (let i = 0; i < Math.ceil(DASH_TIME / DT) + 2; i++) p.update(IDLE, DT, []);
    p.refillDash();
    p.update({ ...IDLE, dashPressed: true }, DT, []);
    expect(p.justDashed).toBe(true);
  });

  it('冲刺期间不受重力（水平冲刺高度不变）', () => {
    const p = new Player({ x: 0, y: 100 });
    p.update({ ...IDLE, right: true, dashPressed: true }, DT, []);
    const y0 = p.pos.y;
    for (let i = 0; i < 5; i++) p.update({ ...IDLE, right: true }, DT, []);
    expect(p.pos.y).toBeCloseTo(y0, 0);
  });
});

describe('Player 评审修复：跨步落点与击碎宽限', () => {
  it('跨步先腾空再横越，落在平台顶而非穿到下方', () => {
    const plat: Rect = { x: 400, y: 300, w: 3000, h: 200 };
    const p = new Player({ x: 500, y: 300 - 28 }); // 站在平台上
    const startY = p.pos.y;
    p.stride();
    let peak = Infinity;
    for (let i = 0; i < Math.ceil(STRIDE_TIME / DT) + 60; i++) {
      p.update(IDLE, DT, [plat]);
      peak = Math.min(peak, p.pos.y);
    }
    expect(peak).toBeLessThan(startY - 40);          // 确实先腾空升高
    expect(p.striding).toBe(false);
    expect(p.pos.y).toBeCloseTo(plat.y - PLAYER_H, 0); // 最终落回平台顶
    expect(p.onGround).toBe(true);
  });

  it('冲刺结束后短暂保留击碎宽限，再消失', () => {
    const p = grounded();
    p.update({ ...IDLE, dashPressed: true }, DT, GROUND);
    expect(p.smashing).toBe(true);
    for (let i = 0; i < Math.ceil(DASH_TIME / DT) + 1; i++) p.update(IDLE, DT, GROUND);
    expect(p.dashing).toBe(false);
    expect(p.smashing).toBe(true); // 宽限内仍可击碎
    for (let i = 0; i < Math.ceil(0.12 / DT) + 2; i++) p.update(IDLE, DT, GROUND);
    expect(p.smashing).toBe(false);
  });
});

describe('弹回：错解的代价是时间，不是命', () => {
  const flat = [{ x: 0, y: 200, w: 2000, h: 32 }];
  const idle = {
    left: false, right: false, up: false, down: false,
    jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false,
  };

  it('弹回当帧结束冲刺、反向后退、并锁住冲刺', () => {
    const p = new Player({ x: 100, y: 172 });
    p.update({ ...idle, dashPressed: true, right: true }, 1 / 60, flat);
    expect(p.dashing, '前提：确实在冲刺').toBe(true);

    p.bounceOff(-1);
    expect(p.dashing, '冲刺必须当帧断掉').toBe(false);
    expect(p.smashing, '击碎宽限必须一并清零，否则弹回后仍能撞碎怪').toBe(false);
    expect(p.vel.x).toBe(-BOUNCE_SPEED);   // 传 -1 = 往左推
    expect(p.canDash).toBe(false);
  });

  it('弹回后落地不刷新冲刺——锁定期内按冲无效', () => {
    const p = new Player({ x: 100, y: 172 });
    p.bounceOff(-1);
    // 在地面上连推若干帧，仍处于锁定期
    for (let i = 0; i < 12; i++) p.update({ ...idle }, 1 / 60, flat);
    expect(p.onGround, '前提：已落地').toBe(true);
    expect(p.canDash, `锁定 ${DASH_LOCK}s 内不得因落地刷新`).toBe(false);

    p.update({ ...idle, dashPressed: true, right: true }, 1 / 60, flat);
    expect(p.dashing, '锁定期内按冲不该生效').toBe(false);
  });

  it('锁定到期后恢复正常冲刺', () => {
    const p = new Player({ x: 100, y: 172 });
    p.bounceOff(-1);
    for (let i = 0; i < 40; i++) p.update({ ...idle }, 1 / 60, flat); // > 0.5s
    expect(p.canDash).toBe(true);
    p.update({ ...idle, dashPressed: true, right: true }, 1 / 60, flat);
    expect(p.dashing).toBe(true);
  });

  it('弹回期间按住前进也拉不回来——否则弹回没有代价', () => {
    const p = new Player({ x: 100, y: 172 });
    p.bounceOff(-1);
    p.update({ ...idle, right: true }, 1 / 60, flat);
    expect(p.vel.x, '弹回窗口内水平输入不接管').toBeLessThan(0);
  });
});
