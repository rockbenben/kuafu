// 生成五语种的分享卡（1200×630），沿用 src/share.ts 的合成思路：
// 干净画版 → 压暗遮罩 → 叠字。
//
// 刻意不进 npm run build：CI（Linux）没有 CJK 字体，构建期生成会静默产出
// 豆腐块。这里用 assets/fonts/og/ 下自带的子集字体，产物提交进仓库，
// 谁在哪台机器上跑都一样。
//
// 用法：npm run og   （文案或画版改了才需要重跑）

import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from './site-meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATE = join(ROOT, 'public', 'assets', 'title-art.webp'); // 无字画版
const FONTS = join(ROOT, 'assets', 'fonts', 'og');
const OUT = join(ROOT, 'public', 'og');

const W = 1200, H = 630;
const PAD = 100;

function registerFonts() {
  for (const s of SITE) {
    const p = join(FONTS, `${s.id}.subset.ttf`);
    if (!existsSync(p)) throw new Error(`缺字体 ${p}——先跑 npm run fonts`);
    if (!GlobalFonts.registerFromPath(p, `OG-${s.id}`)) throw new Error(`注册字体失败: ${p}`);
  }
}

/** 画版铺满并压暗；左侧再加一道渐变，保证叠字处足够暗、字能读。 */
function drawBackdrop(ctx, plate) {
  const sc = Math.max(W / plate.width, H / plate.height);
  const w = plate.width * sc, h = plate.height * sc;
  ctx.drawImage(plate, (W - w) / 2, (H - h) / 2, w, h);

  ctx.fillStyle = 'rgba(20,10,6,0.34)';
  ctx.fillRect(0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, W * 0.72, 0);
  g.addColorStop(0, 'rgba(16,8,5,0.90)');
  g.addColorStop(0.55, 'rgba(16,8,5,0.55)');
  g.addColorStop(1, 'rgba(16,8,5,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** 两端渐隐的笔意细线，与游戏内 brushRule 同调。 */
function brushRule(ctx, x, y, w) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(255,220,150,0.75)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, 1.6);
}

/** 超宽则降字号，保证长文案（英/韩）不冲出卡面。 */
function fitFont(ctx, text, family, basePx, maxWidth) {
  let px = basePx;
  ctx.font = `${px}px "${family}"`;
  while (ctx.measureText(text).width > maxWidth && px > basePx * 0.6) {
    px -= 1;
    ctx.font = `${px}px "${family}"`;
  }
  return px;
}

function renderCard(plate, meta) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const fam = `OG-${meta.id}`;
  const maxW = W - PAD * 2;

  drawBackdrop(ctx, plate);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 题名
  ctx.shadowColor = 'rgba(255,190,110,0.45)';
  ctx.shadowBlur = 26;
  fitFont(ctx, meta.cardTitle, fam, 92, maxW * 0.78);
  ctx.fillStyle = '#f7ecd8';
  ctx.fillText(meta.cardTitle, PAD, 292);
  ctx.shadowBlur = 0;

  brushRule(ctx, PAD, 330, Math.min(maxW * 0.5, ctx.measureText(meta.cardTitle).width + 60));

  // 副题
  fitFont(ctx, meta.cardSub, fam, 40, maxW * 0.72);
  ctx.fillStyle = 'rgba(255,220,150,0.95)';
  ctx.fillText(meta.cardSub, PAD, 392);

  // 标语
  fitFont(ctx, meta.cardTagline, fam, 26, maxW * 0.68);
  ctx.fillStyle = 'rgba(247,236,216,0.86)';
  ctx.fillText(meta.cardTagline, PAD, 452);

  // 页脚
  fitFont(ctx, meta.cardFooter, fam, 20, maxW * 0.5);
  ctx.fillStyle = 'rgba(240,228,210,0.5)';
  ctx.fillText(meta.cardFooter, PAD, 566);

  return canvas;
}

async function main() {
  registerFonts();
  mkdirSync(OUT, { recursive: true });
  const plate = await loadImage(PLATE);
  // JPEG 而非 WebP：Facebook / LinkedIn / 微信 的抓取器至今不认 WebP 的
  // og:image，分享出去就是没图（X 认，但不能只顾 X）。也不是 PNG——这是张
  // 照片式画版，编成 PNG 要 690 KB，是 JPEG 88 的八倍，而卡面既无透明也无
  // 大片纯色，PNG 一分好处都拿不到。体积从 44 KB 涨到 80 KB，认栽。
  for (const s of SITE) {
    const buf = await renderCard(plate, s).encode('jpeg', 88);
    writeFileSync(join(OUT, `${s.id}.jpg`), buf);
    console.log(`  og/${s.id}.jpg  ${(buf.length / 1024).toFixed(1)} KB`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
