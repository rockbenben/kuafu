import type { Rect } from './types';
import { aabbOverlap } from './collision';
import { TILE, UNLOCK_M, JUMP_APEX, PX_PER_METER } from './constants';
import { makeEnemy, isGroundKind, updateEnemy, FLYER_SWING, type Enemy, type EnemyKind } from './enemy-kinds';

// 再导出：既有的 `import type { Enemy } from './enemies'`（测试与 renderer 都在用）
// 保持可用，无需全库改 import 路径。
export { makeEnemy, isGroundKind };
export type { Enemy, EnemyKind } from './enemy-kinds';

export const NO_SPAWN_UNTIL_M = 30; // 仅前 30 步无怪（学会奔跑），此后即稀疏现怪
const SPAWN_START_X = 1200;
const WALKER_W = 24;
const WALKER_H = 20;
const FLYER_W = 26;
const FLYER_H = 18;
const PLATFORM_MIN_Y = 4 * TILE;
const PLATFORM_MAX_Y = 17 * TILE;
const PLATFORM_MIN_W = 4 * TILE;
const FLYER_MIN_Y = 6 * TILE;
const FLYER_MAX_Y = 12 * TILE;
// flyer 基线被地形挡住时，按此顺序就近让位（不额外消耗 rng，保持种子可复现）
const FLYER_NUDGE = [-TILE, TILE, -2 * TILE, 2 * TILE, -3 * TILE, 3 * TILE, -4 * TILE, 4 * TILE];

/** 装甲敌人只能靠踩踏解，故头顶必须留得下一次跳跃。3 格是实测的最小可踩净空。 */
const ARMOR_HEADROOM = 3 * TILE;
/** 横向跳跃包络（格）。DEVELOPMENT.md 记的纯跳跃跨距是 6.13 格，取整为 6。 */
const JUMP_REACH_TILES = 6;
/** 找连续面两端时最多走多少格。见 reachable() 里的说明。 */
const RUN_WALK_MAX = 24;
/**
 * 生成敌人之前，地形必须比敌人生成边缘再多铺这么远。
 *
 * reachable() 会向两侧探到 RUN_WALK_MAX + JUMP_REACH_TILES 格之外；若那一带地形
 * 还没生成，判定结果就取决于「地形恰好铺到哪」，而那个边缘随玩家跑法浮动——
 * 同一个种子于是长出不同的关卡。留足余量，判定才是 (种子, 位置) 的纯函数。
 */
export const SPAWN_TERRAIN_MARGIN = (RUN_WALK_MAX + JUMP_REACH_TILES) * TILE;

/**
 * [minX, maxX] 巡逻区间内，沿途每一步是否都有 ARMOR_HEADROOM 的净空。
 *
 * 早先只查生成点这一个横坐标——但装甲敌人冲不死也躲不过尖刺，只能靠踩，一旦
 * 巡逻到区间中段某处悬垂（生成点本身开阔，悬垂在别处）就成了无解路障。这里
 * 按 TILE 步长把整条巡逻带扫一遍，任意一点不够 3 格净空就整体判定不合格。
 * 不查 rng，纯几何判断，不影响种子可复现性。
 */
function headroom(minX: number, maxX: number, w: number, top: number, solids: Rect[]): boolean {
  const clearAt = (x: number) => {
    const box: Rect = { x, y: top - ARMOR_HEADROOM, w, h: ARMOR_HEADROOM };
    return !solids.some(s => aabbOverlap(box, s));
  };
  for (let x = minX; x < maxX; x += TILE) {
    if (!clearAt(x)) return false;
  }
  return clearAt(maxX); // maxX 本身未必落在 TILE 步长上，补查区间右端点
}

// 早期间距大（稀疏现怪），随路程渐密：约 900px→280px（约 1200 步触底）
/** 相邻敌人的名义间距（px）。`COMBO_WINDOW` 的取值由它推导，改这里先看那条注释。 */
export function interval(distanceM: number): number {
  return Math.max(280, 900 - distanceM * 0.5);
}

export class Enemies {
  list: Enemy[] = [];
  private nextSpawnX = SPAWN_START_X;

  constructor(private rng: () => number) {}

  /** 与 Level.ensure 同理：难度只由生成点自己的位置决定，不看玩家跑到哪。 */
  ensure(rightEdgeX: number, solids: Rect[], spikes: Rect[] = []): void {
    while (this.nextSpawnX < rightEdgeX) {
      const x = this.nextSpawnX;
      const distanceM = x / PX_PER_METER;
      if (distanceM >= NO_SPAWN_UNTIL_M) {
        // rng 恒取一次，与是否成阵无关——取数次数一变，同种子的关卡就错位了
        const formRoll = this.rng();
        // 列阵只在有落脚地时成群。spawnAt 是按「这个 x 有没有地」决定出地面怪
        // 还是飞怪的，而列阵一次连放 4 个点——碰上坑或窄地形整队就全变飞怪，
        // 在空中排成一堵墙拦住去路。那不是难度，是没法打（实机反馈）。
        if (distanceM >= UNLOCK_M.formation && formRoll < 0.18 && this.standing(x, solids, spikes)) {
          // 列阵：3~4 只挤在约 300px 内，并把下一次生成推远，总压力基本持平
          const n = 3 + Math.floor(this.rng() * 2);
          for (let i = 0; i < n; i++) this.spawnAt(x + i * 90, solids, spikes, true);
          this.nextSpawnX = x + 300 + interval(distanceM) * 1.6;
          continue;
        }
        this.spawnAt(x, solids, spikes);
      }
      this.nextSpawnX += interval(distanceM) * (0.75 + this.rng() * 0.5);
    }
  }

  /**
   * 求 x 处可供 walker 落脚的「露天地面」：地表格上方既无尖刺也无实体。
   *
   * 只取最高实体是不够的——刺行（'^'）不是实体，所以刺底下那层地面会被当成
   * 地表，小怪就被埋进地形里（玩家进不去，自然也不该有怪）。这里逐格向两侧
   * 扩张出一段真正露天的巡逻区间，够宽才认。
   */
  /**
   * 这块落脚面，玩家够得着吗？
   *
   * `standing()` 取的是「上方一格为空」的最高实体，而**隧道的顶板正好也满足**——
   * level.ts 的 parseChunk 按行生成 1 格高的 Rect、从不纵向合并，于是
   * ceiling-squeeze-3 与 spike-tunnel-4 那块悬空石板上方是天，被当成了地面。
   * 平跳只能升 93px，那块板离地 96px，差 3px 上不去。站上去的怪打不着、也威胁不到
   * 人，白占一个生成额度；盾旱魃还会在那儿画一块亮石板，明晃晃浮在天上。
   *
   * 判据两条，任一成立即可达：从正下方跳得上来，或者横向一跳之内有等高的面。
   * 两条都踩过坑，写清楚免得再犯：
   *
   * - **「正下方」必须跳过这一摞连续的实体**。按行切的 Rect 让一块两格厚的石板
   *   变成上下两个 Rect，取「最近的下方实体」会取到它自己的下半层，落差 32px
   *   稳过 JUMP_APEX——隧道顶板这一整类因此根本没被拦住（实测仍有 100/892 漏网）。
   * - **横向探针要按跳跃的水平包络来，不是一格**。本仓库的坑距按 6.13 格设计，
   *   只探出一格会把「隔着 3 格的同高台」判成孤岛，实测误伤 4.2% 的合法落脚点，
   *   那些高台从此只剩金乌盘旋、再不会站一只旱魃。
   */
  private reachable(top: number, cx: number, solids: Rect[]): boolean {
    // 先跳过与本面连成一摞的实体，再找真正的下一层
    let stackBottom = top;
    for (let guard = 0; guard < 32; guard++) {
      const next = solids.find(s => cx >= s.x && cx < s.x + s.w
        && s.y > stackBottom && s.y <= stackBottom + TILE + 1);
      if (!next) break;
      stackBottom = next.y;
    }
    let below = Infinity;
    for (const s of solids) {
      if (cx >= s.x && cx < s.x + s.w && s.y > stackBottom + 1 && s.y < below) below = s.y;
    }
    if (below === Infinity) return true;          // 最底层的地面，玩家本就站在上面
    if (below - top <= JUMP_APEX) return true;    // 从正下方跳得上来

    // 横向：探到这块连续面两端之外一整个跳跃包络。就地挪几格是错的——落点还在
    // 同一块板上，高度差恒为 0、必然通过，等于没判。
    const at = (col: number) => solids.some(s => col >= s.x && col < s.x + s.w && Math.abs(s.y - top) < 1);
    let lo = cx, hi = cx;
    // 走到两端，但设上限：长平地上无界地走既费时，又会让判定跟着「地形已生成到
    // 哪」浮动，而那个边缘随玩家跑法变——今日挑战的同种子同关卡就是这么破的。
    for (let i = 0; i < RUN_WALK_MAX && at(lo - TILE); i++) lo -= TILE;
    for (let i = 0; i < RUN_WALK_MAX && at(hi + TILE); i++) hi += TILE;
    for (let d = 1; d <= JUMP_REACH_TILES; d++) {
      for (const col of [lo - d * TILE, hi + d * TILE]) {
        if (solids.some(s => col >= s.x && col < s.x + s.w && Math.abs(s.y - top) <= JUMP_APEX)) return true;
      }
    }
    return false;
  }

  private standing(x: number, solids: Rect[], spikes: Rect[]) {
    const cands = solids
      .filter(s => x >= s.x && x < s.x + s.w && s.y >= PLATFORM_MIN_Y && s.y <= PLATFORM_MAX_Y)
      .sort((a, b) => a.y - b.y);
    for (const s of cands) {
      const open = (col: number) => {
        const cell: Rect = { x: col, y: s.y - TILE, w: TILE, h: TILE };
        return !spikes.some(k => aabbOverlap(cell, k)) && !solids.some(o => o !== s && aabbOverlap(cell, o));
      };
      const first = s.x + Math.floor((x - s.x) / TILE) * TILE;
      if (!open(first)) continue;
      if (!this.reachable(s.y, first + TILE / 2, solids)) continue;
      let lo = first, hi = first + TILE;
      while (lo - TILE >= s.x && open(lo - TILE)) lo -= TILE;
      while (hi + TILE <= s.x + s.w && open(hi)) hi += TILE;
      if (hi - lo >= PLATFORM_MIN_W) return { top: s.y, minX: lo, maxX: hi - WALKER_W };
    }
    return undefined;
  }

  private spawnAt(x: number, solids: Rect[], spikes: Rect[], groundOnly = false): void {
    const distanceM = x / PX_PER_METER;
    const ground = this.standing(x, solids, spikes);

    if (ground) {
      const { top, minX, maxX } = ground;
      const gx = Math.min(Math.max(x, minX), maxX);
      // rng 恒取一次：取数次数不得随闸门变化，否则同种子在不同路程下错位
      const roll = this.rng();
      const clear = headroom(minX, maxX, WALKER_W, top, solids);
      // 净空不足处不出盾旱魃：它冲不死、只能踩，头顶没地方跳就成了无解路障
      const kind: EnemyKind = clear && roll < 0.5 && distanceM >= UNLOCK_M.shield ? 'shield' : 'walker';
      this.list.push(makeEnemy({
        kind,
        x: gx, y: top - WALKER_H, w: WALKER_W, h: WALKER_H,
        dir: this.rng() < 0.5 ? -1 : 1,
        minX, maxX,
      }));
      return;
    }

    if (groundOnly) return;   // 列阵只成群于地面，见 ensure

    // 飞怪：整条摆动带都必须在空中，否则会半嵌在山体里
    const rawY = FLYER_MIN_Y + this.rng() * (FLYER_MAX_Y - FLYER_MIN_Y);
    const phase = this.rng() * Math.PI * 2;
    const blocked = (y: number) =>
      solids.some(s => aabbOverlap({ x, y: y - FLYER_SWING, w: FLYER_W, h: FLYER_H + FLYER_SWING * 2 }, s));
    let baseY = rawY;
    if (blocked(baseY)) {
      const clear = FLYER_NUDGE
        .map(d => rawY + d)
        .find(y => y >= PLATFORM_MIN_Y && y <= FLYER_MAX_Y && !blocked(y));
      if (clear === undefined) return; // 此处上下都是地形，索性不生成
      baseY = clear;
    }
    this.list.push(makeEnemy({
      kind: 'flyer',
      x, y: baseY, w: FLYER_W, h: FLYER_H, baseY, phase,
    }));
  }

  update(dt: number, _solids: Rect[], playerCx = 0, playerCy = 0): void {
    for (const e of this.list) {
      if (!e.alive) continue;
      updateEnemy(e, dt, playerCx, playerCy);
    }
    this.list = this.list.filter(e => e.alive);
  }

  prune(leftEdgeX: number): void {
    this.list = this.list.filter(e => e.alive && e.x + e.w >= leftEdgeX);
  }
}
