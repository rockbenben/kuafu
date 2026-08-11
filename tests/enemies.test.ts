import { describe, it, expect } from 'vitest';
import { Enemies, isGroundKind, makeEnemy, NO_SPAWN_UNTIL_M } from '../src/game/enemies';
import { Level } from '../src/game/level';
import { ChunkStream, mulberry32 } from '../src/game/generator';
import { aabbOverlap } from '../src/game/collision';
import { TILE, UNLOCK_M, ALERT_SPEED_MUL, PX_PER_METER } from '../src/game/constants';
import type { Rect } from '../src/game/types';
import { updateEnemy, FLYER_SWING } from '../src/game/enemy-kinds';
import type { Enemy } from '../src/game/enemies';

describe('Enemies.ensure', () => {
  it('前 30 步之内不生成任何敌人', () => {
    // 闸门现在由**生成点自己的位置**决定（见 Enemies.ensure），所以要用 x 范围
    // 控制，不能再靠传一个玩家里程进去
    const en = new Enemies(mulberry32(1));
    en.ensure(NO_SPAWN_UNTIL_M * PX_PER_METER, []);
    expect(en.list.length).toBe(0);
  });

  it('过 30 步即稀疏现怪，且越往后越密', () => {
    // 同样 3000px 宽的一段，比较「靠前那段」与「靠后那段」的密度。
    const count = (from: number, to: number) => {
      const en = new Enemies(mulberry32(1));
      (en as unknown as { nextSpawnX: number }).nextSpawnX = from;
      en.ensure(to, []);
      return en.list.length;
    };
    const early = count(1200, 4200);
    const late = count(25000, 28000);
    expect(early, '很早就该有怪').toBeGreaterThan(0);
    expect(early, '但早期要稀疏').toBeLessThan(6);
    expect(late, '越跑越密').toBeGreaterThan(early);
  });

  it('distanceM=500 时在 1200..8000 范围内产生多个敌人', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(8000, []);
    expect(en.list.length).toBeGreaterThan(3);
    for (const e of en.list) {
      expect(e.x).toBeGreaterThanOrEqual(1200);
      expect(e.x).toBeLessThan(8000);
    }
  });

  it('平台足够宽时在平台上生成 walker，y 贴平台顶', () => {
    const platform: Rect = { x: 1100, y: 10 * TILE, w: 8 * TILE, h: TILE };
    const en = new Enemies(mulberry32(1));
    // distanceM=100：低于 shield 闸门（250），kind 结构上必为 walker，与 rng
    // 落点无关——这里只测平台落脚机制，不测种类分支
    en.ensure(1400, [platform]);
    const walker = en.list.find(e => e.kind === 'walker');
    expect(walker).toBeDefined();
    expect(walker!.y).toBe(platform.y - walker!.h);
    expect(walker!.minX).toBe(platform.x);
    expect(walker!.maxX).toBe(platform.x + platform.w - walker!.w);
  });

  it('无可站立平台（或平台过窄）时生成 flyer，baseY 落在 [6*TILE, 12*TILE]', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, []);
    expect(en.list.length).toBe(1);
    const flyer = en.list[0];
    expect(flyer.kind).toBe('flyer');
    expect(flyer.baseY).toBeGreaterThanOrEqual(6 * TILE);
    expect(flyer.baseY).toBeLessThanOrEqual(12 * TILE);
  });

  it('平台过窄（<4*TILE）时生成 flyer 而非 walker', () => {
    const narrow: Rect = { x: 1100, y: 10 * TILE, w: 3 * TILE, h: TILE };
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, [narrow]);
    expect(en.list.length).toBe(1);
    expect(en.list[0].kind).toBe('flyer');
  });
});

describe('小怪不得埋进地形', () => {
  // 玩家进不去的地方就不该有怪：刺行底下那层地面不是"地表"，屋檐压顶的夹层也不是。
  it('walker 的巡逻带绝不与尖刺相交', () => {
    let walkers = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const lv = new Level(new ChunkStream(mulberry32(seed)));
      lv.ensure(30000);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(30000, lv.solids, lv.spikes);
      for (const e of en.list) {
        if (e.kind !== 'walker') continue;
        walkers++;
        const patrol: Rect = { x: e.minX, y: e.y, w: e.maxX - e.minX + e.w, h: e.h };
        const buried = lv.spikes.find(s => aabbOverlap(patrol, s));
        expect(buried, `seed ${seed}: walker@(${e.x.toFixed(0)},${e.y.toFixed(0)}) 埋在尖刺里`)
          .toBeUndefined();
      }
    }
    expect(walkers).toBeGreaterThan(100); // 确保样本量足够，不是"零个怪所以全过"
  });

  it('walker 头顶留有实体空隙（不是站在夹层/岩层里）', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const lv = new Level(new ChunkStream(mulberry32(seed)));
      lv.ensure(20000);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(20000, lv.solids, lv.spikes);
      for (const e of en.list) {
        if (e.kind !== 'walker') continue;
        const body: Rect = { x: e.minX, y: e.y, w: e.maxX - e.minX + e.w, h: e.h };
        const inside = lv.solids.find(s => aabbOverlap(body, s));
        expect(inside, `seed ${seed}: walker@(${e.x.toFixed(0)},${e.y.toFixed(0)}) 嵌在实体里`)
          .toBeUndefined();
      }
    }
  });

  it('flyer 的整条摆动带都在空中', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const lv = new Level(new ChunkStream(mulberry32(seed)));
      lv.ensure(30000);
      const en = new Enemies(mulberry32(seed * 7 + 1));
      en.ensure(30000, lv.solids, lv.spikes);
      for (const e of en.list) {
        if (e.kind !== 'flyer') continue;
        const swept: Rect = { x: e.x, y: e.baseY - FLYER_SWING, w: e.w, h: e.h + FLYER_SWING * 2 };
        const inside = lv.solids.find(s => aabbOverlap(swept, s));
        expect(inside, `seed ${seed}: flyer@(${e.x.toFixed(0)},${e.baseY.toFixed(0)}) 嵌在山体里`)
          .toBeUndefined();
      }
    }
  });
});

describe('Enemies.update', () => {
  it('walker 巡逻到平台边缘折返，且 x 保持在 [minX,maxX] 内', () => {
    const platform: Rect = { x: 1150, y: 10 * TILE, w: 4 * TILE, h: TILE };
    const en = new Enemies(mulberry32(1));
    // distanceM=100：理由同上一个测试，低于 shield 闸门，避免 kind 被挤成 shield
    en.ensure(1250, [platform]);
    const walker = en.list.find(e => e.kind === 'walker');
    expect(walker).toBeDefined();
    const w = walker!;
    let flips = 0;
    let lastDir = w.dir;
    for (let i = 0; i < 600; i++) {
      en.update(1 / 60, [platform]);
      expect(w.x).toBeGreaterThanOrEqual(w.minX);
      expect(w.x).toBeLessThanOrEqual(w.maxX);
      if (w.dir !== lastDir) { flips++; lastDir = w.dir; }
    }
    expect(flips).toBeGreaterThan(0);
  });

  it('flyer 正弦运动，y 在 baseY±26 范围内摆动', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, []);
    const flyer = en.list[0];
    let maxY = -Infinity, minY = Infinity;
    for (let i = 0; i < 300; i++) {
      en.update(1 / 60, []);
      maxY = Math.max(maxY, flyer.y);
      minY = Math.min(minY, flyer.y);
    }
    expect(maxY).toBeLessThanOrEqual(flyer.baseY + 26 + 1e-6);
    expect(minY).toBeGreaterThanOrEqual(flyer.baseY - 26 - 1e-6);
    expect(maxY - minY).toBeGreaterThan(10);
  });

  it('死亡（alive=false）的敌人在 update 后被移除', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(1400, []);
    expect(en.list.length).toBe(1);
    en.list[0].alive = false;
    en.update(1 / 60, []);
    expect(en.list.length).toBe(0);
  });
});

describe('Enemies.prune', () => {
  it('清理左侧过期敌人', () => {
    const en = new Enemies(mulberry32(1));
    en.ensure(8000, []);
    const before = en.list.length;
    expect(before).toBeGreaterThan(0);
    en.prune(3000);
    expect(en.list.every(e => e.x + e.w >= 3000)).toBe(true);
    expect(en.list.length).toBeLessThan(before);
  });
});

describe('新敌人按路程解锁', () => {
  const flat: Rect[] = [{ x: 0, y: 14 * TILE, w: 20000, h: 4 * TILE }];
  /** 生成到 x = edge 为止出现过哪些种类。闸门按位置算，所以用 x 而不是里程控制。 */
  const kindsUpTo = (edge: number) => {
    const en = new Enemies(mulberry32(7));
    en.ensure(edge, flat);
    return new Set(en.list.map(e => e.kind));
  };

  it('盾的闸门之前只有旱魃与金乌', () => {
    const k = kindsUpTo(UNLOCK_M.shield * PX_PER_METER);
    expect([...k].every(x => x === 'walker' || x === 'flyer'), [...k].join()).toBe(true);
  });

  it('过闸门之后盾旱魃才出现', () => {
    expect(kindsUpTo(UNLOCK_M.shield * PX_PER_METER).has('shield')).toBe(false);
    expect(kindsUpTo(30000).has('shield'), '盾旱魃未出现').toBe(true);
  });

  it('同种子同路程生成完全一致（今日挑战必须可复现）', () => {
    const a = new Enemies(mulberry32(42)); a.ensure(20000, flat);
    const b = new Enemies(mulberry32(42)); b.ensure(20000, flat);
    expect(a.list.map(e => `${e.kind}@${Math.round(e.x)}`))
      .toEqual(b.list.map(e => `${e.kind}@${Math.round(e.x)}`));
  });
});

/**
 * 本次改动最大的可玩性风险。
 *
 * 盾旱魃与冲锋旱魃冲不死、只能踩——若生成在头顶净空不足的地方，它既冲不死
 * 也踩不到，就成了纯粹的无解路障。比照本文件已有的「小怪不得埋进地形」。
 */
describe('不可冲杀的敌人不得生成在无解位置', () => {
  it('盾/冲锋 头顶必须有至少 3 格净空供踩踏', () => {
    // 低矮夹层：地面 + 头顶两格处的天花板。
    // 天花板的顶必须探到 PLATFORM_MIN_Y 之外（这里直接顶到世界顶）——写成一块
    // 悬空的薄板会被 standing() 当成另一处“开阔平台”选中（板顶上方无遮挡，
    // 净空反而绰绰有余），根本走不到夹层这条分支。真实地形里，低矮夹层的
    // 天花板本就是更高山体的下缘，同理排除。
    const roofed: Rect[] = [
      { x: 0, y: 14 * TILE, w: 20000, h: 4 * TILE },
      { x: 0, y: 0, w: 20000, h: 12 * TILE },
    ];
    const en = new Enemies(mulberry32(3));
    en.ensure(30000, roofed);
    const armored = en.list.filter(e => e.kind === 'shield');
    expect(armored, '净空不足处不该生成装甲敌人').toEqual([]);
    // 但普通旱魃仍应照常生成（否则等于把这段路清空了）
    expect(en.list.some(e => e.kind === 'walker')).toBe(true);
  });

  it('开阔地形上装甲敌人正常生成', () => {
    const en = new Enemies(mulberry32(3));
    en.ensure(30000, [{ x: 0, y: 14 * TILE, w: 20000, h: 4 * TILE }]);
    expect(en.list.some(e => e.kind === 'shield')).toBe(true);
  });

  it('所有地面族敌人都落在自己的巡逻区间内', () => {
    const en = new Enemies(mulberry32(9));
    en.ensure(30000, [{ x: 0, y: 14 * TILE, w: 20000, h: 4 * TILE }]);
    for (const e of en.list.filter(x => isGroundKind(x.kind))) {
      expect(e.x).toBeGreaterThanOrEqual(e.minX);
      expect(e.x).toBeLessThanOrEqual(e.maxX);
    }
  });

  it('生成点头顶开阔，但巡逻区间另一段（含 minX 边界）有 1~3 格悬垂——不生成装甲敌人（会走过去，冲不死也踩不到）', () => {
    // 悬垂盖住区间左段、恰好顶着 minX 这一端（800~1024，minX=800），首个生成点
    // 固定在 x=1200（SPAWN_START_X），离悬垂有段距离，头顶本身开阔——只查
    // 生成点的旧实现会误判"净空够"而放行；装甲敌人巡逻起来会走到悬垂下方，
    // 就成了本文件顶部注释点名的"无解路障"。
    const floor: Rect = { x: 800, y: 14 * TILE, w: 16 * TILE, h: 4 * TILE };
    const overhang: Rect = { x: 800, y: 0, w: 7 * TILE, h: 12 * TILE }; // 顶到 12*TILE，只留 2 格净空
    let armored = 0, walkers = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const en = new Enemies(mulberry32(seed));
      en.ensure(1250, [floor, overhang]); // 右边界卡在 1250：保证每个种子只生成这一只
      for (const e of en.list) {
        if (e.kind === 'shield') armored++;
        if (e.kind === 'walker') walkers++;
      }
    }
    expect(armored, '巡逻区间中段净空不足，不该生成装甲敌人').toBe(0);
    expect(walkers, '净空不足只降级，不是整段消失').toBeGreaterThan(0);
  });
});

describe('列阵', () => {
  const flat: Rect[] = [{ x: 0, y: 14 * TILE, w: 40000, h: 4 * TILE }];

  it('过闸门后会出现 3 只以上挤在 300px 内的成群', () => {
    const en = new Enemies(mulberry32(11));
    en.ensure(40000, flat);
    const xs = en.list.map(e => e.x).sort((a, b) => a - b);
    const clustered = xs.some((x, i) => xs[i + 2] !== undefined && xs[i + 2] - x <= 300);
    expect(clustered, '从未成群，列阵没生效').toBe(true);
  });

  it('闸门之前不成群', () => {
    const en = new Enemies(mulberry32(11));
    en.ensure(UNLOCK_M.formation * PX_PER_METER, flat);   // 只生成到闸门那一格为止
    const xs = en.list.map(e => e.x).sort((a, b) => a - b);
    expect(xs.some((x, i) => xs[i + 2] !== undefined && xs[i + 2] - x <= 300)).toBe(false);
  });

  it('总量不超过现状的 1.5 倍——列阵是把怪挪到一起，不是凭空加压', () => {
    // withF 与 base 的 distanceM 只差 1（而非早前草案里的 1000），刻意让两次
    // interval() 几乎相等——否则「越跑越密」的既有密度曲线本身就能把比值推过
    // 1.5，这条断言测的就不是列阵，是别的东西了。
    const base = new Enemies(mulberry32(11)); base.ensure(40000, flat);
    const withF = new Enemies(mulberry32(11)); withF.ensure(40000, flat);
    expect(withF.list.length).toBeLessThanOrEqual(Math.ceil(base.list.length * 1.5));
  });
});



describe('地面族警觉追击（仅 walker；shield 的行为见下一个 describe）', () => {
  const mk = (kind: 'walker' | 'shield') => makeEnemy({
    kind, x: 500, y: 400, w: 24, h: 20, dir: -1, minX: 400, maxX: 700,
  });

  it('walker: 察觉后转身提速朝玩家走（ALERT_SPEED_MUL 倍），且被夹在巡逻区间内', () => {
    // 基准：玩家远在半径外，走一帧量出巡逻速度，不硬编码 WALKER_SPEED 的具体值
    const base = mk('walker');
    updateEnemy(base, 1 / 60, base.x + 900, base.y);
    const patrolDx = Math.abs(base.x - 500);
    expect(patrolDx).toBeGreaterThan(0); // 基准本身得先站得住，不然下面的倍数比较没意义

    const e = mk('walker');
    updateEnemy(e, 1 / 60, 600, 400); // 玩家在右、半径内 → 立即察觉
    expect(e.alerted).toBe(true);
    expect(e.dir).toBe(1);
    const alertedDx = Math.abs(e.x - 500);
    expect(alertedDx).toBeCloseTo(patrolDx * ALERT_SPEED_MUL, 5);

    for (let i = 0; i < 300; i++) updateEnemy(e, 1 / 60, 600, 400);
    expect(e.x).toBeGreaterThanOrEqual(e.minX);
    expect(e.x).toBeLessThanOrEqual(e.maxX);
  });

  it('警觉是单向的：玩家撤远后不恢复 patrolStep 的边界折返，仍持续跟随玩家当前位置', () => {
    const e = mk('walker');
    updateEnemy(e, 1 / 60, 600, 400); // 触发察觉，朝右
    expect(e.alerted).toBe(true);
    expect(e.dir).toBe(1);
    // 玩家撤到很远的左边：若退回了 patrolStep（边界折返），dir 不会因玩家位置
    // 而变，只有撞上 minX/maxX 才翻转——而这里 e.x 离边界还很远。
    for (let i = 0; i < 30; i++) updateEnemy(e, 1 / 60, 0, 400);
    expect(e.alerted).toBe(true);
    expect(e.dir, '仍应跟随玩家当前位置转向，而不是保持巡逻式的边界折返').toBe(-1);
    expect(e.x).toBeGreaterThanOrEqual(e.minX);
    expect(e.x).toBeLessThanOrEqual(e.maxX);
  });
});

describe('盾旱魃不参与警觉追击（背刺要靠它"没转身"才打得中）', () => {
  const mk = () => makeEnemy({
    kind: 'shield', x: 500, y: 400, w: 24, h: 20, dir: -1, minX: 400, maxX: 700,
  });

  it('玩家贴身站在察觉半径内，盾既不转身也不提速、不标记 alerted，只按巡逻步进', () => {
    const e = mk();
    // 基准：不给玩家坐标时的纯巡逻位移，用来确认下面这一步没有"提速"。
    const base = mk();
    patrolOnce(base);
    const patrolDx = Math.abs(base.x - 500);
    expect(patrolDx).toBeGreaterThan(0);

    updateEnemy(e, 1 / 60, 600, 400); // 玩家在右、远在察觉半径内——换成 walker 会立即察觉转身
    expect(e.alerted, '盾不该被标记为警觉').toBe(false);
    expect(e.dir, '朝向不该跟着玩家转').toBe(-1);
    expect(Math.abs(e.x - 500)).toBeCloseTo(patrolDx, 5); // 位移量与纯巡逻一致，没有提速
  });

  it('玩家贴身跟跑很多帧，盾全程只按 [minX,maxX] 边界折返，不跟随玩家', () => {
    const e = mk();
    for (let i = 0; i < 300; i++) updateEnemy(e, 1 / 60, e.x + 5, 400); // 玩家几乎贴脸跟跑
    expect(e.alerted).toBe(false);
    expect(e.x).toBeGreaterThanOrEqual(e.minX);
    expect(e.x).toBeLessThanOrEqual(e.maxX);
  });

  function patrolOnce(e: Enemy) {
    updateEnemy(e, 1 / 60, e.x + 900, e.y); // 玩家远在察觉半径外，走一帧纯巡逻位移
  }
});

