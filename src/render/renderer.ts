import type { Game } from '../game/game';
import type { Particles } from '../engine/particles';
import { themeAt, rgb, posHash as hash } from './theme';
import { drawBackground } from './background';
import { drawProps } from './props';
import { VIEW_W, WORLD_H, PLAYER_H, RUN_SPEED, DEATH_FADE, DEATH_BLACKOUT, DYING_TIME } from '../game/constants';
import { EMPTY_ASSETS, type Assets } from './assets';
import type { CameraFX } from './fx';
import type { Popups } from './popups';
import { fontHud } from './strings';
import { uiLetterbox, clientToWorld } from './viewport';
import { dangerLevel } from '../game/darkness';

const RUN_PX_PER_FRAME = 22; // 每前进这么多像素切一帧奔跑动画（距离驱动，脚不打滑）
const SPRITE_CHAR_PX = 220;  // 玩家素材"头到脚"归一高度（与 art/process.py CHAR_PX 一致）
const NO_FX: CameraFX = { shakeX: 0, shakeY: 0, extraCamX: 0, zoom: 1, flash: 0 };

/**
 * 坠亡定格回放时镜头下带的距离。
 *
 * 死亡判定是 `pos.y > WORLD_H + 64`，人物落点因此恒在世界底之下一点点
 * （再往下最多多掉一帧，MAX_FALL/60 ≈ 15px）。把它压回屏幕约七成高的位置，
 * 既完整露出人物，又还留着上方那道吞了他的沟——只看见人不看见沟，就说不清死因了。
 */
/**
 * 死亡姿态：让人物倒下去。
 *
 * 此前死亡只是把最后一帧冻住，人物保持着奔跑或腾空的姿势僵在半空——看着不像
 * 死了，像游戏卡住了。这里绕脚跟把他放倒，坠亡则改成持续翻滚（人还在下落，
 * 「倒地」无从谈起）。
 *
 * 调用时 ctx 原点已在脚底中心、facing 的镜像也已应用，所以正角度恒为「向前扑倒」，
 * 朝左跑时会自动镜像成向左倒，不必自己判朝向。
 */
export function deathPose(
  ctx: Pick<CanvasRenderingContext2D, 'rotate' | 'translate'>,
  cause: string | null,
  progress: number, // 0→1 回放进度
) {
  const k = Math.max(0, Math.min(1, progress));
  if (cause === 'fall') {
    ctx.rotate(k * 3.2); // 坠落翻滚，越掉越偏
    return;
  }
  // 前 1/4 段时间里扑倒到位，之后定住不动（ease-out，收尾不抖）
  const t = Math.min(1, k * 4);
  ctx.rotate((1 - (1 - t) * (1 - t)) * 1.42);
}

export function fallCamDrop(playerY: number): number {
  const want = playerY - WORLD_H * 0.72;
  return Math.max(0, Math.min(WORLD_H * 0.32, want));
}

/**
 * 单帧形象的程序化律动。
 *
 * 内置夸父有 4 帧跑循环，换成预设或玩家自己传的图就只剩一张——不补动，跑起来
 * 是一块木板在平移。给每个形象再画 3 帧跑循环治标不治本：玩家上传的图永远只有
 * 一张，那条路走不通。所以改成对**任意单帧**施加变换，谁传的图都能动。
 *
 * 调用时 ctx 原点已在角色脚底中心、facing 的镜像也已应用，所以缩放/旋转都绕脚底
 * 发生（人不会在空中打转），切变方向也自动跟着朝向翻转。
 *
 * 幅度全部压在 10% 以内：这是「看得出在动」与「像果冻」之间的界线，别放大。
 */
export function singleFrameMotion(
  ctx: Pick<CanvasRenderingContext2D, 'translate' | 'rotate' | 'scale' | 'transform'>,
  p: { dashing: boolean; onGround: boolean; vel: { y: number } },
  running: boolean,
  phasePx: number,
  drawH: number,
  speedK: number, // 0..1，当前水平速度 / RUN_SPEED
) {
  if (p.dashing) {
    ctx.transform(1, 0, -0.2, 1, 0, 0); // 上身前倾切变
    ctx.scale(1.1, 0.95);               // 横向拉长，压出速度感
    return;
  }
  if (!p.onGround) {
    // 腾空拉伸：越快越修长，落地帧自然收回（squash & stretch 的 stretch 半边）
    const k = Math.min(1, Math.abs(p.vel.y) / 800);
    ctx.scale(1 - k * 0.06, 1 + k * 0.08);
    return;
  }
  if (!running) return; // 站定时相位不推进，再施加就会歪着定住
  // 奔跑：距离驱动的正弦步频，只保留**绕高枢轴的单一摆动**。
  //
  // 这里是三轮实测逼出来的。整体变换动不了肢体，凡是加在整体上的效果都会同等
  // 地作用到头上，而头一动就晃眼——彩色形象尤其明显：黑剪影没有内部特征点，
  // 头挪几个像素看不出来，卡通脸上的眼睛一动就被察觉。量化下来（角色实际
  // 只有 47.6px 高）：
  //   绕脚底旋转 + 切变     头动 ≈ 脚摆，整个上半身在甩
  //   绕肩(0.7) + 颠簸 + 拉伸  头动 2.4px vs 脚摆 2.5px —— 仍是 1:1，白改
  //   绕 0.88 单摆（本方案）   头动 1.3px vs 脚摆 4.2px —— 1:3.2
  // 竖直颠簸(bob)与挤压拉伸(scale)贡献的全是**头的上下位移**，而人眼对垂直
  // 跳动最敏感，所以两者一并砍掉；跑动感全交给绕近头顶的摆动，腿摆幅反而更大。
  //
  // 速度同时进两处：相位本就按位移累积（跑得快步频自然快），这里再让**幅度与
  // 前倾**跟上——否则起步慢跑和全速疾奔长得一模一样，加速过程没有体感。
  // 前倾是随速度单调变化的静态量、不随步频摆动，所以只增加速度感、不晃眼；
  // 全速 0.06 也刻意小于冲刺的 0.2，两种状态才拉得开层次。
  const k = Math.max(0, Math.min(1, speedK));
  const s = Math.sin((phasePx / RUN_PX_PER_FRAME) * Math.PI);
  const pivotY = -drawH * 0.88; // 近头顶：让头落在旋转中心附近
  ctx.transform(1, 0, -0.06 * k, 1, 0, 0); // 越快越前倾
  ctx.translate(0, pivotY);
  ctx.rotate(s * 0.1 * (0.4 + 0.6 * k));   // 慢跑小碎步，全速大摆
  ctx.translate(0, -pivotY);
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private trail: { x: number; y: number; a: number; facing: 1 | -1 }[] = [];
  private runPhasePx = 0;
  private lastPlayerX: number | null = null;
  private camDropY = 0;        // 坠亡回放的镜头下带量（平滑推进，见 render）
  private lastRenderT = 0;     // 上一帧时刻，供 render 内部求帧间隔
  private vw = VIEW_W;      // 当前有效视口宽度（按窗口比例自适应，铺满宽屏）

  constructor(private canvas: HTMLCanvasElement, private assets: Assets = EMPTY_ASSETS) {
    this.ctx = canvas.getContext('2d')!;
  }

  render(game: Game, particles: Particles, camFx: CameraFX = NO_FX, popups?: Popups) {
    const { ctx, canvas, assets } = this;
    const t = performance.now() / 1000;

    // 限制像素密度上限：高 DPR 手机若按 3x 渲染整屏世界会吃满 GPU 掉帧，封顶 2x
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    }
    // 有效视口宽度：按窗口宽高比自适应，宽屏铺满、多显示世界（消掉两侧黑边）
    // 防窗口塌缩：height 为 0 时回退基准高，避免除零得 NaN 污染当帧变换
    const ch = canvas.height || WORLD_H;
    const VW = Math.max(820, Math.min(1400, WORLD_H * canvas.width / ch));
    this.vw = VW;
    // 动态相机：缩放（死亡拉近）+ 屏幕震动 + 坠亡回放的纵向下带
    const baseScale = Math.min(canvas.width / VW, canvas.height / WORLD_H);
    const zscale = baseScale * camFx.zoom;
    // 坠崖判定是「掉出世界底 64px」，所以定格那一刻人物早已在画面之外，
    // 回放只剩一道空沟、看不见自己。把镜头往下带一截，让尸身重新入画。
    // 只对 fall 生效：撞刺/被噬/被长夜追上时人物本就在原地，移了反而丢掉现场。
    //
    // 必须平滑地推下去：直接赋值等于「啪」地切了个机位，读作穿帮而不是运镜。
    // 这里用帧间隔自行插值——render 拿不到 dt，就地从 performance.now 求。
    const dtR = Math.min(0.05, Math.max(0, t - this.lastRenderT));
    this.lastRenderT = t;
    const camDropTarget = game.dying && game.deathCause === 'fall' ? fallCamDrop(game.player.pos.y) : 0;
    this.camDropY += (camDropTarget - this.camDropY) * Math.min(1, dtR * 6);
    if (camDropTarget === 0 && this.camDropY < 0.5) this.camDropY = 0; // 收敛，免得永远拖个尾巴
    const camDropY = this.camDropY;
    const offX = (canvas.width - VW * zscale) / 2 + camFx.shakeX * baseScale;
    const offY = (canvas.height - WORLD_H * zscale) / 2 + camFx.shakeY * baseScale - camDropY * zscale;
    ctx.setTransform(zscale, 0, 0, zscale, offX, offY);

    const theme = themeAt(game.score.distanceM);
    const cam = game.cameraX + camFx.extraCamX; // 相机前瞻
    drawBackground(ctx, cam, theme, VW, WORLD_H, assets, game.state === 'title', t, game.score.distanceM);

    // 前景装饰景物层（仅游玩时，标题用美术图）
    if (game.state !== 'title') drawProps(ctx, assets, game.score.distanceM, cam, theme, VW, WORLD_H);

    // 被追逐的太阳：始终在前方（右上天际），可望不可及。日轮 + 光晕 + 呼吸日冕
    // （标题页用美术图里画好的日，不叠代码日，避免双日）
    if (game.state !== 'title') {
      const sunX = VW * 0.82;
      // 日轮随旅程西沉：拂晓高悬 → 终章日暮，扣合「与日逐走，日终不可及」
      const prog = Math.max(0, Math.min(1, game.score.distanceM / 2000));
      const sunY = WORLD_H * (0.22 + 0.2 * prog) + Math.sin(t * 0.3) * 6;
      const core = 34;
      const halo = 150 + 20 * Math.sin(t * 0.7);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, halo);
      hg.addColorStop(0, rgb(theme.glow, 0.5));
      hg.addColorStop(0.25, rgb(theme.glow, 0.2));
      hg.addColorStop(1, rgb(theme.glow, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(sunX - halo, sunY - halo, halo * 2, halo * 2);
      const cg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, core);
      cg.addColorStop(0, 'rgba(255,250,235,0.95)');
      cg.addColorStop(0.7, rgb(theme.glow, 0.85));
      cg.addColorStop(1, rgb(theme.glow, 0));
      ctx.fillStyle = cg;
      ctx.fillRect(sunX - core, sunY - core, core * 2, core * 2);
      ctx.restore();
    }

    // 背景光束（god rays）：从天顶斜射的柔和光柱，明显地缓慢摆动 + 呼吸闪烁，读作"活的光"
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beams = 3;
    for (let i = 0; i < beams; i++) {
      // 摆动周期 ~9s、幅度大，几秒内肉眼可见移动；宽度也随之伸缩
      const drift = Math.sin(t * 0.7 + i * 2.1) * 90 + Math.sin(t * 0.31 + i) * 40;
      const topX = VW * (0.22 + 0.28 * i) + drift;
      const width = 130 + 45 * Math.sin(t * 0.5 + i * 1.4);
      const skew = 130 + 60 * Math.sin(t * 0.23 + i);
      // 呼吸闪烁：慢基调叠一层稍快微闪，亮度明显起伏
      const alpha = (0.028 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 2.1)))
        * (0.75 + 0.25 * Math.sin(t * 1.7 + i));
      const g = ctx.createLinearGradient(topX, 0, topX + skew, WORLD_H * 0.9);
      g.addColorStop(0, rgb(theme.glow, alpha));
      g.addColorStop(0.6, rgb(theme.glow, alpha * 0.35));
      g.addColorStop(1, rgb(theme.glow, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(topX - width / 2, 0);
      ctx.lineTo(topX + width / 2, 0);
      ctx.lineTo(topX + skew + width, WORLD_H * 0.9);
      ctx.lineTo(topX + skew - width, WORLD_H * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 标题页到此为止：只呈美术图 + 天光 + 暗角。
    //
    // 此前底下那局「尚未开始」的世界也照画不误，而它从未 update 过——地形只
    // 生成了开局那一块，于是标题页左下角永远糊着一道齐刷刷断掉的土坡，坡上
    // 悬着几粒够不着的日光点和一个站着不动的小人，看着像渲染坏了。美术图里
    // 本来就有大地与落日，再压一层演示地形只会打架。
    if (game.state === 'title') {
      this.vignette(ctx, VW);
      if (popups) popups.draw(ctx, cam, `16px ${fontHud()}`); // 秘籍提示可在标题页触发
      return;
    }

    // 光点辉光（附加混合 + 轻脉动，收敛尺寸）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of game.level.motes) {
      if (m.taken) continue;
      const x = m.x - cam, y = m.y;
      if (x < -50 || x > VW + 50) continue;
      const pulse = 1 + 0.2 * Math.sin(t * 4 + x * 0.05);
      const rad = 10 * pulse;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgb(theme.glow, 0.85));
      g.addColorStop(0.5, rgb(theme.glow, 0.3));
      g.addColorStop(1, rgb(theme.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.fillStyle = rgb([255, 255, 245], 0.9);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 平台：夸父焦土——龟裂大地（无缝暗土体 + 受晒暖壳 + 泥板龟裂 + 夕照顶缘）
    const solids = game.level.solids;
    // 1) 土体：扁平暗赭色统一铺底——堆叠的多块共用一色，杜绝分层缝
    ctx.fillStyle = rgb([40, 26, 13]);
    for (const s of solids) {
      const x = s.x - cam;
      if (x + s.w < -4 || x > VW + 4) continue;
      ctx.fillRect(x, s.y, s.w, s.h);
    }
    // 2) 深处裂隙：稀疏、断续、只在土体中下部——读作干裂大地，不干扰顶缘
    ctx.strokeStyle = 'rgba(14,8,3,0.45)';
    ctx.lineWidth = 1.4;
    for (const s of solids) {
      const x = s.x - cam;
      if (x + s.w < -4 || x > VW + 4) continue;
      if (s.h < 24) continue;                 // 薄板不加体裂
      ctx.save();                             // 裁剪到本块，避免裂纹越界成虚空横线
      ctx.beginPath(); ctx.rect(x, s.y, s.w, s.h); ctx.clip();
      for (let wx = Math.ceil(s.x / 72) * 72; wx < s.x + s.w; wx += 72) {
        const h = hash(wx), h2 = hash(wx + 7), h3 = hash(wx + 13);
        if (h3 < 0.32) continue;              // 约三成位置无裂，打散规律
        const jx = wx - cam + (h * 12 - 6);
        const top = s.y + s.h * 0.42 + h2 * 8; // 从中下部起裂，远离顶缘
        const len = s.h * 0.32;
        ctx.beginPath();
        ctx.moveTo(jx, top);
        ctx.lineTo(jx + (h2 * 9 - 4.5), top + len * 0.5);
        ctx.lineTo(jx + (h * 7 - 3.5), top + len);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 3) 暴露顶面：受晒暖壳（渐隐入暗体，无缝）+ 疏落龟裂 + 夕照顶缘（仅未被覆盖处）
    for (const s of solids) {
      const x = s.x - cam;
      if (x + s.w < -4 || x > VW + 4) continue;
      const covered = solids.some(o =>
        o !== s && Math.abs((o.y + o.h) - s.y) < 1 && o.x < s.x + s.w && o.x + o.w > s.x);
      if (covered) continue;
      const crust = Math.min(12, s.h);
      ctx.save();                              // 裁剪到本块，暖壳与龟裂皆不越界
      ctx.beginPath(); ctx.rect(x, s.y, s.w, s.h); ctx.clip();
      // 暖壳：受晒表土，向下渐隐至透明（露出统一暗体，避免硬边分层）
      const cg = ctx.createLinearGradient(0, s.y, 0, s.y + crust + 26);
      cg.addColorStop(0, rgb([138, 90, 50], 0.95));
      cg.addColorStop(crust / (crust + 26), rgb([84, 54, 28], 0.55));
      cg.addColorStop(1, rgb([40, 26, 13], 0));
      ctx.fillStyle = cg;
      ctx.fillRect(x, s.y, s.w, crust + 26);
      // 龟裂：以错落短横缝为主、偶见短竖缝，交织成泥板；低透明、不规则
      ctx.strokeStyle = 'rgba(24,13,6,0.34)';
      ctx.lineWidth = 1;
      for (let wx = Math.floor(s.x / 40) * 40; wx < s.x + s.w; wx += 40) {
        const h = hash(wx + 3), h2 = hash(wx + 9);
        const px = wx - cam;
        const hy = s.y + 3 + h2 * (crust - 2);   // 横缝错落切块
        ctx.beginPath();
        ctx.moveTo(px - 4, hy);
        ctx.lineTo(px + 18 + h * 12, hy + (h * 3 - 1.5));
        ctx.stroke();
        if (h > 0.55) {                          // 仅少数位置有短竖缝，避免竖条纹
          ctx.beginPath();
          ctx.moveTo(px + 10 + h * 8, s.y + 2);
          ctx.lineTo(px + 10 + h * 8 + (h2 * 4 - 2), hy);
          ctx.stroke();
        }
      }
      // 夕照受光顶缘
      ctx.fillStyle = rgb(theme.glow, 0.42);
      ctx.fillRect(x, s.y, s.w, 2);
      ctx.fillStyle = rgb([255, 190, 120], 0.14);
      ctx.fillRect(x, s.y + 2, s.w, 1);
      ctx.restore();
    }
    // 尖刺：暖调深色 + 受光锋
    for (const sp of game.level.spikes) {
      const x = sp.x - cam;
      if (x + sp.w < 0 || x > VW) continue;
      ctx.fillStyle = '#160d0b';
      ctx.beginPath();
      ctx.moveTo(x, sp.y + sp.h);
      ctx.lineTo(x + sp.w / 2, sp.y - sp.h);
      ctx.lineTo(x + sp.w, sp.y + sp.h);
      ctx.closePath();
      ctx.fill();
      // 受光边（左锋暖光）
      ctx.strokeStyle = rgb(theme.glow, 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, sp.y + sp.h);
      ctx.lineTo(x + sp.w / 2, sp.y - sp.h);
      ctx.stroke();
    }

    // 甘泉水源（焦土中一滴清水，饮之续力=补充冲刺）：蓝色水滴 + 冷光晕 + 高光
    for (const c of game.level.crystals) {
      if (c.taken) continue;
      const x = c.x - cam, y = c.y + Math.sin(t * 3 + x * 0.03) * 1.5;
      if (x < -40 || x > VW + 40) continue;
      // 冷光晕（附加）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cr = 13 + 3 * Math.sin(t * 5);
      const cg = ctx.createRadialGradient(x, y, 0, x, y, cr);
      cg.addColorStop(0, 'rgba(140,200,255,0.4)');
      cg.addColorStop(1, 'rgba(140,200,255,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(x - cr, y - cr, cr * 2, cr * 2);
      ctx.restore();
      // 水滴：圆肚 + 尖顶
      ctx.beginPath();
      ctx.arc(x, y + 2, 6, 0, Math.PI * 2);
      ctx.moveTo(x - 4.5, y - 1);
      ctx.lineTo(x, y - 10);
      ctx.lineTo(x + 4.5, y - 1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,185,255,0.4)';
      ctx.fill();
      ctx.strokeStyle = rgb([185, 220, 255], 0.95);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x - 2, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 小怪
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const x = e.x - cam;
      if (x < -60 || x > VW + 60) continue;
      if (e.kind === 'walker') {
        const sprite = assets.enemyWalker;
        if (sprite) {
          const drawH = e.h * 1.4;
          const drawW = sprite.width * (drawH / sprite.height);
          // 行走摆动：按位置驱动的上下颠+横向挤压（waddle），脚落地节奏
          const wob = Math.sin(e.x * 0.28);
          const bob = -Math.abs(wob) * 3;          // 落脚时下沉
          const sqx = 1 + wob * 0.06;              // 左右挤压
          const sqy = 1 - Math.abs(wob) * 0.05;
          ctx.save();
          ctx.translate(x + e.w / 2, e.y + e.h + bob);
          if (e.dir === 1) ctx.scale(-1, 1);
          ctx.scale(sqx, sqy);
          ctx.drawImage(sprite, -drawW / 2, -drawH, drawW, drawH);
          ctx.restore();
        } else {
          ctx.fillStyle = '#06060a';
          ctx.beginPath();
          ctx.roundRect(x, e.y, e.w, e.h, 5);
          ctx.fill();
          ctx.fillStyle = rgb([255, 170, 80]);
          const eyeX = e.dir === 1 ? x + e.w - 7 : x + 4;
          ctx.fillRect(eyeX, e.y + 5, 3, 3);
        }
      } else {
        const cx = x + e.w / 2, cy = e.y + e.h / 2;
        const flap = Math.sin(e.phase * 4);
        const sprite = flap > 0 ? assets.enemyFlyerUp : assets.enemyFlyerDown;
        if (sprite) {
          const drawH = e.h * 1.8;
          const drawW = sprite.width * (drawH / sprite.height);
          // 扑翼：竖向轻微伸缩，让振翅更有生气
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, 1 + flap * 0.12);
          ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        } else {
          const dy = flap * 6;
          ctx.fillStyle = '#06060a';
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy);
          ctx.lineTo(cx - 16, cy - 8 + dy);
          ctx.lineTo(cx - 4, cy + 4);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx + 4, cy);
          ctx.lineTo(cx + 16, cy - 8 + dy);
          ctx.lineTo(cx + 4, cy + 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(cx - 4, cy - 4, 8, 8);
          ctx.fillStyle = rgb([255, 170, 80]);
          ctx.fillRect(cx + 2, cy - 1, 2, 2);
        }
      }
    }

    // 玩家残影（冲刺/跨步时高亮拖尾，附加发光；跨步更盛）
    const p = game.player;
    if (p.dashing || p.striding) this.trail.push({ x: p.pos.x, y: p.pos.y, a: p.striding ? 1 : 0.6, facing: p.facing });
    this.trail = this.trail.filter(tr => (tr.a -= 0.045) > 0);
    if (this.trail.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const tr of this.trail) {
        ctx.fillStyle = rgb(theme.glow, tr.a * (p.striding ? 0.7 : 0.5));
        const pad = p.striding ? 4 : 0;
        ctx.fillRect(tr.x - cam - pad, tr.y - pad, p.rect.w + pad * 2, p.rect.h + pad * 2);
      }
      ctx.restore();
    }

    // 无敌光环（跨步后短暂无敌）：玩家周身金色脉动辉光，随剩余时间淡出
    if (p.invulnFrac > 0 && !p.striding) {
      const cx0 = p.pos.x - cam + p.rect.w / 2, cy0 = p.pos.y + p.rect.h / 2;
      const pulse = 0.6 + 0.4 * Math.sin(t * 12);
      const aura = (26 + 6 * Math.sin(t * 8)) * (0.6 + 0.4 * p.invulnFrac);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ag = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, aura);
      ag.addColorStop(0, rgb(theme.glow, 0.45 * p.invulnFrac * pulse));
      ag.addColorStop(0.6, rgb(theme.glow, 0.18 * p.invulnFrac * pulse));
      ag.addColorStop(1, rgb(theme.glow, 0));
      ctx.fillStyle = ag;
      ctx.fillRect(cx0 - aura, cy0 - aura, aura * 2, aura * 2);
      ctx.restore();
    }

    // 速度线（冲刺或高速奔跑时，玩家身后附加短横线）
    const speed = Math.abs(p.vel.x);
    if (p.dashing || speed > 300) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const back = -p.facing;
      const baseX = p.pos.x - cam + p.rect.w / 2;
      const intensity = p.dashing ? 0.5 : 0.22;
      for (let i = 0; i < 5; i++) {
        const ly = p.pos.y + 4 + (i * p.rect.h) / 5;
        const len = 18 + ((i * 37) % 22);
        const sx = baseX + back * (14 + ((i * 53) % 30));
        ctx.strokeStyle = rgb(theme.glow, intensity * (0.4 + 0.6 * Math.random()));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, ly);
        ctx.lineTo(sx + back * len, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 深渊：坠亡回放把镜头带到了世界底之下，那里本来什么都没有——不补东西就是
    // 一条齐刷刷的黑边横在画面下方，像渲染漏了一块。既然文案写着「坠入深渊」，
    // 就把深渊真的画出来。
    //
    // 必须画在**地形之后**：渐变要压在地形底边上把那道硬边化开，画在地形之前
    // 会被地形整个盖住，白做。玩家随后绘制，于是人是落在深渊里而不是被它埋掉。
    if (camDropY > 0) {
      const top = WORLD_H - 42;
      const depth = camDropY + WORLD_H * 0.7;
      // 1) 崖壁：把贴着世界底的那排地形块**原样向下延伸**。
      // 上一版在这儿凭空画了几根柱子，等于另起一套语汇，看着就是「一堆黑条」；
      // 而这道沟的两侧本就是地形块的侧面，让土体自己长下去，才读得出
      // 「同一片大地裂开了一道深沟」。没有地形的地方自然不长——那正是沟口。
      const wallH = depth * 0.9;
      for (const s of solids) {
        const x = s.x - cam;
        if (x + s.w < -4 || x > VW + 4) continue;
        if (s.y + s.h < WORLD_H - 2) continue;  // 只延伸贴着世界底的那排
        const wg = ctx.createLinearGradient(0, WORLD_H, 0, WORLD_H + wallH);
        wg.addColorStop(0, rgb([40, 26, 13]));  // 与土体同色，接缝处看不出来
        wg.addColorStop(0.28, rgb([25, 16, 9]));
        wg.addColorStop(1, 'rgba(3,2,5,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(x, WORLD_H, s.w, wallH);
        // 崖面竖向剥落纹：沿用地形的裂隙语言，让延伸段不是一块平板
        ctx.strokeStyle = 'rgba(12,7,3,0.4)';
        ctx.lineWidth = 1.2;
        for (let wx = Math.ceil(s.x / 58) * 58; wx < s.x + s.w; wx += 58) {
          const h1 = hash(wx + 21), h2 = hash(wx + 29);
          const jx = wx - cam + (h1 * 10 - 5);
          const len = wallH * (0.25 + h2 * 0.4);
          ctx.beginPath();
          ctx.moveTo(jx, WORLD_H + 4);
          ctx.lineTo(jx + (h2 * 7 - 3.5), WORLD_H + len * 0.6);
          ctx.lineTo(jx + (h1 * 6 - 3), WORLD_H + len);
          ctx.stroke();
        }
      }
      // 2) 雾幕：压在崖壁之上，让深处融进黑暗，也把地形底边那道硬线化开
      const vg = ctx.createLinearGradient(0, top, 0, WORLD_H + depth);
      const atFloor = 42 / (depth + 42); // 世界底边在这条渐变上的位置
      vg.addColorStop(0, 'rgba(14,9,20,0)');
      vg.addColorStop(atFloor * 0.6, 'rgba(12,8,18,0.3)');
      vg.addColorStop(atFloor, 'rgba(10,6,15,0.55)');
      vg.addColorStop(Math.min(1, atFloor + 0.42), 'rgba(5,3,9,0.9)');
      vg.addColorStop(1, 'rgba(2,1,4,1)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, top, VW, depth + 42);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 3) 上浮的尘：让这片黑是「活的深渊」而非一块死色
      for (let i = 0; i < 16; i++) {
        const hx = hash(i * 91 + 7);
        const dx = ((hx * 613) % 1000) / 1000 * VW;
        const ph = (t * 0.2 + i * 0.11) % 1;
        const dy = WORLD_H + depth * (1 - ph) * 0.85;
        const a = 0.2 * (1 - ph) * (0.5 + 0.5 * Math.sin(t * 2 + i));
        ctx.fillStyle = `rgba(180,160,215,${a.toFixed(3)})`;
        ctx.fillRect(dx, dy, 2, 2);
      }
      // 4) 坠者身上最后一点天光。
      // 这一步不能省：人物是纯黑剪影，落进纯黑深渊会整个消失，屏幕上只剩两只
      // 发光的眼睛在飘。垫一圈冷光，剪影才重新被「衬」出来。
      const gx = p.pos.x + p.rect.w / 2 - cam;
      const gy = p.pos.y + p.rect.h / 2;
      const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, 78);
      halo.addColorStop(0, 'rgba(146,168,232,0.30)');
      halo.addColorStop(0.55, 'rgba(120,140,210,0.12)');
      halo.addColorStop(1, 'rgba(120,140,210,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(gx - 78, gy - 78, 156, 156);
      ctx.restore();
    }

    // 玩家本体
    const px = p.pos.x - cam, py = p.pos.y;
    // 奔跑动画相位：按世界坐标水平位移推进（着地且有移动才推进；离地则冻结在当前帧）
    const runDx = this.lastPlayerX === null ? 0 : p.pos.x - this.lastPlayerX;
    this.lastPlayerX = p.pos.x;
    if (p.onGround && !p.dashing) this.runPhasePx += Math.abs(runDx);
    const runFrames = assets.playerRunFrames;
    let pSprite: HTMLImageElement | null;
    if (p.dashing) pSprite = assets.playerDash;
    else if (!p.onGround) pSprite = assets.playerJump;
    else if (speed < 12) {
      // 站立不动：优先 idle 站姿，其次跑循环首帧（触地姿，近似站立），最后单帧
      pSprite = assets.playerIdle ?? (runFrames.length ? runFrames[0] : assets.playerRun);
    }
    else if (runFrames.length) pSprite = runFrames[Math.floor(this.runPhasePx / RUN_PX_PER_FRAME) % runFrames.length];
    else pSprite = assets.playerRun;
    if (pSprite) {
      // 素材头到脚统一归一到 220px（见 process.py body_normalize）；按角色高度定标，
      // 确保站/跑/跳角色实际高度一致，杖/发往头顶上方自由延伸
      const scale = (PLAYER_H * 1.7) / SPRITE_CHAR_PX;
      const drawW = pSprite.width * scale;
      const drawH = pSprite.height * scale;
      ctx.save();
      ctx.translate(px + p.rect.w / 2, py + p.rect.h);
      if (p.facing === -1) ctx.scale(-1, 1);
      // 死亡回放优先：此刻该演的是倒下，不是跑步律动
      if (game.dying) {
        deathPose(ctx, game.deathCause, 1 - game.dyingT / DYING_TIME);
      } else if (!runFrames.length) {
        // 没有跑循环帧 = 当前是预设或玩家自传的单帧形象，补程序化律动
        singleFrameMotion(
          ctx, p, p.onGround && !p.dashing && speed >= 12,
          this.runPhasePx, drawH, speed / RUN_SPEED,
        );
      }
      ctx.drawImage(pSprite, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
    } else {
      // 黑躯干+发光眼+围巾
      ctx.fillStyle = '#06060a';
      ctx.beginPath();
      ctx.roundRect(px, py, p.rect.w, p.rect.h, 6);
      ctx.fill();
      ctx.fillStyle = rgb(theme.glow);
      const eyeX = px + (p.facing === 1 ? 13 : 3);
      ctx.fillRect(eyeX, py + 7, 3, 3);
      // 围巾：反速度方向飘动
      ctx.strokeStyle = rgb(theme.glow, 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + p.rect.w / 2, py + 8);
      ctx.lineTo(px + p.rect.w / 2 - p.vel.x * 0.04, py + 8 - p.vel.y * 0.02 + 4);
      ctx.stroke();
    }

    // 粒子（附加混合，重叠处更亮，像迸溅火花）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    particles.draw(ctx, cam);
    ctx.restore();

    // 吞噬之暗·长夜：深夜靛蓝渐入的暗体 + 星尘 + 双层涌动触手 + 冷月前缘 + 被吞的余晖
    const dx = game.darkness.x - cam;
    if (dx > -VW) {
      const seg = 8;
      const reachAt = (i: number, ph: number) =>
        22 + 20 * Math.sin(t * 1.9 + i * 1.3 + ph) + 12 * Math.sin(t * 3.3 + i * 0.7);
      // 主体：纯黑（后）→ 深夜靛蓝（前），非死黑，读作"长夜"而非墨块
      const g = ctx.createLinearGradient(dx - 220, 0, dx + 40, 0);
      g.addColorStop(0, 'rgba(2,1,6,1)');
      g.addColorStop(0.7, 'rgba(6,4,16,0.98)');
      g.addColorStop(0.92, 'rgba(15,11,32,0.9)');
      g.addColorStop(1, 'rgba(15,11,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(dx - VW * 2, 0, VW * 2 + 220, WORLD_H);
      // 星尘：长夜里疏落的冷色星点（缓慢明灭），赋予夜空质感
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30; i++) {
        const sx = dx - 12 - ((i * 47 + 13) % 190);         // 分布于前缘后侧 190px 内
        const sy = WORLD_H * (((i * 0.1873 + 0.05) % 1));
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 2.3));
        const sz = 1 + (i % 3 === 0 ? 0.8 : 0);
        ctx.fillStyle = `rgba(150,168,220,${0.45 * tw})`;
        ctx.fillRect(sx, sy, sz, sz);
      }
      ctx.restore();
      // 双层涌动触手：后层更暗更远、前层贴边蠕动，制造纵深
      ctx.fillStyle = 'rgba(4,3,12,0.95)';
      ctx.beginPath();
      ctx.moveTo(dx - 50, 0);
      for (let i = 0; i <= seg; i++) ctx.lineTo(dx + reachAt(i, 0.9) + 14, (WORLD_H * i) / seg);
      ctx.lineTo(dx - 50, WORLD_H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#010007';
      ctx.beginPath();
      ctx.moveTo(dx - 40, 0);
      for (let i = 0; i <= seg; i++) ctx.lineTo(dx + reachAt(i, 0), (WORLD_H * i) / seg);
      ctx.lineTo(dx - 40, WORLD_H);
      ctx.closePath();
      ctx.fill();
      // 前缘冷月光 + 被吞噬的余晖（日光被长夜拉入、渐熄）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i <= seg; i++) {
        const yy = (WORLD_H * i) / seg;
        const reach = reachAt(i, 0);
        const rg = ctx.createRadialGradient(dx + reach, yy, 0, dx + reach, yy, 30);
        rg.addColorStop(0, 'rgba(126,146,214,0.2)');       // 冷月色前缘
        rg.addColorStop(1, 'rgba(126,146,214,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(dx + reach - 30, yy - 30, 60, 60);
      }
      for (let i = 0; i < 5; i++) {                          // 被吞的暖晖
        const ph = (t * 0.32 + i * 0.2) % 1;                // 0→1：自前方飘入并熄灭
        const ex = dx + 64 - ph * 104;
        const ey = WORLD_H * (((i * 0.211 + 0.12) % 1));
        const a = 0.55 * (1 - ph) * (0.6 + 0.4 * Math.sin(t * 4 + i));
        const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9);
        eg.addColorStop(0, rgb(theme.glow, a));
        eg.addColorStop(1, rgb(theme.glow, 0));
        ctx.fillStyle = eg;
        ctx.fillRect(ex - 9, ey - 9, 18, 18);
      }
      ctx.restore();
    }

    this.vignette(ctx, VW);

    // 长夜逼近的分级告警：冷靛暗角随危险度加重、脉动随之加急。
    // 叠在上面那层中性暗角之上而不是替换它——那层是常驻构图，这层是状态告警。
    // 长夜本体虽然画得足，但只在它进入视野时才看得见；这层在它还没露头时就先示警。
    const danger = dangerLevel(p.pos.x, game.darkness.x);
    if (danger > 0.02 && game.state === 'playing') {
      const pulse = 0.62 + 0.38 * Math.sin(t * (4 + 7 * danger));
      const dg = ctx.createRadialGradient(
        VW / 2, WORLD_H * 0.52, WORLD_H * 0.34, VW / 2, WORLD_H * 0.52, WORLD_H * 1.05,
      );
      dg.addColorStop(0, 'rgba(10,6,26,0)');
      dg.addColorStop(1, `rgba(10,6,26,${(0.5 * danger * pulse).toFixed(3)})`);
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, VW, WORLD_H);
    }

    // 浮动反馈文字（拾光/续力/击杀）——在暗角之上，世界坐标
    if (popups) popups.draw(ctx, cam, `16px ${fontHud()}`);

    // 收束第一道：黑场。把死亡现场整屏渐暗到全黑，再让结局图从黑里浮起——
    // 现场可能是近黑的深渊，结局图却是明亮的桃林逆光，直接溶接两头都对不上。
    if (game.dying && game.dyingT < DEATH_BLACKOUT) {
      const k = Math.min(1, (DEATH_BLACKOUT - game.dyingT) / (DEATH_BLACKOUT - DEATH_FADE));
      ctx.fillStyle = `rgba(0,0,0,${k.toFixed(3)})`;
      ctx.fillRect(-VW, -WORLD_H, VW * 3, WORLD_H * 3);
    }

    // 收束第二道：结局图（弃杖化邓林，多种随机）自黑场中浮起
    const endingAlpha = game.dying
      ? Math.max(0, 1 - game.dyingT / DEATH_FADE)
      : 1;
    if (game.state === 'dead' && endingAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = endingAlpha;
      // 结局图是覆盖全屏的收束层，不属于世界，得把坠亡时的镜头下带抵消掉——
      // 否则它跟着镜头一起下移，屏幕底部露出一条黑带。
      if (camDropY) ctx.translate(0, camDropY);
      const arts = assets.endingArts;
      const img = arts.length ? arts[game.endingSeed % arts.length] : null;
      if (img) {
        const sc = Math.max(VW / img.width, WORLD_H / img.height);
        const w = img.width * sc, h = img.height * sc;
        ctx.drawImage(img, (VW - w) / 2, (WORLD_H - h) / 2, w, h);
        // 0.42 的压暗是按暗调结局图定的；邓林那几张是明亮的桃花逆光，死因、
        // 「弃其杖，化为邓林」与分享提示（皆 0.6 上下的暖白）压在花瓣上几乎读不出。
        // 结算页首先得让人看清自己走了多远，氛围让位于可读。
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
      }
      ctx.fillRect(0, 0, VW, WORLD_H);
      ctx.restore();
    }

    // 全屏白闪（击杀特写）——覆盖到变换之外，避免缩放/震动露边
    if (camFx.flash > 0) {
      ctx.fillStyle = rgb([255, 255, 250], camFx.flash * 0.55);
      ctx.fillRect(-VW, -WORLD_H, VW * 3, WORLD_H * 3);
    }
  }

  /** 暗角（克制，仅四角轻压，避免像蒙一层暗膜）。标题页与游玩共用。 */
  private vignette(ctx: CanvasRenderingContext2D, VW: number) {
    const vg = ctx.createRadialGradient(VW / 2, WORLD_H * 0.52, WORLD_H * 0.62, VW / 2, WORLD_H * 0.52, WORLD_H * 1.15);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VW, WORLD_H);
  }

  get viewWidth() { return this.vw; }

  /**
   * 把浏览器视口坐标（clientX/clientY，CSS 像素）换算到 UI 绘制所用的世界坐标。
   *
   * renderUI 以「包含式」缩放居中，画布常有上下或左右留黑；命中判定若直接用
   * 屏幕比例，就会与实际画出的位置错位——信箱化越严重错得越多。凡是要对
   * renderUI 里画出来的东西做命中的，都必须先过这里。
   *
   * 算式在 viewport.ts，与 renderUI 的绘制共用同一份实现。
   */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const { canvas } = this;
    return clientToWorld({
      clientX, clientY,
      rect: canvas.getBoundingClientRect(),
      canvasW: canvas.width, canvasH: canvas.height, vw: this.vw,
    });
  }

  renderUI(cb: (ctx: CanvasRenderingContext2D) => void) {
    // HUD 用"包含式"适配（min 缩放，不裁不抖），保证顶/底 HUD 始终完整可见；
    // 超宽屏世界虽放大裁顶，但 HUD 仍完整（仅两侧略内收，读作留白）。
    const { ctx, canvas } = this;
    const { scale, offX, offY } = uiLetterbox(canvas.width, canvas.height, this.vw);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    cb(ctx);
  }
}
