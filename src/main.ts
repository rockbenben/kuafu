import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { loadAssets } from './render/assets';
import { Particles } from './engine/particles';
import { InputManager } from './engine/input';
import { createLoop } from './engine/loop';
import { drawUI, drawHelp, drawRotateHint } from './render/ui';
import { themeAt, rgb } from './render/theme';
import { shareScore } from './share';
import { Audio2 } from './engine/audio';
import { TouchControls } from './engine/touch';
import { Store } from './game/storage';
import { FX } from './render/fx';
import { Popups } from './render/popups';
import { t, setScript, toggleScript } from './render/strings';
import { MOTE_SCORE, KILL_BONUS } from './game/constants';
import { dailySeed } from './game/generator';
import { submitScore, fetchRank, fetchTop, isOnline, type BoardState } from './api/leaderboard';
import type { RunStats } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ghLink = document.getElementById('gh') as HTMLAnchorElement | null; // 源码链接，仅标题页显示
if (!canvas.getContext('2d')) {
  document.body.innerHTML = '<p style="color:#ccc;text-align:center;margin-top:40vh">浏览器不支持 Canvas，请升级浏览器</p>';
  throw new Error('Canvas 2D unsupported');
}
const game = new Game();
const assets = await loadAssets();
const renderer = new Renderer(canvas, assets);
const particles = new Particles();
const input = new InputManager();
input.attach(window);
const audio = new Audio2();
const touch = new TouchControls(input, () => audio.unlock());
const store = new Store();
const fx = new FX();
const popups = new Popups();

let best = store.best;
audio.muted = store.muted;
setScript(store.script); // 载入简/繁偏好
// 今日挑战：按 UTC 日期派发全球统一的当日种子（同日同关卡、同场竞逐）
const todayUTC = new Date().toISOString().slice(0, 10);
game.setDaily(dailySeed(todayUTC), todayUTC);

const board: BoardState = { status: 'offline', rank: null, top: null };

let wasChargeReady = false;
let deathGen = 0;
let helpOpen = false;
let sharing = false;
let deadTapGuardUntil = 0; // 死亡瞬间起短暂锁触，防连点误触分享/重开、先看清成绩
// 触屏设备（粗指针）：用于竖屏旋转提示
const isCoarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// 隐藏秘籍·夸父不竭：连按 3 次「下」(↓↓↓ 或 SSS) 开启/关闭神力无限
const CHEAT_SEQ = ['ArrowDown', 'ArrowDown', 'ArrowDown'];
const konamiBuf: string[] = [];
let cheatInfiniteUlt = false;

// 分享成绩（F 键 / 触屏点上半屏共用）——生成成绩卡，移动端系统分享、桌面端复制
function doShare() {
  if (game.state !== 'dead' || !game.runStats || sharing) return;
  sharing = true;
  const img = assets.endingArts.length ? assets.endingArts[game.endingSeed % assets.endingArts.length] : null;
  void shareScore(game.runStats.distanceM, game.runStats.score, best, img).then(r => {
    sharing = false;
    if (r === 'copied') {
      const p = game.player;
      popups.spawn(p.pos.x + p.rect.w / 2, p.pos.y - 6, t('share.copied'), rgb([255, 220, 150], 1), 2.4);
    }
  });
}

async function onDeath(stats: RunStats) {
  const gen = ++deathGen;
  const bk = game.boardKey; // 锁定本局所属榜单（常规 / 今日挑战）
  if (!isOnline()) { board.status = 'offline'; return; }
  if (!store.nickname) {
    const n = (window.prompt('输入昵称（1~16 字）') ?? '').trim().slice(0, 16);
    if (n) store.nickname = n;
  }
  if (!store.nickname) { board.status = 'offline'; return; }
  board.status = 'pending';
  try {
    const ok = await submitScore(store.nickname, stats, bk);
    if (gen !== deathGen) return; // 已开新的一局死亡，丢弃过期结果
    if (!ok) { board.status = 'offline'; return; }
    const [rank, top] = await Promise.all([fetchRank(stats.score, bk), fetchTop(bk)]);
    if (gen !== deathGen) return;
    board.rank = rank;
    board.top = top;
    board.status = 'done';
  } catch {
    if (gen === deathGen) board.status = 'offline';
  }
}

window.addEventListener('keydown', e => {
  audio.unlock();
  // 隐藏秘籍检测（不影响其它按键处理）；KeyS 归一为 ArrowDown，方向键/S 都算"下"
  konamiBuf.push(e.code === 'KeyS' ? 'ArrowDown' : e.code);
  if (konamiBuf.length > CHEAT_SEQ.length) konamiBuf.shift();
  if (konamiBuf.length === CHEAT_SEQ.length && CHEAT_SEQ.every((c, i) => c === konamiBuf[i])) {
    cheatInfiniteUlt = !cheatInfiniteUlt;
    konamiBuf.length = 0;
    audio.charged();
    const p = game.player;
    popups.spawn(p.pos.x + p.rect.w / 2, p.pos.y - 6, t(cheatInfiniteUlt ? 'cheat.on' : 'cheat.off'), rgb([255, 220, 150], 1), 2.2);
    if (cheatInfiniteUlt && game.state === 'playing') game.charge = 1;
  }
  // H 帮助浮层（暂停游戏）；F 分享成绩（结算页）
  if (e.code === 'KeyH') { helpOpen = !helpOpen; return; }
  if (e.code === 'KeyF') { doShare(); return; }
  if (helpOpen) { if (e.code !== 'KeyH') helpOpen = false; return; } // 帮助打开时任意键关闭
  // G 切换模式（常规无尽 / 今日挑战）——仅菜单态，切换即清空旧榜快照
  if (e.code === 'KeyG' && game.state !== 'playing') {
    game.setMode(game.mode === 'endless' ? 'daily' : 'endless');
    board.status = 'offline'; board.rank = null; board.top = null;
    return;
  }
  const util = e.code === 'KeyM' || e.code === 'KeyT'; // 功能键不触发开局
  if (game.state === 'title' && !util) game.start();
  else if (game.state === 'dead' && (e.code === 'KeyR' || e.code === 'Space') && performance.now() >= deadTapGuardUntil) game.start();
  if (e.code === 'KeyM') store.muted = audio.toggleMute();
  if (e.code === 'KeyT') store.script = toggleScript(); // 简/繁切换
});

// 触屏菜单交互（游玩中的移动/跳/冲由 TouchControls 处理；此处仅菜单态）
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const fx = e.clientX / innerWidth, fy = e.clientY / innerHeight;
  if (helpOpen) {                                       // 帮助浮层
    // 点"声音"钮（≈居中、0.80 屏高）→ 切静音，不关闭；点别处关闭
    if (isCoarsePointer && fx > 0.3 && fx < 0.7 && fy > 0.73 && fy < 0.85) {
      store.muted = audio.toggleMute();
      return;
    }
    helpOpen = false; return;
  }
  if (game.state === 'title') {
    audio.unlock();
    if (fx < 0.24 && fy > 0.84) { helpOpen = true; return; }        // 左下角 → 帮助
    if (fx > 0.76 && fy > 0.84) { store.script = toggleScript(); return; } // 右下角 → 简繁切换（触屏无 T 键）
    if (fy < 0.2) {                                           // 上方 → 切换模式
      game.setMode(game.mode === 'endless' ? 'daily' : 'endless');
      board.status = 'offline'; board.rank = null; board.top = null;
      return;
    }
    game.start();
    return;
  }
  if (game.state === 'dead') {
    if (performance.now() < deadTapGuardUntil) return; // 死亡瞬间锁触，防连点误触
    audio.unlock();
    if (fy < 0.42) doShare();                          // 上半屏 → 分享成绩
    else game.start();                                 // 下半屏 → 再逐一程
  }
});

const loop = createLoop(
  dt => {
    // FX 每帧推进（含衰减/顿帧计时）；顿帧期间冻结游戏逻辑增强打击感
    fx.update(dt, game.player.vel.x, game.state === 'dead');
    // 始终消费输入边沿，避免顿帧期间按键被缓冲、解冻后爆发
    const snap = input.snapshot();
    if (helpOpen) return;          // 帮助浮层：暂停游戏
    if (fx.hitstopActive) return;
    game.update(snap, dt);
    // 秘籍·夸父不竭：神力常满，大招无限
    if (cheatInfiniteUlt && game.state === 'playing') game.charge = 1;
    // 环境乐床：随旅程推进演化，仅游玩时播放，静音即止
    audio.ambient(Math.min(1, game.score.distanceM / 2000), game.state === 'playing');
    const theme = themeAt(game.score.distanceM);
    const p = game.player;
    const cx = p.pos.x + p.rect.w / 2, cy = p.pos.y + p.rect.h;
    if (p.justLanded) particles.spawn(cx, cy, { color: 'rgba(200,200,220,0.5)', count: 6, vy: -30, spread: 60, life: 0.4 });
    if (p.justJumped) audio.jump();
    if (p.justDashed) {
      particles.spawn(cx, cy - 14, { color: rgb(theme.glow, 0.9), count: 14, spread: 140, life: 0.35 });
      audio.dash();
      fx.addShake(0.28);
    }
    if (game.justCollectedMote) {
      particles.spawn(cx, cy - 14, { color: rgb(theme.glow), count: 10, spread: 100, life: 0.5 });
      audio.mote();
      // 清晰展现作用：+分数 与 当前倍率一起浮现
      popups.spawn(cx, p.pos.y - 6, `+${MOTE_SCORE}  ×${game.score.multiplier.toFixed(1)}`, rgb(theme.glow, 1), 1.1);
    }
    if (game.justCollectedCrystal) {
      // 掬饮甘泉：水花四溅
      particles.spawn(cx, cy - 14, { color: 'rgba(150,205,255,0.95)', count: 14, spread: 130, life: 0.5 });
      audio.crystal();
      fx.addShake(0.2);
      popups.spawn(cx, p.pos.y - 6, t('pop.water'), 'rgba(170,215,255,1)', 1.0);
    }
    if (game.justKilledEnemy) {
      particles.spawn(cx, cy, { color: 'rgba(255,235,200,0.98)', count: 22, spread: 210, life: 0.55 });
      audio.kill();
      fx.addShake(0.5);
      fx.hitstop(0.08);       // 击杀顿帧
      fx.triggerFlash(0.85);  // 白闪
      fx.punch(0.12);         // 特写：镜头瞬间拉近
      popups.spawn(cx, p.pos.y - 6, `+${KILL_BONUS}`, 'rgba(255,210,140,1)', 1.0);
    }
    if (game.justStrided) {
      particles.spawn(cx, cy - 14, { color: rgb(theme.glow, 1), count: 34, spread: 280, life: 0.6 });
      audio.stride();
      fx.addShake(0.7);
      fx.triggerFlash(0.55);
      fx.punch(0.1);
      popups.spawn(cx, p.pos.y - 6, t('pop.stride'), rgb(theme.glow, 1), 1.3);
    }
    if (wasChargeReady !== game.chargeReady && game.chargeReady) audio.charged(); // 刚充满神力
    wasChargeReady = game.chargeReady;
    if (game.justDied) {
      deadTapGuardUntil = performance.now() + 550; // 死后约半秒内忽略点触，先看清成绩
      particles.spawn(cx, cy - 14, { color: '#06060a', count: 26, spread: 200, life: 0.8 });
      particles.spawn(cx, cy - 14, { color: rgb(theme.glow, 0.9), count: 14, spread: 220, life: 0.7 });
      // 弃杖化邓林：桃花花瓣缓缓升起绽放
      particles.spawn(cx, cy - 10, { color: 'rgba(255,150,185,0.95)', count: 26, vy: -55, spread: 170, life: 1.8, size: 4 });
      particles.spawn(cx, cy - 10, { color: 'rgba(255,205,220,0.85)', count: 14, vy: -35, spread: 120, life: 2.2, size: 3 });
      audio.death();
      fx.addShake(0.9);
      fx.hitstop(0.09);
      if (game.runStats && game.runStats.score > best) best = game.runStats.score;
      store.best = best;
      void onDeath(game.runStats!);
    }
    particles.update(dt);
    popups.update(dt);
  },
  () => {
    if (ghLink) ghLink.style.display = game.state === 'title' ? 'block' : 'none';
    // 触屏控制层：仅触屏设备游玩（且未开帮助）时显示；神力满时亮"跨"大招键
    touch.setVisible(isCoarsePointer && game.state === 'playing' && !helpOpen);
    touch.setUltReady(game.state === 'playing' && game.chargeReady);
    renderer.render(game, particles, fx.camera(), popups);
    renderer.renderUI(ctx => {
      const theme = themeAt(game.score.distanceM);
      drawUI(ctx, game, theme, best, board, renderer.viewWidth, isCoarsePointer);
      if (helpOpen) drawHelp(ctx, theme, renderer.viewWidth, audio.muted, isCoarsePointer);
      // 触屏竖持：提示旋转横屏——铺满整屏（重置为设备像素空间，避开世界视口信箱化）
      if (isCoarsePointer && innerHeight > innerWidth * 1.1) {
        ctx.save();
        const d = Math.min(devicePixelRatio || 1, 2);
        ctx.setTransform(d, 0, 0, d, 0, 0);
        drawRotateHint(ctx, theme, innerWidth, innerHeight);
        ctx.restore();
      }
    });
  },
);
loop.start();

// 开发热更新时释放音频上下文，避免旧乐床叠加（多重嘈杂背景音）
const hot = (import.meta as { hot?: { dispose(cb: () => void): void } }).hot;
if (hot) hot.dispose(() => audio.dispose());
