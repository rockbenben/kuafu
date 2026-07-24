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

export class ChunkStream {
  private rng: () => number;
  private lastId = '';

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  next(distanceM: number, prevExitY: number): ChunkDef {
    const { min, max } = difficultyForDistance(distanceM);
    const fits = (c: ChunkDef, maxDrop: number, dmin: number, dmax: number) =>
      c.difficulty >= dmin && c.difficulty <= dmax &&
      prevExitY - c.entryY <= MAX_SEAM_CLIMB &&   // 往上：跳得上去
      c.entryY - prevExitY <= maxDrop;            // 往下：掉下去总是安全的

    let pool = CHUNKS.filter(c => fits(c, 3, min, max));
    if (!pool.length) pool = CHUNKS.filter(c => fits(c, 3, 1, 5));
    if (!pool.length) pool = CHUNKS.filter(c => fits(c, 6, 1, 5));
    if (!pool.length) pool = [CHUNKS[0]];

    const noRepeat = pool.filter(c => c.id !== this.lastId);
    const finalPool = noRepeat.length ? noRepeat : pool;
    const pick = finalPool[Math.floor(this.rng() * finalPool.length)];
    this.lastId = pick.id;
    return pick;
  }
}
