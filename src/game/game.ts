import { Player } from './player';
import { Level, type Pickup } from './level';
import { ChunkStream, mulberry32 } from './generator';
import { Darkness } from './darkness';
import { Score } from './score';
import { Enemies, SPAWN_TERRAIN_MARGIN } from './enemies';
import { aabbOverlap } from './collision';
import { resolveHit } from './combat';
import { Combo } from './combo';
import { Corpses } from './corpses';
import type { InputState, Rect } from './types';
import { TILE, WORLD_H, VIEW_W, AIRTIME_BONUS_SEC, CHARGE_PER_MOTE, CHARGE_PER_KILL, STRIDE_KILL_BONUS, BACKSTAB_BONUS, DYING_TIME, DEATH_FADE, NEW_KIND_HINT_SEC } from './constants';

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
  justBounced = false;
  justBackstabbed = false;
  /**
   * 最近一次击杀实际加的分（背刺/跨步/普通三选一）。飘字直接显示它，避免
   * 调用方各自猜一套。不逐帧清零——没有击杀的帧里它是上一次击杀的残留值，
   * 必须跟 `justKilledEnemy`（或 `justBackstabbed`）一起读，单读这个字段
   * 判断不出"这一帧有没有发生击杀"。
   *
   * 且只报**最近一次**：一帧内两具飞尸各撞死一只（连锁分支），score.bonus
   * 会加两笔，这里却只留得下最后一笔——飘字一帧只能画一个数，这是结构限制，
   * 不是漏加，别指望从这个字段反推出整帧的总加分。
   */
  lastKillBonus = 0;
  combo = new Combo();
  corpses = new Corpses();
  charge = 0; // 大招神力 0~1

  get chargeReady(): boolean { return this.charge >= 1; }

  private airtime = 0;
  // 新手引导：记录首次动作是否完成，用于情境提示
  private hasJumped = false;
  private hasDashed = false;
  private kills = 0;

  /** 已经教过的敌人种类——每种只讲一次，讲完不再占视线。 */
  private taught = new Set<string>();
  private newKindHint: string | null = null;
  private newKindHintT = 0;

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
  /**
   * 已经读到第几段。由主程从存档注入、每局结束再写回，故**不在 reset() 里清零**。
   *
   * 十二段铺到 7200 步而中位一局只有 246 步，一局也塞不下（12 × 6.5s ≈ 78s）。
   * 所以里程碑只决定「什么时候念下一句」，念哪一句由这里定：没读完之前每一局都
   * 从上次断的地方接着讲，读完之后回到按里程播放（长局里各句仍落在该落的地方）。
   */
  seenNar = 0;
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
    this.combo.reset();
    this.corpses.clear();
    this.deathCause = null;
    this.dyingT = 0;
    this.hasJumped = this.hasDashed = false;
    this.kills = 0;
    this.taught.clear();
    this.newKindHint = null;
    this.newKindHintT = 0;
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
    // 新敌人首见提示优先级最高。首要理由是教学优先级：屏上已经有一只你不会打的
    // 敌人、而这条提示只挂 NEW_KIND_HINT_SEC 秒，比「按住右键奔跑」紧急得多。
    //
    // 其次是真的会撞车。盾的闸门是 UNLOCK_M.shield=120 步（3840px），正常速度约
    // 14.8 秒抵达——离 hint.jump 的 10 秒窗口只差不到 5 秒；而隐藏秘籍「夸父不竭」
    // （main.ts，连按三下「下」开启神力无限）连续跨步可把速度推到约 1418px/s，
    // 3840px 不到 3 秒就到，必然落在窗口里，且那条路径上玩家从没按过普通跳跃、
    // hasJumped 恒为 false，hint.jump 会把新敌人提示整个吞掉。
    // 调这两个闸门时记得回来重算这段。
    // 更根本的理由和这条秘籍无关：屏上已经站着一只你不知道怎么打的敌人，
    // 这条提示又是限时的（NEW_KIND_HINT_SEC 秒后自动收起），这件事本就比
    // 「按住方向键奔跑」更该优先说——顺序对，不必等一个隐藏路径来验证才成立。
    if (this.newKindHint) return this.newKindHint;
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
    this.justCollectedMote = this.justCollectedCrystal = this.justDied = this.justKilledEnemy = this.justStrided = this.justBounced = this.justBackstabbed = false;
    if (this.state !== 'playing') {
      // 死了也要继续走表：定格回放要靠它倒数，否则结算页永远不接管
      if (this.dyingT > 0) this.dyingT = Math.max(0, this.dyingT - dt);
      return;
    }

    this.elapsed += dt;
    this.combo.update(dt);
    // 地形要比敌人生成边缘多铺一段：reachable() 要探到那儿，见 SPAWN_TERRAIN_MARGIN
    this.level.ensure(this.cameraX + VIEW_W * 2 + SPAWN_TERRAIN_MARGIN);
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

    this.enemies.ensure(this.cameraX + VIEW_W * 2, this.level.solids, this.level.spikes);
    const pc = this.player.pos.x + this.player.rect.w / 2;
    const pcy = this.player.pos.y + this.player.rect.h / 2;
    this.enemies.update(dt, this.level.solids, pc, pcy);
    this.enemies.prune(this.darkness.x - 200);

    // 新敌人首见即教：进屏就讲，每种只讲一次
    if (!this.newKindHint) {
      const hl = this.cameraX, hr = hl + VIEW_W;
      for (const kind of ['shield'] as const) {
        if (this.taught.has(kind)) continue;
        if (this.enemies.list.some(e => e.alive && e.kind === kind && e.x > hl && e.x < hr)) {
          this.taught.add(kind);
          this.newKindHint = `hint.${kind}`;
          this.newKindHintT = NEW_KIND_HINT_SEC;
          break;
        }
      }
    } else {
      this.newKindHintT -= dt;
      if (this.newKindHintT <= 0) this.newKindHint = null;
    }

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

    // 小怪碰撞：走击杀矩阵（combat.ts）——冲/踩/跨不再是三个同义词
    const pcx = this.player.pos.x + this.player.rect.w / 2;
    // 击杀方式必须用**进循环前**的玩家状态判定。stompBounce() 会在循环中途把
    // vel.y 翻成负数，而后面的迭代还要靠 vel.y > 0 认踩踏——同帧重叠的第二只怪
    // 于是落到 method === null，一次干净的踩踏当场把玩家判死。警觉追击会把整个
    // 列阵对准玩家的 x 挤成一列，所以这不是罕见情形。
    const wasFalling = this.player.vel.y > 0;
    const playerCy = this.player.pos.y + this.player.rect.h / 2;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      if (!aabbOverlap(this.player.rect, e)) continue;

      const method = this.player.invincible ? 'stride'
        : this.player.smashing ? 'dash'
        : (wasFalling && playerCy < e.y + e.h / 2) ? 'stomp'
        : null;
      // 踩踏判据用「体心高过怪心」而非「脚底在怪头附近」：后者对 walker 只有 12px
      // 的窗口，而下落最快 900px/s（每帧 15px），一帧就能跨过去，玩家明明踩下去了
      // 却判成撞死。体心判据把窗口放到 24px，任何速度都不漏踩。
      // 弹回窗口内不吃接触伤害。没有这一条，「弹回不致死」是空话：撞盾当帧被弹开
      // 后人仍与盾重叠，而 bounceOff 已经清掉 smashing——下一帧 method 就是 null，
      // 直接判死。列阵里更糟：同一帧的第二只怪立刻补刀。
      if (method === null) {
        if (this.player.bouncing) continue;
        return this.die('enemy');
      }

      const outcome = resolveHit(e, method, pcx);
      if (outcome === 'bounce') {
        // 方向按玩家在盾的哪一侧给，不能写死：站在盾右侧被推向左等于被推进盾里
        this.player.bounceOff(pcx < e.x + e.w / 2 ? -1 : 1);
        this.justBounced = true;
        continue;                       // 怪不受伤，玩家不受伤，只丢时间
      }

      e.alive = false;
      // 冲刺/跨步把尸首打飞；踩踏是向下压碎，没有飞尸
      // 只有冲刺打飞尸首。踩踏是向下压碎；跨步本就一步撞碎一串，再让它的飞尸
      // 去走连杀分支，等于绕过正上方「跨步不进连杀，否则刷爆分数」那条规则。
      if (method === 'dash') this.corpses.spawn(e, this.player.facing, 0);
      this.kills++;
      this.justKilledEnemy = true;
      if (outcome === 'backstab') {
        this.score.bonus += BACKSTAB_BONUS;
        this.lastKillBonus = BACKSTAB_BONUS;
        this.justBackstabbed = true;
      } else if (this.player.striding) {
        // 只有真正横越的那 0.66s 算跨步击杀。落地后 STRIDE_INVULN 的 3 秒里玩家
        // 是在正常奔跑、用自己的判定框一只只打，那 3 秒按普通击杀记分——否则既
        // 不进连杀也不充神力，分还比平时少，等于惩罚刚放完大招的人。
        this.score.bonus += STRIDE_KILL_BONUS;
        this.lastKillBonus = STRIDE_KILL_BONUS;
      } else {
        // 背刺与跨步走各自的固定加分，不进连杀——跨步一步撞碎一串，
        // 让它也吃连杀倍率会直接刷爆分数。普通击杀才计入连杀窗口。
        this.combo.hit();
        this.score.bonus += this.combo.bonus;
        this.lastKillBonus = this.combo.bonus;
      }
      if (!this.player.striding) this.charge = Math.min(1, this.charge + CHARGE_PER_KILL);
      if (method === 'stomp') this.player.stompBounce();
    }

    // 飞尸连锁：再生下一层飞尸由 Corpses 自己完成（它才知道撞死者是哪一具、朝
    // 哪飞、在第几层）；这里只管记分。
    for (const { backstab } of this.corpses.update(dt, this.enemies.list)) {
      this.kills++;
      this.justKilledEnemy = true;
      if (backstab) {
        // 飞尸从背后撞死盾同样是一次成立的背刺，直击给 60 分它给 30 分说不通
        this.score.bonus += BACKSTAB_BONUS;
        this.lastKillBonus = BACKSTAB_BONUS;
        this.justBackstabbed = true;
      } else {
        this.combo.hit();
        this.score.bonus += this.combo.bonus;
        this.lastKillBonus = this.combo.bonus; // 飘字读这个字段（main.ts），漏了连锁帧会飘出上一次直击的旧值
      }
      this.charge = Math.min(1, this.charge + CHARGE_PER_KILL); // 连锁也该充神力，否则连得越顺大招攒得越慢
    }
    this.corpses.prune(this.darkness.x - 200);

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
      const all = Game.MILESTONES.length;
      const i = this.seenNar < all ? this.seenNar : this.nextMilestone;
      this.narrationKey = Game.MILESTONES[i].key;
      this.narrationTimer = Game.NARRATION_DUR;
      if (this.seenNar < all) this.seenNar++;
      this.nextMilestone++;
    }

    // 死亡判定：无敌期间免尖刺；跨步平飞期间免坠落；黑暗始终生效
    const pr: Rect = this.player.rect;
    if (!this.player.invincible && this.level.spikes.some(s => aabbOverlap(pr, s))) return this.die('spike');
    if (!this.player.striding && this.player.pos.y > WORLD_H + 64) return this.die('fall');
    if (this.darkness.caught(this.player.pos.x + pr.w)) return this.die('darkness');
  }
}
