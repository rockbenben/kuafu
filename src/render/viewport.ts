// UI 层的信箱化变换：renderUI 的绘制与所有命中判定共用同一套算式。
//
// 这里是纯函数，且是**唯一**一份实现——Renderer 绘制时调它，命中时也调它，
// 测试同样调它。此前命中侧各自手写了一份，测试又手写了第三份（还恰好是
// 绘制侧的代数逆），结果坐标系用错了测试照样全绿。

import { WORLD_H } from '../game/constants';

/**
 * 短屏（横持手机）上裁掉的天空高度上限，世界单位。
 *
 * 世界高恒为 576 且必须整高入屏，于是缩放比恒等于 屏高/576：桌面 900px 高得
 * 1.56 CSS px/世界单位，横持手机只有 390px 高、得 0.68——同一套按 960×576 手调的
 * 字号到了手机上一律缩到 43%，12px 的标签只剩 8 CSS px，结算榜单一行 8.8px。
 * 这不是等比缩小无解，而是版面只有桌面一个断点。
 *
 * 出路是「少显示一点」。关卡几何最高只到第 9 行（y=288，见 chunks.ts 的 mk），
 * 上方 288 个单位是纯天空，裁掉不会藏起任何可踩之物。取 128（4 格）为限：玩家
 * 自最高台跃起时人像顶端落在 y≈147，尚余 19 单位。两条前提都由
 * tests/mobile-fit.test.ts 守着——新加一块把台子摆到第 3 行的关卡就会红。
 *
 * 已知代价：在最高的那几块台上放「夸父跨步」（额外腾空 114）会短暂飞出画顶。
 * 跨步期间无敌且只有半秒，不值得为它把裁切收回到几乎没有收益的 33。
 */
export const SKY_CROP_MAX = 128;

/** 目标缩放比（CSS px / 世界单位）。低于它才开始裁天空，故桌面恒为 0 裁切。 */
const TARGET_PX_PER_WORLD = 0.9;

/** 按当前 CSS 视口高算出该裁掉多少天空。纯函数：渲染与测试共用。 */
export function skyCrop(cssH: number): number {
  return Math.max(0, Math.min(SKY_CROP_MAX, WORLD_H - cssH / TARGET_PX_PER_WORLD));
}

/**
 * 画布后备缓冲的目标像素尺寸。**必须先取整，再拿去和 `canvas.width` 比较。**
 *
 * `canvas.width` / `canvas.height` 是整数属性，赋一个小数会被截断。于是
 * 「用小数比较、存下来是整数」这种写法永远不相等，每一帧都判定为「尺寸变了」
 * 而重新分配一次后备缓冲——**给 canvas.width 赋值会清空整张画布**，等于每帧
 * 清屏重建，手机上看就是一直在闪。
 *
 * 桌面碰不到：`innerHeight` 在桌面是整数，乘上封顶后的 dpr（1 或 2）仍是整数，
 * 条件第一帧之后即为假。而 iOS Safari 的 `innerHeight` 在工具栏收放过程中是**小数**
 * （如 745.5），Android 某些缩放比下同理——这条件从此再没假过。
 */
export function backingSize(cssW: number, cssH: number, dpr: number): { w: number; h: number } {
  return { w: Math.round(cssW * dpr), h: Math.round(cssH * dpr) };
}

export interface WorldFit {
  /** 裁掉的天空高度（世界单位）；世界因此贴底对齐 */
  crop: number;
  /** 可见世界高 = WORLD_H − crop，也就是 UI 层的逻辑高度 */
  visH: number;
  /** 有效视口宽度：按可见带的宽高比自适应，宽屏铺满 */
  vw: number;
  /** 世界单位 → 画布设备像素 */
  scale: number;
}

/**
 * 当帧的世界适配。渲染与测试共用**同一份**实现——上一轮的信箱化就是栽在
 * 「绘制一份、命中一份、测试再一份」上，这里不再开第二个口子。
 */
export function fitWorld(canvasW: number, canvasH: number, dpr: number): WorldFit {
  // 防窗口塌缩：height 为 0 时回退基准高，避免除零得 NaN 污染当帧变换
  const ch = canvasH || WORLD_H;
  const crop = skyCrop(ch / dpr);
  const visH = WORLD_H - crop;
  const vw = Math.max(820, Math.min(1400, visH * canvasW / ch));
  return { crop, visH, vw, scale: Math.min(canvasW / vw, ch / visH) };
}

// ── UI 层的当帧视口（由 Renderer.render 每帧写入）────────────────────────
//
// 裁天空之后，UI 的逻辑高度不再等于 WORLD_H，而是可见的那一段。绘制、命中、
// placeAvBar 三方必须读同一个数，否则又会重演「绘制与命中各写一份、点喇叭
// 反而关掉浮层」。所以放在这里当模块状态，而不是让每个调用方各自传。
let uiH = WORLD_H;
let pxPerWorld = 1;

export function setUiViewport(h: number, px: number) { uiH = h; pxPerWorld = px; }

// ── 屏幕安全区 ────────────────────────────────────────────────────────
//
// HUD 的边距原本是写死的世界单位（`HX = 22`），而世界单位在小屏上物理更小：
// 手机 0.87 CSS px/世界 → 22 只值 19 CSS px，桌面 2.11 → 值 46。**边距恰好在
// 最需要它的设备上缩水一半**——而那正是有刘海、圆角和home 指示条的那些设备。
// 触屏按键早就吃了 `env(safe-area-inset-*)`（见 index.html），画在 canvas 里的
// HUD 却完全没有，于是 iPhone 横持时左上角那组数字压在刘海底下。
//
// 这里把两件事合成一条：**取「设计边距」与「安全区 + 物理下限」中的大者**，
// 与 uiFont 的地板是同一个套路。安全区由 main.ts 从 CSS env() 读进来。
let safe = { l: 0, r: 0, t: 0, b: 0 };
export function setSafeArea(s: { l: number; r: number; t: number; b: number }) { safe = s; }

/** 无安全区时也至少留这么多 CSS 像素——圆角屏的角落会啃掉贴边的字。 */
const MIN_EDGE_PX = 14;

const inset = (designWorld: number, sideCssPx: number) =>
  Math.max(designWorld, (sideCssPx + MIN_EDGE_PX) / pxPerWorld);

/** HUD 距各边的安全边距（世界单位）。传入设计值，返回实际该用的值。 */
export const uiInsetL = (design: number) => inset(design, safe.l);
export const uiInsetR = (design: number) => inset(design, safe.r);
export const uiInsetT = (design: number) => inset(design, safe.t);
export const uiInsetB = (design: number) => inset(design, safe.b);

/** UI 层的逻辑高度（世界单位）。未渲染过时退回 WORLD_H。 */
export const uiHeight = () => uiH;

/**
 * UI 字号：小屏上抬到不小于 MIN_CSS_PX 个 CSS 像素。
 *
 * 裁天空把缩放比从 0.68 提到 0.87，但 11~13px 的那批标签仍只有 9.6~11.3 CSS px。
 * 这里只抬小字（大字取 max 后原样返回），所以桌面（比 1.56）恒为恒等变换，
 * 不会把手调好的层级关系压平。
 */
const MIN_CSS_PX = 12;
export const uiFont = (px: number) => Math.max(px, MIN_CSS_PX / pxPerWorld);

export interface Letterbox {
  /** 世界单位 → 画布设备像素 */
  scale: number;
  /** 画布内的左/上留黑（设备像素） */
  offX: number;
  offY: number;
}

/** 「包含式」适配：不裁不抖，顶/底 HUD 始终完整可见，代价是可能上下或左右留黑。 */
export function uiLetterbox(canvasW: number, canvasH: number, vw: number, h = uiH): Letterbox {
  const scale = Math.min(canvasW / vw, canvasH / h);
  return {
    scale,
    offX: (canvasW - vw * scale) / 2,
    offY: (canvasH - h * scale) / 2,
  };
}

export interface ClientToWorldInput {
  clientX: number;
  clientY: number;
  /** 画布的 CSS 盒（getBoundingClientRect），不是 innerWidth/innerHeight */
  rect: { left: number; top: number; width: number; height: number };
  /** 画布 backing store 尺寸（设备像素） */
  canvasW: number;
  canvasH: number;
  vw: number;
}

/**
 * 浏览器视口坐标 → UI 世界坐标。
 *
 * 用画布真实的 CSS 盒换算，而不是 innerWidth/innerHeight：#game 是按
 * 100vw/100vh 定尺的，而 backing store 按 innerWidth/innerHeight 设，
 * 移动端 100vh ≠ innerHeight（地址栏），两者差一个拉伸比，直接乘 dpr
 * 会有 10~15% 的纵向误差。
 */
export function clientToWorld(i: ClientToWorldInput): { x: number; y: number } {
  const { scale, offX, offY } = uiLetterbox(i.canvasW, i.canvasH, i.vw);
  // CSS 像素 → 设备像素：由实测盒宽高推出，不假设 dpr
  const px = i.canvasW / i.rect.width;
  const py = i.canvasH / i.rect.height;
  return {
    x: ((i.clientX - i.rect.left) * px - offX) / scale,
    y: ((i.clientY - i.rect.top) * py - offY) / scale,
  };
}

/** 世界坐标 → 浏览器视口坐标。仅测试用：用来算出某物「实际画在屏幕哪个像素」。 */
export function worldToClient(
  x: number, y: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasW: number, canvasH: number, vw: number,
): { clientX: number; clientY: number } {
  const { scale, offX, offY } = uiLetterbox(canvasW, canvasH, vw);
  return {
    clientX: (x * scale + offX) / (canvasW / rect.width) + rect.left,
    clientY: (y * scale + offY) / (canvasH / rect.height) + rect.top,
  };
}
