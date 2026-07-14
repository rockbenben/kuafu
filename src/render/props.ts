import { rgb, journeyPhase, PHASE_ART, type Theme } from './theme';
import { PROP_BIOMES, type Assets } from './assets';

// 前景装饰道具层：按旅程段落在地平线一带疏落散布契合当段的剪影景物
// （枯树/巨石/芦苇/兽骨/桃树/亭…），视差介于近景背景与平台之间，读作景深。
const SPACING = 300;   // 每 300 世界像素一个装饰位
const PAR = 0.72;      // 视差系数（近景 bg 0.5 与平台 1.0 之间）
const BASE_Y = 0.80;   // 装饰基线（屏高比例，贴近地平/平台）

const hash = (n: number) => (Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;

const tintCache = new Map<string, HTMLCanvasElement>();
function tintedProp(img: HTMLImageElement, tint: [number, number, number]): HTMLCanvasElement {
  const key = `${img.src}:${tint[0] >> 3},${tint[1] >> 3},${tint[2] >> 3}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d')!;
  cx.fillStyle = rgb(tint);
  cx.fillRect(0, 0, img.width, img.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(img, 0, 0);
  tintCache.set(key, c);
  return c;
}

export function drawProps(
  ctx: CanvasRenderingContext2D, assets: Assets, distanceM: number,
  cameraX: number, theme: Theme, w: number, h: number,
) {
  const names = PROP_BIOMES[PHASE_ART[journeyPhase(distanceM).i]] ?? [];
  const avail = names.filter(n => assets.props[n]);
  if (!avail.length) return;
  const tint = theme.fog.map(c => Math.round(c * 0.5)) as [number, number, number];
  const scrolled = cameraX * PAR;
  const first = Math.floor((scrolled - 120) / SPACING);
  const last = Math.ceil((scrolled + w + 120) / SPACING);
  const baseY = h * BASE_Y;
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let s = first; s <= last; s++) {
    if (hash(s * 3 + 11) < 0.35) continue;   // 约三分之一空位，疏密自然
    const img = assets.props[avail[(hash(s * 7 + 5) * avail.length) | 0]];
    if (!img) continue;
    const r = hash(s * 5 + 2);
    const targetH = h * (0.10 + r * 0.11);   // 装饰高度 10~21% 屏高
    const tw = img.width * (targetH / img.height);
    const wx = s * SPACING + (hash(s * 13 + 1) * (SPACING * 0.5) - SPACING * 0.25);
    const x = wx - scrolled;
    const tinted = tintedProp(img, tint);
    if (hash(s * 17 + 3) > 0.5) {
      ctx.save();
      ctx.translate(x + tw, baseY - targetH);
      ctx.scale(-1, 1);
      ctx.drawImage(tinted, 0, 0, tw, targetH);
      ctx.restore();
    } else {
      ctx.drawImage(tinted, x, baseY - targetH, tw, targetH);
    }
  }
  ctx.restore();
}
