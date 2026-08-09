import { Player } from './player';
import { Level, type Pickup } from './level';
import { ChunkStream, mulberry32 } from './generator';
import { Darkness } from './darkness';
import { Score } from './score';
import { Enemies } from './enemies';
import { aabbOverlap } from './collision';
import type { InputState, Rect } from './types';
import { TILE, WORLD_H, VIEW_W, AIRTIME_BONUS_SEC, CHARGE_PER_MOTE, CHARGE_PER_KILL, STRIDE_KILL_BONUS, DYING_TIME, DEATH_FADE } from './constants';

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
  dyingT = 0; // 死亡定格回放的剩余秒数（见 DYING_TIME）

  /** 定格回放中：世界画面停在死亡那一刻，结算页尚未接管。 */
  get dying(): boolean { return this.dyingT > 0; }

  /**
   * 跳过回放——玩家已经看清了，别拦着他重开。
   * 但不能直接归零：那会从死亡现场一刀切到结算页，正是黑场要消除的突兀。
   * 留到 DEATH_FADE，让跳过的人也走完最后那次淡入。
   */
  skipDying() { this.dyingT = Math.min(this.dyingT, DEATH_FADE); }
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
  private kills = 0;

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
    this.dyingT = 0;
    this.hasJumped = this.hasDashed = false;
    this.kills = 0;
    this.nextMilestone = 0;
    this.narrationKey = null;
    this.narrationTimer = 0;
  }

  /** 叙事旁白：当前该显示的《山海经》碎片 key 及其淡入淡出透明度，无则 null。 */
  get narration(): { key: string; alpha: number } | null {
    // 回放期间也留着：死亡当口正念着的那句《山海经》被一刀掐掉，
    // 叙事就断在半截上；让它与死因并置，一局才收得住。
    if (this.state === 'dead' && this.dying && this.narrationKey && this.narrationTimer > 0) {
      return { key: this.narrationKey, alpha: 0.55 };
    }
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
    // 打怪最要紧、也最猜不着，故排在计分/冲刺之前，且放宽两处：
    //   · 提前一整屏预警（原来只提前 120px ≈ 半秒，怪已扑到脸上才出字）
    //   · 前三次击杀之内都讲（原来杀过一次就永不再提，可玩家往往到第二只
    //     怪才真需要它——第一只多半是撞死的）
    if (this.kills < 3 && this.enemies.list.some(e => e.alive && e.x > camL && e.x < camR + VIEW_W)) {
      return 'hint.kill';
    }
    // 记分教学：还没拾到日光时，早期提示拾光升倍率的作用
    if (this.score.motes === 0 && this.elapsed > 4 && this.elapsed < 13) return 'hint.score';
    if (!this.hasDashed && this.level.crystals.some(c => !c.taken && c.x > camL && c.x < camR)) {
      return 'hint.dash';
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
    this.dyingT = DYING_TIME; // 先定格回放，结算页稍后接管
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
    if (this.state !== 'playing') {
      // 死了也要继续走表：定格回放要靠它倒数，否则结算页永远不接管
      if (this.dyingT > 0) this.dyingT = Math.max(0, this.dyingT - dt);
      return;
    }

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

    this.enemies.ensure(this.cameraX + VIEW_W * 2, this.score.distanceM, this.level.solids, this.level.spikes);
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
        this.kills++;
      } else if (this.player.smashing) {
        // 冲刺（含刚结束的宽限）撞碎小怪
        e.alive = false;
        this.score.killBonus();
        this.charge = Math.min(1, this.charge + CHARGE_PER_KILL);
        this.justKilledEnemy = true;
        this.kills++;
      } else if (this.player.vel.y > 0 && this.player.pos.y + this.player.rect.h / 2 < e.y + e.h / 2) {
        // 踩踏/压死：下落中自上方踏中小怪 → 击杀并小幅回弹。
        //
        // 判据是「体心高过怪心」，不是「脚底在怪头 0.6 格之内」：后者对 walker
        // 只有 12px 的窗口，而下落最快 900px/s（每帧 15px），一帧就能从怪头上方
        // 直接跨到窗口以下——玩家明明是踩下去的，却判成撞死。体心判据把窗口放到
        // 24px（> 单帧位移），任何速度都不会漏踩，且侧面撞上时体心仍在怪心之下，
        // 该死的照样死。
        e.alive = false;
        this.score.killBonus();
        this.charge = Math.min(1, this.charge + CHARGE_PER_KILL);
        this.justKilledEnemy = true;
        this.kills++;
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
