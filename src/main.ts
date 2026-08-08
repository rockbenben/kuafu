import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { loadAssets } from './render/assets';
import { Particles } from './engine/particles';
import { InputManager } from './engine/input';
import { createLoop } from './engine/loop';
import { drawUI, drawHelp, drawRotateHint, drawLangMenu, drawLangHint, langMenuHit, langMenuPanelHit, helpSoundHit, chipHit } from './render/ui';
import { themeAt, rgb } from './render/theme';
import { shareScore } from './share';
import { Audio2 } from './engine/audio';
import { TouchControls } from './engine/touch';
import { Store } from './game/storage';
import { FX } from './render/fx';
import { Popups } from './render/popups';
import { t, setLocale, pickLocale, LOCALES, type Locale, type StringKey } from './render/strings';
import { loadAvatar, saveAvatar, clearAvatar, selectPreset, currentAvatarId, presetUrl, PRESETS } from './game/avatar';
import { worldToClient } from './render/viewport';
import { MOTE_SCORE, KILL_BONUS, WORLD_H } from './game/constants';
import { dailySeed } from './game/generator';
import { dangerLevel } from './game/darkness';
import { submitScore, fetchRank, fetchTop, isOnline, type BoardState } from './api/leaderboard';
import type { RunStats } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ghLink = document.getElementById('gh') as HTMLAnchorElement | null; // 源码链接，仅标题页显示
const avBar = document.getElementById('avbar');                           // 换形象一行，同样仅标题页
const avLabel = document.getElementById('av-label');
const avThumb = document.getElementById('av-thumb') as HTMLImageElement | null;
const avFile = document.getElementById('av-file') as HTMLInputElement | null;
const avReset = document.getElementById('av-reset');
const avBtn = document.getElementById('av');
const avTip = document.getElementById('avtip');
const avPick = document.getElementById('avpick');
const avMore = document.getElementById('av-more');
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
// 语种协商：?lang= → 预渲染页注入的路径语种 → localStorage → 浏览器语言
const picked = pickLocale({
  query: new URLSearchParams(location.search).get('lang'),
  injected: (window as { __LANG__?: string }).__LANG__ ?? null,
  stored: store.lang,
  pinned: store.langPinned,
  navigator: navigator.languages ?? [navigator.language],
});
setLocale(picked.locale);
// 首次见到的语种落盘，但**不**标记为亲选：
//  - 有了它，从 /en/ 进来的人回到根 URL 仍是英文，不会掉回浏览器语言；
//  - 不标亲选，所以它盖不过将来别人分享来的 /ja/，也随时可被菜单覆盖。
// 已有值时绝不覆盖——那可能正是用户亲选的结果。
if (!store.lang) store.lang = picked.locale;
touch.applyLocale();

// ── 自定义形象 ──────────────────────────────────────────────
// 内置素材原样存底："还原形象"要拿它换回来；不存底就只能重刷页面。
const stock = {
  run: assets.playerRun, idle: assets.playerIdle,
  jump: assets.playerJump, dash: assets.playerDash, frames: assets.playerRunFrames,
};
let avNoticeTimer = 0;

/** 用一张图顶替跑/站/跳/冲四态；传 null 恢复内置素材。 */
function applyAvatar(img: HTMLImageElement | null) {
  assets.playerRun = img ?? stock.run;
  assets.playerIdle = img ?? stock.idle;
  assets.playerJump = img ?? stock.jump;
  assets.playerDash = img ?? stock.dash;
  // 自定义形象只有一张，跑步循环必须清空——否则 renderer 优先播内置帧，
  // 玩家会看到自己的形象只在跳跃/冲刺时闪现，落地就变回夸父。
  assets.playerRunFrames = img ? [] : stock.frames;
  avReset?.toggleAttribute('hidden', !img);
  // 圆形预览：没换过就显示内置站姿，让人一眼知道这颗键管的是什么
  if (avThumb) avThumb.src = img?.src ?? stock.idle?.src ?? stock.run?.src ?? '';
  // 一排圆里高亮当前那个，否则展开后认不出自己现在是谁
  const cur = currentAvatarId(store);
  avPick?.querySelectorAll<HTMLElement>('.avopt').forEach(el => {
    el.classList.toggle('cur', (el.dataset.id ?? 'custom') === cur);
  });
}

/** 一排预设缩略图，插在「＋」之前。 */
function buildAvPicker() {
  if (!avPick || !avMore) return;
  for (const id of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'avopt';
    b.dataset.id = id;
    b.innerHTML = `<img src="${presetUrl(id)}" alt="">`;
    b.addEventListener('click', async () => {
      applyAvatar(await selectPreset(store, id));
      setAvOpen(false);
      avNotice('avatar.done');
    });
    avPick.insertBefore(b, avMore);
  }
}

function setAvOpen(on: boolean) {
  avBar?.classList.toggle('open', on);
  avBtn?.setAttribute('aria-expanded', on ? 'true' : 'false');
}

function applyAvatarLocale() {
  if (avLabel) avLabel.textContent = t('avatar.pick');
  if (avReset) {
    avReset.textContent = t('avatar.reset');
    avReset.setAttribute('aria-label', t('avatar.reset'));
  }
  if (avTip) avTip.textContent = t('avatar.tip');
  avBtn?.setAttribute('aria-label', t('avatar.pick'));
  avMore?.setAttribute('aria-label', t('avatar.upload'));
  avMore?.setAttribute('title', t('avatar.upload'));
  avPick?.setAttribute('aria-label', t('avatar.pick'));
  for (const id of PRESETS) {
    const el = avPick?.querySelector<HTMLElement>(`.avopt[data-id="${id}"]`);
    const name = t(`avatar.name.${id}` as StringKey);
    el?.setAttribute('aria-label', name);
    el?.setAttribute('title', name);
  }
}

/** 换形象没有即时画面反馈（标题页画的是题图不是角色），借入口本身报一声。 */
function avNotice(key: StringKey) {
  if (!avLabel) return;
  avLabel.textContent = t(key);
  clearTimeout(avNoticeTimer);
  avNoticeTimer = setTimeout(applyAvatarLocale, 1800) as unknown as number;
}

avFile?.addEventListener('change', async () => {
  const file = avFile.files?.[0];
  if (!file) return;
  const img = await saveAvatar(store, file);
  applyAvatar(img);
  avFile.value = ''; // 清空才能再次选中同一个文件（change 不会重复触发）
  setAvOpen(false);
  avNotice(img ? 'avatar.done' : 'avatar.fail');
});
// label 里的 <input hidden> 不吃键盘：Tab 停在 label 上按 Enter 什么也不发生
avMore?.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avFile?.click(); }
});

avBtn?.addEventListener('click', () => setAvOpen(!avBar?.classList.contains('open')));
// 点别处收起。捕获阶段：canvas 的 pointerdown 处理器会 return 掉鼠标事件，
// 冒泡阶段挂在 document 上收不到取消的意图。
document.addEventListener('pointerdown', e => {
  if (avBar?.classList.contains('open') && !avBar.contains(e.target as Node)) setAvOpen(false);
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && avBar?.classList.contains('open')) setAvOpen(false);
});

const doAvReset = () => { clearAvatar(store); applyAvatar(null); };
avReset?.addEventListener('click', doAvReset);
// role=button 的 span 不自带键盘激活，补上（Tab 能聚焦却按不动等于没有）
avReset?.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doAvReset(); }
});

/**
 * 把换形象条钉到世界坐标上。canvas 是信箱化的，拿 vh 猜位置会在某些窗口比例下
 * 正好压住下面那行字。两屏的空档高度不同，锚点和对齐方式都得分开：
 *   标题页 0.85H 居中对齐 —— 「按任意键，起而逐日」画在 0.75H，下面空得很；
 *   结算页 0.99H 底边对齐 —— 那屏底下那行「按 R · 再逐一程」在 fy+60，满榜时
 *     能低到 0.885H，只剩 0.115H 空档。居中对齐时展开态会溢出屏幕底部
 *     （实测 barBottom 1217 > winH 1215），改成贴底向上长才塞得下。
 * getBoundingClientRect 会强制同步布局，所以只在窗口尺寸或所在屏真变了时重算。
 */
let avPlacedFor = '';
function placeAvBar(state: string) {
  if (!avBar) return;
  const key = `${innerWidth}x${innerHeight}:${state}`;
  if (key === avPlacedFor) return;
  avPlacedFor = key;
  const dead = state === 'dead';
  avBar.classList.toggle('anchor-bottom', dead);
  const worldY = WORLD_H * (dead ? 0.99 : 0.85);
  const vw = renderer.viewWidth;
  const rect = canvas.getBoundingClientRect();
  const p = worldToClient(vw / 2, worldY, rect, canvas.width, canvas.height, vw);
  avBar.style.left = `${p.clientX}px`;
  avBar.style.top = `${p.clientY}px`;
  // 信箱化倍率：量两个相距 100 世界像素的点，屏幕上差多少。canvas 里的牌按它放大，
  // HTML 不跟着就会在大屏上显得越来越小——这颗是主功能键，不能比帮助牌还不起眼。
  const p2 = worldToClient(vw / 2 + 100, worldY, rect, canvas.width, canvas.height, vw);
  const uiScale = (p2.clientX - p.clientX) / 100;
  // 结算页收一档：那屏满榜时展开只剩 3px 余量（实测），会贴着「按 R · 再逐一程」。
  // 换形象在这一屏是次要动作，让位给成绩与出口。
  // 系数要乘在钳位**之后**——大屏上 16*uiScale 早已顶到上限 28，改基数不起作用。
  const px = Math.max(13, Math.min(28, 16 * uiScale)) * (dead ? 0.78 : 1);
  avBar.style.fontSize = `${px}px`;
}

buildAvPicker();
applyAvatarLocale();
applyAvatar(await loadAvatar(store));
// ────────────────────────────────────────────────────────────
// 推断而来的（用户没表达过意愿）在标题页提示一次，告诉他可以改
const LANG_HINT_SEC = 4.2;
let langHintLeft = picked.auto ? LANG_HINT_SEC : 0;

function chooseLocale(l: Locale) {
  setLocale(l);
  touch.applyLocale();      // 按钮上的字随语言走，否则帮助文案指认不了按钮
  applyAvatarLocale();
  store.lang = l;
  store.langPinned = true;  // 亲选：此后盖过 ?lang= 与别人分享来的路径语种
  langMenuOpen = false;
  langHintLeft = 0;         // 已亲自选过，提示无谓了
  // 把 ?lang= 从地址栏清掉：留着它，用户每次刷新都会看到自己的选择被参数
  // 盖回去（现在虽已让位于亲选，但地址栏与实际语言不一致仍会误导，且分享
  // 出去还会强加给别人）。用 replaceState 免得多出一条历史记录。
  // 只按文本剔除 lang= 那一对，不走 URLSearchParams 重建：后者会把幸存的
  // 参数按 form-urlencoded 重新编码（?ref=a b → ?ref=a+b、| → %7C），
  // 用户复制地址栏分享出去时，投放参数就与来源方签发的不再逐字节一致。
  try {
    const q = location.search;
    if (/[?&]lang=/.test(q)) {
      const stripped = q.slice(1).split('&').filter(kv => !/^lang=/.test(kv)).join('&');
      history.replaceState(null, '', location.pathname + (stripped ? `?${stripped}` : '') + location.hash);
    }
  } catch { /* 老环境无 History API，忽略 */ }
}
// 今日挑战：按 UTC 日期派发全球统一的当日种子（同日同关卡、同场竞逐）
const todayUTC = new Date().toISOString().slice(0, 10);
game.setDaily(dailySeed(todayUTC), todayUTC);

const board: BoardState = { status: 'offline', rank: null, top: null };

let wasChargeReady = false;
let deathGen = 0;
let helpOpen = false;
let langMenuOpen = false;
let sharing = false;
let deadTapGuardUntil = 0; // 死亡瞬间起短暂锁触，防连点误触分享/重开、先看清成绩
let heartbeatT = 0;        // 长夜逼近的心跳计时（见主循环里的告警段）
// 触屏设备（粗指针）：用于竖屏旋转提示
const isCoarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** 竖持手机：旋转提示铺满整屏，此时任何浮层都看不见，不该被打开。 */
const rotateHintUp = () => isCoarsePointer && innerHeight > innerWidth * 1.1;

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
    const n = (window.prompt(t('nickname.prompt')) ?? '').trim().slice(0, 16);
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
  // 语言菜单优先吃掉按键：T / Esc 关闭，1~5 选定
  if (langMenuOpen) {
    if (e.code === 'KeyT' || e.code === 'Escape') { langMenuOpen = false; return; }
    const n = Number(e.code.replace('Digit', ''));
    if (n >= 1 && n <= LOCALES.length) chooseLocale(LOCALES[n - 1].id);
    return;
  }
  if (e.code === 'KeyT') { langMenuOpen = true; return; }
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
});

// 触屏菜单交互（游玩中的移动/跳/冲由 TouchControls 处理；此处仅菜单态）
/**
 * 指针分派。**顺序即语义**，改动前先读完这张表：
 *
 *  1. 旋转提示铺满屏  → 什么都看不见，关掉浮层即返回
 *  2. 语言菜单已开    → 行=选定；面板内其它处=不动（别把标题当"点外面"）；面板外=关
 *  3. 帮助浮层已开    → 声音钮=切静音；其余=关闭（**鼠标也必须能关**）
 *  4. 死亡锁触期      → 一律吞掉，**含牌子**（防死亡瞬间的反射性误触）
 *  5. 两枚牌          → 开对应浮层（**鼠标也必须能点**，它们画出来就是按钮）
 *  6. 其余触屏交互    → 开局 / 切模式 / 分享 / 重开（仅触屏）
 *
 * 1~5 与指针类型无关：浮层和牌子是显式控件，桌面端点了必须有反应。
 * 第 6 段只对触屏生效——桌面用键盘。
 *
 * 前四轮审查里，这段每次都在「刚改过的那几行」出问题（开了进去的路没开
 * 出来的路、把牌子提到锁触之前、守卫漏加一处），所以改成显式分段并逐段
 * 注明守卫，而不是继续在一串 if 里挪。
 */
canvas.addEventListener('pointerdown', e => {
  // 所有命中都在**世界**坐标下判定：这些东西由 renderUI 画在信箱化变换里，
  // 拿屏幕比例去比，信箱化越严重错得越多。
  const world = renderer.screenToWorld(e.clientX, e.clientY);
  const vw = renderer.viewWidth;
  const fx = world.x / vw, fy = world.y / WORLD_H;

  // ── 1. 旋转提示盖住整屏：任何浮层都不可见，别让盲点变成误选 ──
  if (rotateHintUp()) {
    langMenuOpen = false;
    helpOpen = false;
    return;
  }

  // ── 2. 语言菜单 ──
  if (langMenuOpen) {
    const hit = langMenuHit(fx, fy);
    if (hit) { chooseLocale(hit); return; }
    // 点面板自身（标题、笔意线、内边距）不算"点外面"——提示写的就是"点屏幕别处"
    if (langMenuPanelHit(fx, fy)) return;
    langMenuOpen = false;
    return;
  }

  // ── 3. 帮助浮层（鼠标同样要能关，否则点开就出不来）──
  if (helpOpen) {
    if (isCoarsePointer && helpSoundHit(world.x, world.y, vw)) {
      store.muted = audio.toggleMute();
      return;
    }
    helpOpen = false;
    return;
  }

  // ── 4. 死亡锁触：死亡瞬间吞掉一切点击，**含牌子** ──
  // 横屏下语言牌与触屏跳跃键有约 47×12 CSS px 的重叠，玩家连点跳跃时死亡，
  // 下一下反射性点击正落在牌上；若不吞掉，分数还没看清菜单就盖上来了。
  if (game.state === 'dead' && performance.now() < deadTapGuardUntil) return;

  // ── 5. 两枚牌（鼠标也要能点）──
  if (game.state === 'title' || game.state === 'dead') {
    if (chipHit('right', world.x, world.y, vw)) {
      audio.unlock(); langMenuOpen = true; return;
    }
    // 帮助牌只画在标题页，故也只在标题页命中
    if (game.state === 'title' && chipHit('left', world.x, world.y, vw)) {
      audio.unlock(); helpOpen = true; return;
    }
  }

  // ── 6. 以下均为触屏交互；桌面用键盘 ──
  if (e.pointerType === 'mouse') return;

  if (game.state === 'title') {
    audio.unlock();
    if (fy < 0.2) {                                    // 上方 → 切换模式
      game.setMode(game.mode === 'endless' ? 'daily' : 'endless');
      board.status = 'offline'; board.rank = null; board.top = null;
      return;
    }
    game.start();
    return;
  }

  if (game.state === 'dead') {
    audio.unlock();
    if (fy < 0.42) doShare();                          // 上半屏 → 分享成绩
    else game.start();                                 // 下半屏 → 再逐一程
  }
});

/** 画一帧：世界 + 信箱化 UI 层。与逻辑更新解耦，故可被单独驱动（审查/截图）。 */
function drawFrame() {
  renderer.render(game, particles, fx.camera(), popups);
  renderer.renderUI(ctx => {
    const theme = themeAt(game.score.distanceM);
    drawUI(ctx, game, theme, best, board, renderer.viewWidth, isCoarsePointer);
    if (helpOpen) drawHelp(ctx, theme, renderer.viewWidth, audio.muted, isCoarsePointer);
    if (langMenuOpen) drawLangMenu(ctx, theme, renderer.viewWidth, isCoarsePointer);
    // 首次自动选定语种的提示：仅标题页、菜单未开时，末段淡出
    if (langHintLeft > 0 && game.state === 'title' && !langMenuOpen && !helpOpen && !rotateHintUp()) {
      drawLangHint(ctx, theme, renderer.viewWidth, Math.min(1, langHintLeft / 1.2));
    }
    // 触屏竖持：提示旋转横屏——铺满整屏（重置为设备像素空间，避开世界视口信箱化）
    if (isCoarsePointer && innerHeight > innerWidth * 1.1) {
      ctx.save();
      const d = Math.min(devicePixelRatio || 1, 2);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawRotateHint(ctx, theme, innerWidth, innerHeight);
      ctx.restore();
    }
  });
}

const loop = createLoop(
  dt => {
    // FX 每帧推进（含衰减/顿帧计时）；顿帧期间冻结游戏逻辑增强打击感
    fx.update(dt, game.player.vel.x, game.state === 'dead');
    // 语言提示只在标题页倒数：进了局就不该再占视线
    if (langHintLeft > 0 && game.state === 'title') langHintLeft = Math.max(0, langHintLeft - dt);
    // 始终消费输入边沿，避免顿帧期间按键被缓冲、解冻后爆发
    const snap = input.snapshot();
    if (helpOpen || langMenuOpen) return;   // 帮助浮层 / 语言菜单：暂停游戏
    if (fx.hitstopActive) return;
    game.update(snap, dt);
    // 秘籍·夸父不竭：神力常满，大招无限
    if (cheatInfiniteUlt && game.state === 'playing') game.charge = 1;
    // 环境乐床：随旅程推进演化，仅游玩时播放，静音即止
    audio.ambient(Math.min(1, game.score.distanceM / 2000), game.state === 'playing');
    const theme = themeAt(game.score.distanceM);
    const p = game.player;

    // 长夜逼近的听觉/体感告警，与渲染层的冷靛暗角共用 dangerLevel 那条曲线。
    // 心跳间隔随危险度从 0.95s 收到 0.4s；抖动做成**跟着心跳的脉冲**而非持续抖——
    // 这是跑酷，持续抖会直接妨碍玩家看清坑沿与落点。
    const danger = dangerLevel(p.pos.x, game.darkness.x);
    if (game.state === 'playing' && danger > 0.12) {
      heartbeatT -= dt;
      if (heartbeatT <= 0) {
        audio.heartbeat(danger);
        fx.addShake(0.05 * danger);
        heartbeatT = 0.95 - 0.55 * danger;
      }
    } else {
      heartbeatT = 0; // 脱险或重开：下次进入危险立刻跳第一下，不留残余计时
    }
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
    // 竖持时旋转提示铺满整屏、遮蔽一切，源码链接不该还浮在它上面
    if (ghLink) ghLink.style.display = game.state === 'title' && !rotateHintUp() ? 'block' : 'none';
    // 结算页也给换形象入口：那是玩家看着自己成绩、最想换个人再来一局的时刻。
    // 但它是 HTML（z-index 10），会压在 canvas 画的帮助浮层/语言菜单/旋转提示之上——
    // 那三者一起时必须让位，否则一排形象圆就叠在浮层文字上。同 touch.setVisible 的守卫。
    const avOn = (game.state === 'title' || game.state === 'dead')
      && !helpOpen && !langMenuOpen && !rotateHintUp();
    avBar?.classList.toggle('on', avOn);
    if (avOn) placeAvBar(game.state);
    else if (avBar?.classList.contains('open')) setAvOpen(false);
    // 触屏控制层：仅触屏设备游玩（且未开帮助）时显示；神力满时亮"跨"大招键
    touch.setVisible(isCoarsePointer && game.state === 'playing' && !helpOpen && !langMenuOpen);
    touch.setUltReady(game.state === 'playing' && game.chargeReady);
    drawFrame();
  },
);
loop.start();

// 开发热更新时释放音频上下文，避免旧乐床叠加（多重嘈杂背景音）
const hot = (import.meta as { hot?: { dispose(cb: () => void): void } }).hot;
if (hot) hot.dispose(() => audio.dispose());
