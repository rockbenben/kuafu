import type { Rect } from './types';
import type { ChunkDef } from './chunks';
import { CHUNKS } from './chunks';
import type { ChunkStream } from './generator';
import { TILE, PX_PER_METER } from './constants';

export interface Pickup { x: number; y: number; taken: boolean }

/**
 * 拾取物（日光 / 甘泉）相对格心的上提量。
 *
 * 按格心画时，亮点正落在奔跑中人物的发梢与杖尖上：人物绘制高约 48px，地面上
 * 一格的格心离地正好 48px。看着像顶了个小太阳在头上，偏偏又拾不着——离体心
 * 34px，大于拾取半径 24。上提一格后清清楚楚浮在头顶之上，读作「跃起去够」。
 *
 * 半格（16px）试过，截图里仍与杖尖齐平；一格是实测出来的值，别凭手感改小。
 */
const PICKUP_LIFT = TILE;

export function parseChunk(def: ChunkDef, offsetX: number) {
  const solids: Rect[] = [];
  const spikes: Rect[] = [];
  const motes: Pickup[] = [];
  const crystals: Pickup[] = [];
  for (let r = 0; r < def.rows.length; r++) {
    const row = def.rows[r];
    let runStart = -1;
    for (let c = 0; c <= row.length; c++) {
      const ch = c < row.length ? row[c] : '.';
      if (ch === '#' && runStart < 0) runStart = c;
      if (ch !== '#' && runStart >= 0) {
        solids.push({ x: offsetX + runStart * TILE, y: r * TILE, w: (c - runStart) * TILE, h: TILE });
        runStart = -1;
      }
      const cx = offsetX + c * TILE + TILE / 2;
      const cy = r * TILE + TILE / 2 - PICKUP_LIFT;
      if (ch === '^') spikes.push({ x: offsetX + c * TILE, y: r * TILE + TILE / 2, w: TILE, h: TILE / 2 });
      if (ch === 'o') motes.push({ x: cx, y: cy, taken: false });
      if (ch === '*') crystals.push({ x: cx, y: cy, taken: false });
    }
  }
  return { solids, spikes, motes, crystals, width: def.rows[0].length * TILE };
}

export class Level {
  solids: Rect[] = [];
  spikes: Rect[] = [];
  motes: Pickup[] = [];
  crystals: Pickup[] = [];

  private cursorX = 0;
  private lastExitY: number;

  constructor(private stream: ChunkStream) {
    const start = CHUNKS[0]; // 平地起步
    this.append(start);
    this.lastExitY = start.exitY;
  }

  private append(def: ChunkDef) {
    const parsed = parseChunk(def, this.cursorX);
    this.solids.push(...parsed.solids);
    this.spikes.push(...parsed.spikes);
    this.motes.push(...parsed.motes);
    this.crystals.push(...parsed.crystals);
    this.cursorX += parsed.width;
    this.lastExitY = def.exitY;
  }

  /**
   * 难度只由**这一块自己所在的位置**决定，不看玩家现在跑到哪。
   *
   * 原来传的是玩家实时里程，而关卡是提前两屏生成的、生成时机又随跑法浮动，
   * 于是同一个种子在不同跑法下会长出不同的关卡——「今日挑战全球同日同关卡」
   * 这条承诺从来没有成立过（实测 60/60 个种子、三种跑法两两不一致）。改由
   * cursorX 推出难度之后，生成结果是 (种子, 位置) 的纯函数，与跑法无关。
   */
  ensure(rightEdgeX: number) {
    while (this.cursorX < rightEdgeX) {
      this.append(this.stream.next(this.cursorX / PX_PER_METER, this.lastExitY));
    }
  }

  prune(leftEdgeX: number) {
    this.solids = this.solids.filter(s => s.x + s.w >= leftEdgeX);
    this.spikes = this.spikes.filter(s => s.x + s.w >= leftEdgeX);
    this.motes = this.motes.filter(m => m.x >= leftEdgeX && !m.taken);
    this.crystals = this.crystals.filter(c => c.x >= leftEdgeX && !c.taken);
  }
}
