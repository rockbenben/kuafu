import { describe, it, expect } from 'vitest';
import { Game } from '../src/game/game';
import { dailySeed } from '../src/game/generator';
import { DT, KILL_BONUS } from '../src/game/constants';
import type { InputState } from '../src/game/types';
import type { Enemy } from '../src/game/enemies';

const IDLE: InputState = {
  left: false, right: false, up: false, down: false,
  jumpHeld: false, jumpPressed: false, dashPressed: false, ultimatePressed: false,
};

describe('Game', () => {
  it('初始为 title，start 后 playing', () => {
    const g = new Game(1);
    expect(g.state).toBe('title');
    g.start();
    expect(g.state).toBe('playing');
  });

  it('今日挑战：同日种子每局关卡一致，常规模式逐局不同', () => {
    const layout = (g: Game) => {
      g.start();
      for (let i = 0; i < 120; i++) g.update({ ...IDLE, right: true }, DT);
      return g.level.solids.map(s => `${s.x},${s.y},${s.w},${s.h}`).join('|');
    };
    const g = new Game(1000);
    g.setDaily(dailySeed('2026-07-13'), '2026-07-13');
    g.setMode('daily');
    expect(g.boardKey).toBe('daily:2026-07-13');
    const a = layout(g), b = layout(g);
    expect(b).toBe(a); // 今日挑战：重来同一关卡

    g.setMode('endless');
    expect(g.boardKey).toBe('endless');
    const c = layout(g), d = layout(g);
    expect(d).not.toBe(c); // 常规：逐局递增种子，地形不同
  });

  it('title 状态下 update 不推进', () => {
    const g = new Game(1);
    const x = g.player.pos.x;
    g.update({ ...IDLE, right: true }, DT);
    expect(g.player.pos.x).toBe(x);
  });

  it('向右跑距离增加、相机跟随', () => {
    const g = new Game(1);
    g.start();
    for (let i = 0; i < 180; i++) g.update({ ...IDLE, right: true }, DT);
    expect(g.score.distanceM).toBeGreaterThan(3);
    expect(g.cameraX).toBeGreaterThanOrEqual(0);
  });

  it('站着不动最终被黑暗吞噬且记录 runStats', () => {
    const g = new Game(1);
    g.start();
    let steps = 0;
    while (g.state === 'playing' && steps < 60 * 60) { // 最多模拟 60 秒
      g.update(IDLE, DT);
      steps++;
    }
    expect(g.state).toBe('dead');
    expect(g.deathCause).toBe('darkness');
    expect(g.runStats).not.toBeNull();
    expect(g.runStats!.durationMs).toBeGreaterThan(0);
  });

  it('死亡后 start 完全重置', () => {
    const g = new Game(1);
    g.start();
    for (let i = 0; i < 60 * 60 && g.state === 'playing'; i++) g.update(IDLE, DT);
    expect(g.state).toBe('dead');
    g.start();
    expect(g.state).toBe('playing');
    expect(g.score.total).toBe(0);
    expect(g.elapsed).toBe(0);
    expect(g.darkness.x).toBeLessThan(0);
  });

  it('拾取光点计分且光点标记 taken', () => {
    const g = new Game(1);
    g.start();
    // 直接把一个光点放到玩家脸上
    g.level.motes.push({ x: g.player.pos.x + 10, y: g.player.pos.y + 10, taken: false });
    g.update(IDLE, DT);
    expect(g.score.motes).toBe(1);
    expect(g.justCollectedMote).toBe(true);
  });

  function enemyOnPlayer(g: Game): Enemy {
    const x = g.player.pos.x;
    return {
      kind: 'walker',
      x, y: g.player.pos.y, w: 24, h: 20,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: x - 50, maxX: x + 50,
    };
  }

  it('非冲刺状态撞上敌人致死，deathCause 为 enemy', () => {
    const g = new Game(1);
    g.start();
    g.enemies.list.push(enemyOnPlayer(g));
    g.update(IDLE, DT);
    expect(g.state).toBe('dead');
    expect(g.deathCause).toBe('enemy');
  });

  it('冲刺状态撞上敌人将其击杀：敌人死亡、加分、玩家存活', () => {
    const g = new Game(1);
    g.start();
    g.update({ ...IDLE, dashPressed: true, right: true }, DT); // 触发冲刺
    expect(g.player.dashing).toBe(true);
    g.enemies.list.push(enemyOnPlayer(g));
    const bonusBefore = g.score.bonus;
    g.update(IDLE, DT); // 冲刺中撞上敌人
    expect(g.state).toBe('playing');
    expect(g.enemies.list[0].alive).toBe(false);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.score.bonus).toBe(bonusBefore + KILL_BONUS);
  });

  it('下落自上方踩踏敌人也算击杀：敌死、加分、回弹、玩家存活', () => {
    const g = new Game(1);
    g.start();
    // 高空下落，脚下正对小怪
    g.player.pos.y = 120;
    g.player.vel.y = 150;
    g.player.onGround = false;
    const px = g.player.pos.x;
    g.enemies.list.push({
      kind: 'walker', x: px, y: 142, w: 24, h: 28,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: px - 50, maxX: px + 50,
    } as Enemy);
    const bonusBefore = g.score.bonus;
    g.update(IDLE, DT);
    expect(g.state).toBe('playing');
    expect(g.enemies.list.every(e => !e.alive)).toBe(true);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.score.bonus).toBe(bonusBefore + KILL_BONUS);
    expect(g.player.vel.y).toBeLessThan(0); // 击杀后向上回弹
  });
});

describe('Game 大招·夸父跨步', () => {
  it('拾日光充能，满则可发动跨步并清空神力', () => {
    const g = new Game(1);
    g.start();
    // 塞入大量日光到玩家身上，一帧全部拾取充满
    for (let i = 0; i < 20; i++) {
      g.level.motes.push({ x: g.player.pos.x + 10, y: g.player.pos.y + 10, taken: false });
    }
    g.update(IDLE, DT);
    expect(g.chargeReady).toBe(true);
    g.update({ ...IDLE, ultimatePressed: true }, DT);
    expect(g.player.striding).toBe(true);
    expect(g.justStrided).toBe(true);
    expect(g.charge).toBe(0);
  });

  it('神力未满时按大招无效', () => {
    const g = new Game(1);
    g.start();
    g.charge = 0.5;
    g.update({ ...IDLE, ultimatePressed: true }, DT);
    expect(g.player.striding).toBe(false);
    expect(g.charge).toBe(0.5);
  });

  it('跨步无敌：穿越尖刺不死', () => {
    const g = new Game(1);
    g.start();
    g.charge = 1;
    g.level.spikes.push({ x: g.player.pos.x + 40, y: g.player.pos.y, w: 32, h: 16 });
    g.update({ ...IDLE, ultimatePressed: true }, DT); // 发动跨步
    expect(g.player.striding).toBe(true);
    for (let i = 0; i < 6; i++) g.update(IDLE, DT); // 掠过尖刺
    expect(g.state).toBe('playing');
  });

  it('跨步撞碎沿途小怪', () => {
    const g = new Game(1);
    g.start();
    g.charge = 1;
    g.update({ ...IDLE, ultimatePressed: true }, DT); // striding
    // 在玩家前方铺一个宽敌人，确保推进时重叠（宽巡逻界防止被夹到边界）
    g.enemies.list.push({
      kind: 'walker', x: g.player.pos.x, y: g.player.pos.y, w: 60, h: 20,
      dir: 1, baseY: 0, phase: 0, alive: true, minX: 0, maxX: 100000,
    } as Enemy);
    g.update(IDLE, DT);
    expect(g.justKilledEnemy).toBe(true);
    expect(g.enemies.list.every(e => e.alive)).toBe(false);
  });
});

describe('Game 跨步后无敌', () => {
  it('跨步结束后短暂无敌：免尖刺', () => {
    const g = new Game(1);
    g.start();
    g.charge = 1;
    g.update({ ...IDLE, ultimatePressed: true }, DT); // 发动
    // 推进到跨步结束（进入落地无敌窗口）
    for (let i = 0; i < 60; i++) g.update(IDLE, DT);
    expect(g.player.striding).toBe(false);
    expect(g.player.invincible).toBe(true); // 仍在无敌窗口
    // 脚下塞尖刺，无敌期间不死
    g.level.spikes.push({ x: g.player.pos.x, y: g.player.pos.y, w: 32, h: 20 });
    g.update(IDLE, DT);
    expect(g.state).toBe('playing');
  });
});
