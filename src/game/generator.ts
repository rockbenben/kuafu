import { CHUNKS, type ChunkDef } from './chunks';

/** UTC 日期字符串（YYYY-MM-DD）→ 稳定 31 位种子：全球同日同关卡。 */
export function dailySeed(dateStr: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2 ** 31;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function difficultyForDistance(m: number): { min: number; max: number } {
  if (m < 150) return { min: 1, max: 1 };  // 开局纯 1 级，纯熟悉手感
  if (m < 380) return { min: 1, max: 2 };
  if (m < 680) return { min: 1, max: 3 };
  if (m < 1050) return { min: 2, max: 4 };
  return { min: 3, max: 5 };
}

/**
 * 接缝处允许的最大爬升格数。玩家满速起跳只能升约 98.5px（≈3 格），且接缝处没有
 * 助跑余量，所以 3 格是够不着的——放宽只放宽"往下掉"，往上永远卡死在 2 格。
 */
export const MAX_SEAM_CLIMB = 2;

/**
 * 连续多少个高难块（难度 ≥3）之后强制塞一个喘息块——取区间随机，不取定值。
 *
 * 定值会把节奏压成严格周期：末段难度恒为 3~5，于是保底机制完全主导，实测「平均
 * 高难连段」恰好等于阈值本身，玩家几拍就能数出下一个喘息在哪。关卡节奏的通行做法
 * 是张弛比 3:1 ~ 5:1（喘息占 17~25%）**且周期要抖**，所以每次喘息后重掷一次。
 */
export const REST_MIN = 3;
export const REST_MAX = 6;

export class ChunkStream {
  private rng: () => number;
  private lastId = '';
  private hardRun = 0;   // 连续高难块计数
  private restAfter = 0; // 本轮的喘息阈值，每次喘息后重掷

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.rollRest();
  }

  /** 重掷喘息阈值。用同一条 rng，故同种子仍完全可复现。 */
  private rollRest() {
    this.restAfter = REST_MIN + Math.floor(this.rng() * (REST_MAX - REST_MIN + 1));
  }

  next(distanceM: number, prevExitY: number): ChunkDef {
    const { min, max } = difficultyForDistance(distanceM);
    const fits = (c: ChunkDef, maxDrop: number, dmin: number, dmax: number) =>
      c.difficulty >= dmin && c.difficulty <= dmax &&
      prevExitY - c.entryY <= MAX_SEAM_CLIMB &&   // 往上：跳得上去
      c.entryY - prevExitY <= maxDrop;            // 往下：掉下去总是安全的

    // 末段难度是 { min: 3, max: 5 }——照字面走，1050m 之后**永远**不会再出
    // 1~2 级块，长跑段落一路绷着、没有节奏起伏。连续若干个高难块后强制降档，
    // 给玩家一口气；喘息块接不上当前高度时按下面的回退链正常处理。
    const wantRest = this.hardRun >= this.restAfter;
    let pool = wantRest ? CHUNKS.filter(c => fits(c, 3, 1, 2)) : [];
    if (!pool.length) pool = CHUNKS.filter(c => fits(c, 3, min, max));
    if (!pool.length) pool = CHUNKS.filter(c => fits(c, 3, 1, 5));
    if (!pool.length) pool = CHUNKS.filter(c => fits(c, 6, 1, 5));
    if (!pool.length) pool = [CHUNKS[0]];

    const noRepeat = pool.filter(c => c.id !== this.lastId);
    const finalPool = noRepeat.length ? noRepeat : pool;
    const pick = finalPool[Math.floor(this.rng() * finalPool.length)];
    this.lastId = pick.id;
    if (pick.difficulty >= 3) this.hardRun++;
    else { this.hardRun = 0; this.rollRest(); } // 喘过一口，下一段紧张长度重掷
    return pick;
  }
}
