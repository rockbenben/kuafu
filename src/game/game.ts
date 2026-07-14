import { Player } from './player';
import { Level, type Pickup } from './level';
import { ChunkStream, mulberry32 } from './generator';
import { Darkness } from './darkness';
import { Score } from './score';
import { Enemies } from './enemies';
import { aabbOverlap } from './collision';
import type { InputState, Rect } from './types';
import { TILE, WORLD_H, VIEW_W, AIRTIME_BONUS_SEC, CHARGE_PER_MOTE, CHARGE_PER_KILL, STRIDE_KILL_BONUS } from './constants';

const SPAWN = { x: 64, y: 13 * TILE - 28 }; // 平地块地面行 14 之上
const PICKUP_R = 24;

export interface RunStats { score: number; distanceM: number; durationMs: number }

export class Game {
  state: 'title' | 'playing' | 'dead' = 'title';
  player!: Player;
  level!: Level;
  darkness!: Darkness;
  score!: Score;
  enemies!: Enemies;
  elapsed = 0;
  deathCause: 'spike' | 'fall' | 'darkness' | 'enemy' | null = null;
  runStats: RunStats | null = null;
  endingSeed = 0; // 死亡时随机，渲染层据此选一张结局图

  justCollectedMote = false;
  justCollectedCrystal = false;
  justDied = false;
  justKilledEnemy = false;
  justStrided = false;
  charge = 0; // 大招神力 0~1

  get chargeReady(): boolean { return this.charge >= 1; }

  private airtime = 0;
  // 新手引导：记录首次动作是否完成，用于情境提示
  private hasJumped = false;
  private hasDashed = false;
  private hasKilled = false;

  // 夸父逐日：随距离推进的叙事碎片（key 交由 UI 按简繁解析）
  // 0~2000 为《山海经·海外北经》主脉；此后为《大荒北经》《列子》陶潜等古籍
  // 更深的记载，随远行渐次揭示（既补故事，也作长程之奖）
  private static MILESTONES: { m: number; key: string }[] = [
    { m: 0, key: 'nar.0' },
    { m: 250, key: 'nar.1' },
    { m: 550, key: 'nar.2' },
    { m: 900, key: 'nar.3' },
    { m: 1400, key: 'nar.4' },
    { m: 2000, key: 'nar.5' },
    { m: 2600, key: 'nar.6' },
    { m: 3300, key: 'nar.7' },
    { m: 4100, key: 'nar.8' },
    { m: 5000, key: 'nar.9' },
    { m: 6000, key: 'nar.10' },
    { m: 7200, key: 'nar.11' },
  ];
  private nextMilestone = 0;
  private narrationKey: string | null = null;
  private narrationTimer = 0;
  private static NARRATION_DUR = 6.5;

  mode: 'endless' | 'daily' = 'endless';
  private dailySeedVal = 0;
  private dailyDate = '';

  constructor(private seed: number = Date.now() % 2 ** 31) {
    this.reset();
  }

  /** 设定今日挑战的种子与日期（全球同日同关卡）；由主程按 UTC 日期注入。 */
  setDaily(seed: number, date: string) {
    this.dailySeedVal = seed;
    this.dailyDate = date;
  }

  /** 切换模式（常规无尽 / 今日挑战）。 */
  setMode(m: 'endless' | 'daily') {
    this.mode = m;
  }

  /** 当前榜单键：今日挑战按 UTC 日分独立成榜，与常规榜互不相扰。 */
  get boardKey(): string {
    return this.mode === 'daily' ? `daily:${this.dailyDate}` : 'endless';
  }

  private reset() {
    // 今日挑战：固定当日种子，每次重来同一关卡；常规：逐局递增（近似随机）
    const seed = this.mode === 'daily' ? this.dailySeedVal : this.seed++;
    this.player = new Player({ ...SPAWN });
    this.level = new Level(new ChunkStream(mulberry32(seed)));
    this.darkness = new Darkness();
    this.score = new Score();
    this.enemies = new Enemies(mulberry32(seed * 7 + 1));
    this.elapsed = 0;
    this.airtime = 0;
    this.charge = 0;
    this.deathCause = null;
    this.hasJumped = this.hasDashed = this.hasKilled = false;
    this.nextMilestone = 0;
    this.narrationKey = null;
    this.narrationTimer = 0;
  }

  /** 叙事旁白：当前该显示的《山海经》碎片 key 及其淡入淡出透明度，无则 null。 */
  get narration(): { key: string; alpha: number } | null {
    if (this.state !== 'playing' || !this.narrationKey || this.narrationTimer <= 0) return null;
    const age = Game.NARRATION_DUR - this.narrationTimer;
    const alpha = Math.max(0, Math.min(1, age / 0.6, this.narrationTimer / 1.6));
    return { key: this.narrationKey, alpha };
  }

  /** 新手情境提示：按进度/首次动作返回当前该显示的提示 key，无则 null。 */
  get hint(): string | null {
    if (this.state !== 'playing') return null;
    const camL = this.cameraX, camR = camL + VIEW_W;
    if (this.elapsed < 3.2) return 'hint.run';
    if (!this.hasJumped && this.elapsed < 10) return 'hint.jump';
    // 记分教学：还没拾到日光时，早期提示拾光升倍率的作用
    if (this.score.motes === 0 && this.elapsed > 4 && this.elapsed < 13) return 'hint.score';
    if (!this.hasDashed && this.level.crystals.some(c => !c.taken && c.x > camL && c.x < camR)) {
      return 'hint.dash';
    }
    if (!this.hasKilled && this.enemies.list.some(e => e.alive && e.x > camL && e.x < camR + 120)) {
      return 'hint.kill';
    }
    return null;
  }

  start() {
    this.reset();
    this.state = 'playing';
  }

  get cameraX(): number {
    return Math.max(0, this.player.pos.x - VIEW_W * 0.35);
  }

  private touching(p: Pickup): boolean {
    const c = { x: this.player.pos.x + this.player.rect.w / 2, y: this.player.pos.y + this.player.rect.h / 2 };
    return Math.hypot(p.x - c.x, p.y - c.y) <= PICKUP_R;
  }

  private die(cause: 'spike' | 'fall' | 'darkness' | 'enemy') {
    this.state = 'dead';
    this.deathCause = cause;
    this.justDied = true;
    this.endingSeed = Math.floor(Math.random() * 997);
    this.runStats = {
      score: this.score.total,
      distanceM: Math.floor(this.score.distanceM),
      durationMs: Math.round(this.elapsed * 1000),
    };
  }

  update(input: InputState, dt: number) {
    this.justCollectedMote = this.justCollectedCrystal = this.justDied = this.justKilledEnemy = this.justStrided = false;
    if (this.state !== 'playing') return;

    this.elapsed += dt;
    this.level.ensure(this.cameraX + VIEW_W * 2, this.score.distanceM);
    this.level.prune(this.darkness.x - 200);

    // 大招·夸父跨步：神力满且未在跨步时发动
    if (input.ultimatePressed && this.chargeReady && !this.player.striding) {
      this.player.stride();
      this.charge = 0;
      this.justStrided = true;
    }

    this.player.update(input, dt, this.level.solids);
    if (this.player.justJumped) this.hasJumped = true;
    if (this.player.justDashed) this.hasDashed = true;

    this.enemies.ensure(this.cameraX + VIEW_W * 2, this.score.distanceM, this.level.solids);
    this.enemies.update(dt, this.level.solids);
    this.enemies.prune(this.darkness.x - 200);

    // 拾取
    for (const m of this.level.motes) {
      if (!m.taken && this.touching(m)) {
        m.taken = true;
        this.score.collectMote();
        this.charge = Math.min(1, this.charge + CHARGE_PER_MOTE);
        this.justCollectedMote = true;
      }
    }
    for (const c of this.level.crystals) {
      if (!c.taken && this.touching(c)) {
        c.taken = true;
        this.player.refillDash();
        this.justCollectedCrystal = true;
      }
    }

    // 小怪碰撞：冲刺/跨步撞碎，否则死亡
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      if (!aabbOverlap(this.player.rect, e)) continue;
      if (this.player.invincible) {
        // 跨步中 / 跨步后无敌窗口：撞碎小怪
        e.alive = false;
        this.score.bonus += STRIDE_KILL_BONUS;
        this.justKilledEnemy = true;
        this.hasKilled = true;
      } else if (this.player.smashing) {
        // 冲刺（含刚结束的宽限）撞碎小怪
        e.alive = false;
        this.score.killBonus();
        this.charge = Math.min(1, this.charge + CHARGE_PER_KILL);
        this.justKilledEnemy = true;
        this.hasKilled = true;
      } else if (this.player.vel.y > 0 && this.player.pos.y + this.player.rect.h < e.y + e.h * 0.6) {
        // 踩踏/压死：下落中自上方踏中小怪 → 击杀并小幅回弹
        e.alive = false;
        this.score.killBonus();
        this.charge = Math.min(1, this.charge + CHARGE_PER_KILL);
        this.justKilledEnemy = true;
        this.hasKilled = true;
        this.player.stompBounce();
      } else {
        return this.die('enemy');
      }
    }

    // 滞空风格加分（跨步为无敌平飞，不计滞空、并清零，避免白送/误清风格分）
    if (this.player.striding) {
      this.airtime = 0;
    } else if (this.player.onGround) {
      if (this.airtime >= AIRTIME_BONUS_SEC) this.score.styleBonus();
      this.airtime = 0;
    } else {
      this.airtime += dt;
    }

    this.darkness.update(dt, this.elapsed, this.player.pos.x);
    this.score.updateDistance(this.player.pos.x);

    // 叙事里程碑：越过距离阈值即浮现对应《山海经》碎片
    if (this.narrationTimer > 0) this.narrationTimer -= dt;
    while (this.nextMilestone < Game.MILESTONES.length &&
           this.score.distanceM >= Game.MILESTONES[this.nextMilestone].m) {
      this.narrationKey = Game.MILESTONES[this.nextMilestone].key;
      this.narrationTimer = Game.NARRATION_DUR;
      this.nextMilestone++;
    }

    // 死亡判定：无敌期间免尖刺；跨步平飞期间免坠落；黑暗始终生效
    const pr: Rect = this.player.rect;
    if (!this.player.invincible && this.level.spikes.some(s => aabbOverlap(pr, s))) return this.die('spike');
    if (!this.player.striding && this.player.pos.y > WORLD_H + 64) return this.die('fall');
    if (this.darkness.caught(this.player.pos.x + pr.w)) return this.die('darkness');
  }
}
