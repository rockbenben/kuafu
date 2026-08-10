// GitHub 仓库社交预览图（1280×640）→ docs/images/social-card.png
//
// 它**不是**站点分享卡的另一个尺寸。站点那五张（scripts/og.mjs）是「美术画版
// 压暗 + 叠字」，卖的是一张画；这一张卖的是游戏本身，所以整张图就用游戏自己的
// 画法重画一遍：拂晓的天色取自 render/theme.ts 的 JOURNEY[0]，山影用的是游戏
// 里那三层剪影 PNG（同样的视差高度与透明度），长夜、日轮、龟裂大地的配方直接
// 抄自 render/renderer.ts。看到卡的人看到的就是打开游戏会看到的东西。
//
// 构图只讲一件事：**追不上**。长夜从左边啃过来，日轮钉在右上 0.82 处，夸父在
// 两者之间。右侧那片空天是刻意留的——常规做法会拿光束、粒子、徽章把它填满，
// 但「可望不可及」正是靠这段空白说出来的，填了就没了。
//
// 用法：npm run og   （文案或画版改了才需要重跑；改完记得手工上传到仓库设置）

import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCIAL } from './site-meta.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'public', 'assets');
const FONTS = join(ROOT, 'assets', 'fonts', 'og');
const OUT = join(ROOT, 'docs', 'images', 'social-card.png');

// GitHub 的社交预览图按 2:1 显示，1280×640 是官方推荐值——按这个尺寸出图，
// 上传后不会被裁掉任何一边。
const W = 1280, H = 640;
const PAD = 92;          // 左栏文字的版心
const GROUND = H * 0.80; // 地平线：夸父踩的那条线

// 日轮压得很低、贴着山脊——高悬的小白点会被读成月亮（v1 就是这么翻的车），
// 低日才是「西沉」，也才让夸父与日落在同一条水平视线上，构图只剩「追」这一件事。
const SUN = { x: W * 0.80, y: GROUND - 150, core: 44, halo: 330 };
const NIGHT = W * 0.34;  // 长夜前缘

/**
 * 拂晓启程的天色，取自 src/render/theme.ts 的 JOURNEY[0]。
 *
 * 这里是抄的一份而非 import——那边是 TS，node 脚本读不了。抄本会漂，所以
 * tests/og.test.ts 直接调 themeAt(0) 与这份逐值比对，改了一边就报错。
 */
export const DAWN = {
  skyTop: [66, 60, 92],
  skyBottom: [235, 158, 102],
  fog: [120, 92, 104],
  glow: [255, 226, 182],
};

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// 游戏里三层视差山影的高度占比与透明度（render/background.ts 的 IMG_LAYERS）。
// 照搬是为了让卡上的纵深关系与游戏里一模一样，不是随手调出来的好看数字。
// shift 是这张卡自己的：游戏里三层各按视差滚动，起点天然错开；卡上不滚，若都从
// 0 起铺，mid 与 near 的瓦片折点会撞在同一个 x（≈657）上，叠成一道看得见的竖缝。
// 错开后折点散到各处，读作地形起伏。
const LAYERS = [
  { key: 'far', hFrac: 0.5, alpha: 0.35, shift: 0 },
  { key: 'mid', hFrac: 0.62, alpha: 0.55, shift: -260 },
  { key: 'near', hFrac: 0.78, alpha: 0.8, shift: -470 },
];

function registerFonts() {
  const faces = { Kai: 'social.subset.ttf', Latin: 'en.subset.ttf' };
  for (const [family, file] of Object.entries(faces)) {
    const p = join(FONTS, file);
    if (!existsSync(p)) throw new Error(`缺字体 ${p}——先跑 npm run fonts`);
    if (!GlobalFonts.registerFromPath(p, family)) throw new Error(`注册字体失败: ${p}`);
  }
}

/** 逐字加字距地画一行；返回实际宽度。canvas 没有 letterSpacing，只能自己走。 */
function tracked(ctx, text, x, y, track) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
  return cx - track - x;
}

/**
 * 天色：上紫下金的晨昏渐变（drawBackground 的第一笔）。
 *
 * 渐变必须收在地平线而不是画布底边——游戏里天空占满整个 WORLD_H，暖金本就落在
 * 视野中下部；卡上地面吃掉了下面两成，若照抄 0→H，那点暖金全被埋进土里，天空
 * 从头到尾一片冷紫，日轮悬在冷紫里就被读成月亮（v2 翻的正是这个车）。
 */
function drawSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, rgb(DAWN.skyTop));
  g.addColorStop(1, rgb(DAWN.skyBottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND);
}

/** 一层山影：填色后 destination-in 抠出剪影，再横向铺满（同 tintedLayer）。 */
async function drawRidge(ctx, cfg, tint) {
  const img = await loadImage(join(ART, 'bg', `bg-dawn-${cfg.key}.webp`));
  const off = createCanvas(img.width, img.height);
  const oc = off.getContext('2d');
  oc.fillStyle = rgb(tint);
  oc.fillRect(0, 0, img.width, img.height);
  oc.globalCompositeOperation = 'destination-in';
  oc.drawImage(img, 0, 0);

  // 山脚锚在地平线略下方：游戏里平台会盖住各层的底边，卡上照做，山才像立在
  // 地上而不是浮在画面下缘。
  const targetH = H * (1 - cfg.hFrac);
  const bottom = GROUND + 24;
  // 隔块镜像——这几张图左右边并不无缝，镜像后相邻瓦片共用同一条边才接得上
  // （游戏里这么做的原因不是防复读，是这个）。直接平铺反而会拼出硬缝。
  const tileW = img.width * (targetH / img.height);
  ctx.save();
  ctx.globalAlpha = cfg.alpha;
  const start = cfg.shift % (tileW * 2);
  for (let x = start, i = 0; x < W; x += tileW, i++) {
    if (i % 2) {
      ctx.save();
      ctx.translate(x + tileW, bottom - targetH);
      ctx.scale(-1, 1);
      ctx.drawImage(off, 0, 0, tileW, targetH);
      ctx.restore();
    } else {
      ctx.drawImage(off, x, bottom - targetH, tileW, targetH);
    }
  }
  ctx.restore();
}

/** 被追逐的日轮：光晕 + 亮核，lighter 叠加（renderer.ts 的配方）。 */
function drawSun(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 低日的辉光要漫得开：日落时天是被烧亮的一大片，不是一颗贴上去的圆片。
  const hg = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, SUN.halo);
  hg.addColorStop(0, 'rgba(255,196,116,0.55)');
  hg.addColorStop(0.18, 'rgba(255,178,100,0.3)');
  hg.addColorStop(0.5, rgb(DAWN.glow, 0.12));
  hg.addColorStop(1, rgb(DAWN.glow, 0));
  ctx.fillStyle = hg;
  ctx.fillRect(SUN.x - SUN.halo, SUN.y - SUN.halo, SUN.halo * 2, SUN.halo * 2);
  // 亮核偏暖：游戏里那个近乎纯白的核在动态中没问题，定格成一张图就变成月亮。
  // 白只留在最中心一点，外圈立刻转向日晕的琥珀色。
  const cg = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, SUN.core);
  cg.addColorStop(0, 'rgba(255,250,235,0.98)');
  cg.addColorStop(0.32, 'rgba(255,231,178,0.95)');
  cg.addColorStop(0.72, 'rgba(255,186,104,0.7)');
  cg.addColorStop(1, rgb(DAWN.glow, 0));
  ctx.fillStyle = cg;
  ctx.fillRect(SUN.x - SUN.core, SUN.y - SUN.core, SUN.core * 2, SUN.core * 2);
  ctx.restore();
}

/**
 * 吞噬之暗·长夜：从左边啃过来的那堵墙（renderer.ts 的同一套渐变与触手）。
 *
 * 它同时替掉了旧卡那道纯粹为了垫字而刷的褐色遮罩——同样让左栏够暗、字能读，
 * 但这一块暗是游戏里真实存在的东西，不是修图。
 */
function drawNight(ctx) {
  const seg = 10;
  // 前缘的起伏很浅：v1 照搬了游戏里 ±36px 的涌动触手，定格成静帧后读作一块
  // 被撕烂边的 UI 面板。动的时候才是触手，不动就只需要一道不齐的边。
  const reach = i => NIGHT + 15 * Math.sin(i * 1.15 + 0.4) + 8 * Math.sin(i * 2.7);

  // 整块暗只画一次：形状是起伏的前缘，填色是横向长衰减。v1 在长衰减之上又叠了
  // 两块几乎不透明的多边形，把衰减整个盖死，于是左边成了一坨死黑。
  const g = ctx.createLinearGradient(0, 0, NIGHT + 26, 0);
  g.addColorStop(0, 'rgba(2,1,6,0.98)');
  g.addColorStop(0.44, 'rgba(6,4,16,0.9)');
  g.addColorStop(0.78, 'rgba(15,11,32,0.58)');
  g.addColorStop(1, 'rgba(18,14,38,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 0; i <= seg; i++) ctx.lineTo(reach(i), (H * i) / seg);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // 游戏里前缘还有一排冷月色光点。这里去掉了：它们在静帧上沿着前缘连成一条
  // 从头到脚的浅色竖带，读作镜头脏了，而不是"夜的边缘泛着冷光"。会动的东西
  // 不一定能定格——起伏的边本身已经够说明这不是随手刷的一块暗。
}

/** 龟裂大地：暗赭土体 + 受晒暖壳 + 夕照顶缘（renderer.ts 画平台的三步）。 */
function drawGround(ctx) {
  ctx.fillStyle = rgb([40, 26, 13]);
  ctx.fillRect(0, GROUND, W, H - GROUND);

  const crust = ctx.createLinearGradient(0, GROUND, 0, GROUND + 30);
  crust.addColorStop(0, 'rgba(112,70,34,0.5)');
  crust.addColorStop(1, 'rgba(112,70,34,0)');
  ctx.fillStyle = crust;
  ctx.fillRect(0, GROUND, W, 30);

  // 夕照顶缘：亮度跟着日轮走，离日越远越暗。一道从头亮到尾的等亮直线会读作
  // 「一根分隔条」，而不是「被低日照亮的地棱」——光得有来处。
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, rgb(DAWN.glow, 0.05));
  edge.addColorStop(SUN.x / W, rgb(DAWN.glow, 0.6));
  edge.addColorStop(1, rgb(DAWN.glow, 0.14));
  ctx.fillStyle = edge;
  ctx.fillRect(0, GROUND, W, 1.4);
}

/** 两端渐隐的笔意细线，与游戏内 brushRule 同调。 */
function brushRule(ctx, x, y, w) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(255,220,150,0.75)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, 1.6);
}

/** 暗角：只压四角，克制（renderer.ts 的 vignette）。 */
function vignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * 左栏题名。字距刻意拉开——游戏里每一句古籍引文都是这么排的（见截图里的
 * 「夸 父 与 日 逐 走」），读作碑刻而非 logo。
 */
function drawType(ctx) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 眉题：给不读中文的人一个抓手。宋体骨架，与楷体主标形成两种「写」法。
  ctx.font = '19px "Latin"';
  ctx.fillStyle = rgb(DAWN.glow, 0.62);
  tracked(ctx, SOCIAL.eyebrow, PAD, 160, 8.5);

  // 题名：楷体，暖光晕托底（日光打在字上）
  ctx.font = '124px "Kai"';
  ctx.shadowColor = 'rgba(255,190,110,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#f7ecd8';
  const titleW = tracked(ctx, SOCIAL.title, PAD, 268, 26);
  ctx.shadowBlur = 0;

  brushRule(ctx, PAD, 306, titleW + 74);

  ctx.font = '38px "Kai"';
  ctx.fillStyle = rgb([255, 220, 150], 0.95);
  tracked(ctx, SOCIAL.sub, PAD, 366, 14);

  ctx.font = '27px "Kai"';
  ctx.fillStyle = 'rgba(247,236,216,0.84)';
  tracked(ctx, SOCIAL.line, PAD, 418, 3);

  // 页脚落在龟裂大地上，暗底足够托住
  ctx.font = '19px "Kai"';
  ctx.fillStyle = 'rgba(240,228,210,0.5)';
  tracked(ctx, SOCIAL.foot, PAD, H - 26, 1.2);
}

/**
 * 夸父：游戏里那张前冲剪影（player-dash.webp，本就带速度线）。
 *
 * 位置卡在长夜前缘与日轮之间——身后是追上来的夜，身前是追不上的日，两头都够
 * 不着。这是整个神话唯一要画的一件事。
 */
async function drawRunner(ctx) {
  // 用奔跑帧而非前冲帧：player-dash 是 2.8:1 的横向长条，摆进来正好把右边那片
  // 空天吃掉一半——而那片空白就是这张卡要说的话。奔跑帧 0.66:1，站得住，也正是
  // 玩的时候九成时间看到的姿势。
  // 够高，头与杖尖要探出近景的树线：黑剪影压在同样是黑的树线上就糊成一团，
  // 得有一段轮廓落在被日照亮的天上才读得出是个人。
  const img = await loadImage(join(ART, 'sprites', 'player-run-0.webp'));
  const h = 178, w = img.width * (h / img.height);
  const x = W * 0.395, y = GROUND - h + 4; // +4：脚陷进浮土一点，不像贴上去的
  ctx.drawImage(img, x, y, w, h);
}

async function main() {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawSky(ctx);
  const tint = DAWN.fog.map(c => Math.round(c * 0.4)); // 山影色：雾色压到四成
  for (const cfg of LAYERS) await drawRidge(ctx, cfg, tint);
  drawSun(ctx); // 在山影之后：低日的辉光要漫过山脊，才像沉在地平线上而非贴在天上

  // 地面附近的雾（drawBackground 收尾那道），把山脚与大地接上
  const fog = ctx.createLinearGradient(0, H * 0.6, 0, H);
  fog.addColorStop(0, rgb(DAWN.fog, 0));
  fog.addColorStop(1, rgb(DAWN.fog, 0.35));
  ctx.fillStyle = fog;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  drawGround(ctx);
  await drawRunner(ctx);
  drawNight(ctx);
  vignette(ctx);
  drawType(ctx);

  const buf = await canvas.encode('png');
  writeFileSync(OUT, buf);
  console.log(`  docs/images/social-card.png  ${W}×${H}  ${(buf.length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
