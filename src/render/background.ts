import { rgb, journeyPhase, PHASE_ART, type Theme } from './theme';
import { PHASE_KEYS, type Assets } from './assets';

/** 确定性伪随机轮廓：多重正弦叠加，无需存储地形。 */
function ridge(x: number, seed: number): number {
  return (
    Math.sin(x * 0.003 + seed) * 0.5 +
    Math.sin(x * 0.008 + seed * 2.7) * 0.3 +
    Math.sin(x * 0.02 + seed * 5.1) * 0.2
  );
}

const PROC_LAYERS = [
  { par: 0.15, base: 0.55, amp: 0.12, alpha: 0.35, seed: 1 },
  { par: 0.3, base: 0.65, amp: 0.16, alpha: 0.55, seed: 9 },
  { par: 0.5, base: 0.78, amp: 0.2, alpha: 0.8, seed: 23 },
];

const IMG_LAYERS = [
  { par: 0.15, hFrac: 0.5, alpha: 0.35 },
  { par: 0.3, hFrac: 0.62, alpha: 0.55 },
  { par: 0.5, hFrac: 0.78, alpha: 0.8 },
];

// 每层一张离屏画布缓存：填充色调后用 destination-in 抠出剪影，避免每帧重绘。
const tintCache = new Map<string, HTMLCanvasElement>();

function tintedLayer(img: HTMLImageElement, tint: [number, number, number], idKey: string): HTMLCanvasElement {
  const key = `${idKey}:${tint[0] >> 3},${tint[1] >> 3},${tint[2] >> 3}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const cx = c.getContext('2d')!;
  cx.fillStyle = rgb(tint);
  cx.fillRect(0, 0, img.width, img.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(img, 0, 0);
  tintCache.set(key, c);
  return c;
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, cfg: { par: number; hFrac: number; alpha: number },
  cameraX: number, tint: [number, number, number], w: number, h: number, idKey: string, alphaScale = 1,
) {
  if (alphaScale <= 0.01) return;
  const tinted = tintedLayer(img, tint, idKey);
  const targetH = h * (1 - cfg.hFrac);
  const tileW = img.width * (targetH / img.height);
  if (tileW <= 0) return;
  const scrolled = cameraX * cfg.par;
  const offset = (scrolled % tileW + tileW) % tileW;
  const startX = -offset;
  const worldTile = Math.floor(scrolled / tileW); // 世界锚定的瓦片序号，避免整体镜像跳变
  ctx.save();
  ctx.globalAlpha = cfg.alpha * alphaScale;
  let i = 0;
  for (let x = startX; x < w; x += tileW, i++) {
    if ((worldTile + i) % 2 !== 0) {
      ctx.save();
      ctx.translate(x + tileW, h - targetH);
      ctx.scale(-1, 1);
      ctx.drawImage(tinted, 0, 0, tileW, targetH);
      ctx.restore();
    } else {
      ctx.drawImage(tinted, x, h - targetH, tileW, targetH);
    }
  }
  ctx.restore();
}

// 按旅程段落选取三层背景（缺失回退基础 bg），并在段落末段交叉淡入下一段美术。
function drawJourneyBg(
  ctx: CanvasRenderingContext2D, assets: Assets, distanceM: number,
  cameraX: number, tint: [number, number, number], w: number, h: number,
) {
  const base = [assets.bgFar, assets.bgMid, assets.bgNear];
  const { i, t } = journeyPhase(distanceM);
  const fade = Math.max(0, Math.min(1, (t - 0.7) / 0.3)); // 仅段末 30% 交叉淡入
  const keyA = PHASE_ART[i], keyB = PHASE_ART[Math.min(i + 1, PHASE_ART.length - 1)];
  const setA = assets.phaseBg[keyA] ?? [];
  const setB = assets.phaseBg[keyB] ?? [];
  for (let L = 0; L < 3; L++) {
    const imgA = setA[L] ?? base[L];
    const imgB = setB[L] ?? base[L];
    if (!imgA && !imgB) continue;
    if (imgA === imgB || fade < 0.01) {
      if (imgA) drawImageLayer(ctx, imgA, IMG_LAYERS[L], cameraX, tint, w, h, `${keyA}-${L}`);
    } else {
      if (imgA) drawImageLayer(ctx, imgA, IMG_LAYERS[L], cameraX, tint, w, h, `${keyA}-${L}`, 1 - fade);
      if (imgB) drawImageLayer(ctx, imgB, IMG_LAYERS[L], cameraX, tint, w, h, `${keyB}-${L}`, fade);
    }
  }
}

/** 邓林：终章弃杖所化的桃林，近景一排桃树剪影随进程逐渐显现（peach 现）。 */
function drawPeachGrove(ctx: CanvasRenderingContext2D, theme: Theme, cameraX: number, w: number, h: number) {
  const pv = theme.peach;
  if (pv < 0.03) return;
  const baseY = h * 0.80;
  const par = 0.55, spacing = 190;
  const scrolled = cameraX * par;
  const startWx = Math.floor(scrolled / spacing) * spacing;
  ctx.save();
  ctx.globalAlpha = Math.min(1, pv);
  for (let wx = startWx; wx < scrolled + w + spacing; wx += spacing) {
    const x = wx - scrolled;
    const r = ((wx * 2654435761) >>> 0) / 4294967296;
    const trunkH = 26 + r * 20;
    const tx = x + (r * 40 - 20);
    // 树干
    ctx.strokeStyle = 'rgba(46,28,20,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, baseY);
    ctx.lineTo(tx, baseY - trunkH);
    ctx.stroke();
    // 桃花冠：几团粉色花簇
    const clusters = 4 + ((r * 3) | 0);
    for (let c = 0; c < clusters; c++) {
      const rr = ((wx * 40503 + c * 12289) >>> 0) / 4294967296;
      const cx = tx + (rr * 34 - 17);
      const cy = baseY - trunkH - 6 + (rr * 18 - 9);
      const rad = 8 + rr * 7;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, rgb([255, 176, 198], 0.9));
      g.addColorStop(0.7, rgb([232, 132, 164], 0.6));
      g.addColorStop(1, rgb([232, 132, 164], 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  }
  ctx.restore();
}

/** 夜空星子：终章之后（月夜/大荒）随 night 渐显，缓移微茫，天光再启即隐。 */
function drawSkyStars(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number, cameraX: number, time: number) {
  const nv = theme.night;
  if (nv < 0.04) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const drift = cameraX * 0.03;
  for (let i = 0; i < 64; i++) {
    const sx = (((i * 137.5) % w) - (drift % w) + w) % w;
    const sy = ((i * 61.7) % (h * 0.66));
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 1.4 + i * 1.7));
    ctx.fillStyle = `rgba(198,208,236,${(nv * 0.7 * tw).toFixed(3)})`;
    const sz = i % 6 === 0 ? 1.8 : 1;
    ctx.fillRect(sx, sy, sz, sz);
  }
  ctx.restore();
}

export function drawBackground(
  ctx: CanvasRenderingContext2D, cameraX: number, theme: Theme, w: number, h: number,
  assets?: Assets, isTitle?: boolean, time = 0, distanceM = 0,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgb(theme.skyTop));
  sky.addColorStop(1, rgb(theme.skyBottom));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (!isTitle) drawSkyStars(ctx, theme, w, h, cameraX, time); // 夜空星子（在远景剪影之后）

  if (isTitle && assets?.titleArt) {
    const img = assets.titleArt;
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  const useImages = assets && (assets.bgFar || assets.bgMid || assets.bgNear
    || PHASE_KEYS.some(p => assets.phaseBg[p]?.some(Boolean)));
  if (useImages) {
    const tint = theme.fog.map(c => Math.round(c * 0.4)) as [number, number, number];
    drawJourneyBg(ctx, assets, distanceM, cameraX, tint, w, h);
  } else {
    for (const L of PROC_LAYERS) {
      ctx.fillStyle = rgb(theme.fog.map(c => Math.round(c * 0.4)) as [number, number, number], L.alpha);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const wx = x + cameraX * L.par;
        ctx.lineTo(x, h * (L.base + ridge(wx, L.seed) * L.amp));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 景随事迁：终章桃林随叙事显隐（水景/热浪改由段落背景承载，避免虚空浮现横带）
  if (!isTitle) drawPeachGrove(ctx, theme, cameraX, w, h);

  const fog = ctx.createLinearGradient(0, h * 0.6, 0, h);
  fog.addColorStop(0, rgb(theme.fog, 0));
  fog.addColorStop(1, rgb(theme.fog, 0.35));
  ctx.fillStyle = fog;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
}
