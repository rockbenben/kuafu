// UI 层的信箱化变换：renderUI 的绘制与所有命中判定共用同一套算式。
//
// 这里是纯函数，且是**唯一**一份实现——Renderer 绘制时调它，命中时也调它，
// 测试同样调它。此前命中侧各自手写了一份，测试又手写了第三份（还恰好是
// 绘制侧的代数逆），结果坐标系用错了测试照样全绿。

import { WORLD_H } from '../game/constants';

export interface Letterbox {
  /** 世界单位 → 画布设备像素 */
  scale: number;
  /** 画布内的左/上留黑（设备像素） */
  offX: number;
  offY: number;
}

/** 「包含式」适配：不裁不抖，顶/底 HUD 始终完整可见，代价是可能上下或左右留黑。 */
export function uiLetterbox(canvasW: number, canvasH: number, vw: number): Letterbox {
  const scale = Math.min(canvasW / vw, canvasH / WORLD_H);
  return {
    scale,
    offX: (canvasW - vw * scale) / 2,
    offY: (canvasH - WORLD_H * scale) / 2,
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
