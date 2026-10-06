/**
 * DEV 取景夹具（`?dp=<屏名>`）。
 *
 * 用途：让取证脚本（design-preview/）与打磨稿的活格子直接站到某一屏上——标题、
 * 帮助、语言菜单、游玩 HUD、竖持提示、死亡回放、结算——而不必每拍一屏就真跑一局、
 * 真死一次。它同时把「这一帧到底画了哪些字、每个字画在哪个像素框、用的什么颜色」
 * 记下来交给 `__dp.shoot()`，于是版面、字号地板、命中尺寸与对比度都是量出来的，
 * 不是从代码里推出来的。
 *
 * 三道闸（缺一条就不该存在）：
 *  1. 只在 `import.meta.env.DEV` 下被动态引入——生产构建里连本模块都不会出现
 *     （tests/dp-fixture.test.ts 拿 dist 产物 grep 钉住这一条）。
 *  2. 屏名走白名单：认不出来整个夹具不启用，打错字不该把玩家丢进白屏。
 *  3. 夹具态不写盘、不出声：存档字段全部退化成只读（取景时顺手改了这名玩家的最高分
 *     或语种偏好，等于取证污染用户数据），`audio.unlock` 空转（没有 AudioContext
 *     就没有任何声音，而帮助浮层上的「声音 开/关」仍按参数如实显示）。
 *
 * 私有字段只在这里碰（旁白/教学那几项）。产品侧不为此开公开 setter——那等于把
 * 教学状态机暴露给游戏逻辑本身。
 */
import type { Game } from '../game/game';
import type { Renderer } from '../render/renderer';
import { Store } from '../game/storage';
import type { Audio2 } from '../engine/audio';
import type { Assets } from '../render/assets';
import type { BoardState } from '../api/leaderboard';
import type { InputState } from '../game/types';
import { LOCALES, type Locale } from '../i18n/keys';
import { t } from '../render/strings';
import { DT, PX_PER_METER, VIEW_W, PLAYER_H, TILE, DYING_TIME, MOTE_SCORE, BACKSTAB_BONUS } from '../game/constants';
import { DANGER_GAP } from '../game/darkness';
import { SPAWN_TERRAIN_MARGIN } from '../game/enemies';
import { uiHeight } from '../render/viewport';
import {
  CHIP, SOUND_BTN, chipRect, helpPanelBounds, helpSoundCenterY, langMenuRowCenter, MENU_PANEL,
} from '../render/ui';

export const DP_SCREENS = ['title', 'help', 'lang', 'play', 'rotate', 'replay', 'dead'] as const;
export type DpScreen = typeof DP_SCREENS[number];

const CAUSES = ['spike', 'fall', 'darkness', 'enemy'] as const;
export type DpCause = typeof CAUSES[number];
const BOARDS = ['done', 'pending', 'offline'] as const;
const HINT_KEYS = ['run', 'jump', 'dash', 'kill', 'shield', 'score'] as const;
const POPUP_KEYS = ['copied', 'water', 'bounce', 'backstab', 'stride', 'kill', 'mote'] as const;
const NOTICE_KEYS = ['done', 'fail'] as const;
const MODES = ['endless', 'daily'] as const;

/** 榜单默认内容：8 字那条正好卡在截断线内、10 字那条越界，供版面取证。 */
const DEFAULT_ROWS: { name: string; score: number; distance_m: number }[] = [
  { name: '夸父', score: 18420, distance_m: 620 },
  { name: 'Sunrunnx', score: 12010, distance_m: 431 },
  { name: 'SunrunnerX', score: 9433, distance_m: 388 },
  { name: '逐日者阿明', score: 7215, distance_m: 302 },
  { name: 'light', score: 480, distance_m: 96 },
];

export interface DpSpec {
  screen: DpScreen;
  coarse: boolean;
  mode: typeof MODES[number];
  dist: number;
  motes: number;
  combo: number;
  charge: number;        // 0~100
  danger: number | null; // 0~100；null = 长夜不在告警范围内
  cause: DpCause;
  board: typeof BOARDS[number];
  rank: number;
  best: number;
  score: number | null;  // null = 由路程/倍率/加分算出
  hint: 'auto' | 'off' | typeof HINT_KEYS[number];
  nar: number | null;
  muted: boolean;
  langHint: boolean;
  /** 飘字（拾光/续力/挡下/背刺/跨步/击杀）：只在事件发生那一瞬出现，取景要能钉住它。 */
  popup: string | null;
  /** 换形象的结果反馈（成功 / 读不出图）：它借入口本身显示，也只有一瞬。 */
  notice: string | null;
  avOpen: boolean;
  /** 竖持提示按「已被用户点掉」处理：它铺满整屏，底下那一屏因此从来没被量过。 */
  noHint: boolean;
  seed: number;
}

/**
 * 数值参数：「没给」与「给了 0」是两回事。
 * `null` 与空串走默认，`0` 就是 0——`Number(null)===0` 而不是 NaN，
 * 少挡这一步会让不带参数的取景静默落到第 0 档。
 */
function int(
  raw: string | null, lo: number, hi: number, dflt: number, warn: string[], name: string,
): number {
  if (raw === null || raw === '') return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    warn.push(`${name}=${raw} 不是数，按默认 ${dflt}`);
    return dflt;
  }
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function bool(raw: string | null, dflt: boolean): boolean {
  if (raw === null || raw === '') return dflt;
  return raw === '1' || raw === 'true';
}

function oneOf<T extends string>(
  raw: string | null, list: readonly T[], dflt: T, warn: string[], name: string,
): T {
  if (raw === null || raw === '') return dflt;
  if ((list as readonly string[]).includes(raw)) return raw as T;
  warn.push(`${name}=${raw} 不在白名单，按默认 ${dflt}`);
  return dflt;
}

/** 解析 `?dp=` 取景参数。屏名认不出时返回 null（夹具整个不启用）。 */
export function parseDp(q: URLSearchParams, warn: string[] = []): DpSpec | null {
  const screen = DP_SCREENS.find(s => s === q.get('dp'));
  if (!screen) return null;
  const hintRaw = q.get('hint');
  const hint: DpSpec['hint'] = hintRaw === 'off'
    ? 'off'
    : oneOf(hintRaw, HINT_KEYS, 'auto', warn, 'hint');
  const num = (name: string, lo: number, hi: number, dflt: number) =>
    int(q.get(name), lo, hi, dflt, warn, name);
  const dangerRaw = q.get('danger');
  return {
    screen,
    coarse: bool(q.get('coarse'), false),
    mode: oneOf(q.get('mode'), MODES, 'endless', warn, 'mode'),
    dist: num('dist', 0, 9000, 300),
    motes: num('motes', 0, 20, 4),
    combo: num('combo', 0, 12, 0),
    charge: num('charge', 0, 100, 45),
    danger: dangerRaw === null || dangerRaw === '' ? null : num('danger', 0, 100, 0),
    cause: oneOf(q.get('cause'), CAUSES, 'spike', warn, 'cause'),
    board: oneOf(q.get('board'), BOARDS, 'done', warn, 'board'),
    rank: num('rank', 1, 999, 37),
    best: num('best', 0, 999999, 3120),
    score: q.get('score') === null || q.get('score') === '' ? null : num('score', 0, 999999, 0),
    hint,
    nar: q.get('nar') === null || q.get('nar') === '' ? null : num('nar', 0, 11, 0),
    muted: bool(q.get('muted'), false),
    popup: oneOf(q.get('popup'), POPUP_KEYS, null as never, warn, 'popup'),
    notice: oneOf(q.get('notice'), NOTICE_KEYS, null as never, warn, 'notice'),
    langHint: bool(q.get('langhint'), false),
    avOpen: bool(q.get('avopen'), false),
    noHint: bool(q.get('nohint'), false),
    seed: num('seed', 0, 9999, 7),
  };
}

/** 取景时不该动的存档字段：全部退化成「读得到、写不下去」。 */
export function silenceStoreWrites(store: Store) {
  for (const key of Object.getOwnPropertyNames(Store.prototype)) {
    const d = Object.getOwnPropertyDescriptor(Store.prototype, key);
    if (!d?.set) continue;
    Object.defineProperty(store, key, { get: d.get, set: () => {}, configurable: true });
  }
}

const IDLE: InputState = {
  left: false, right: false, up: false, down: false,
  jumpPressed: false, jumpHeld: false, dashPressed: false, ultimatePressed: false,
};

/** 夹具要碰的非公开字段，集中在这一处，别散进各屏的构建代码。 */
type Hidden = {
  elapsed: number;
  narrationKey: string | null;
  narrationTimer: number;
  newKindHint: string | null;
  newKindHintT: number;
  hasJumped: boolean;
  hasDashed: boolean;
  kills: number;
  taught: Set<string>;
};
const hidden = (game: Game) => game as unknown as Hidden;

/** 找一个落脚的地面：从目标 x 起向前逐半格探，要求头顶有净空（人不会嵌进山体）。 */
function groundAt(game: Game, fromX: number): { x: number; y: number } | null {
  const solids = game.level.solids;
  for (let x = fromX; x < fromX + VIEW_W; x += TILE / 2) {
    const under = solids.filter(s => s.x <= x && x <= s.x + s.w);
    if (!under.length) continue;
    const top = Math.min(...under.map(s => s.y));
    const stuffed = solids.some(s =>
      s.x <= x && x <= s.x + s.w && s.y < top && s.y + s.h > top - PLAYER_H * 2.4);
    if (stuffed) continue;
    if (game.level.spikes.some(s => s.x <= x && x <= s.x + s.w && Math.abs(s.y - top) < TILE)) continue;
    return { x, y: top - PLAYER_H };
  }
  return null;
}

/** 把局内状态摆成「已经跑了 dist 步」的样子：位置、地形、敌人、长夜一起跟过去。 */
function warp(game: Game, distM: number, danger: number | null, warn: string[]) {
  const targetX = distM * PX_PER_METER;
  // 先铺地形再找落脚点：groundAt 只看已生成的块，顺序反了就永远退回开局那一块
  // （实拍过一次 dist=4300 却屏上写着「2 步」，就是这么来的）。
  let placed: { x: number; y: number } | null = null;
  // 先向前探（宁可摆得比要求远一点，也不要近），实在没有再回退一屏
  for (const probe of [targetX, targetX + VIEW_W, targetX + 2 * VIEW_W, targetX - VIEW_W]) {
    const from = Math.max(0, probe);
    game.level.ensure(from + VIEW_W * 2 + SPAWN_TERRAIN_MARGIN);
    placed = groundAt(game, from);
    if (placed) break;
  }
  if (!placed) warn.push(`dist=${distM} 附近三步宽内没找到落脚点，退回开局`);
  const x = placed?.x ?? 64;
  game.player.pos.x = x;
  game.player.vel.x = 0;
  game.level.ensure(x + VIEW_W * 2 + SPAWN_TERRAIN_MARGIN);
  if (placed) game.player.pos.y = placed.y - 1;
  game.darkness.x = danger === null ? x - 1400 : x - (1 - danger / 100) * DANGER_GAP;
  game.score.distanceM = Math.max(game.score.distanceM, x / PX_PER_METER);
  // 走几帧：重力收稳，敌人按同一套生成规则铺开
  for (let i = 0; i < 4; i++) game.update(IDLE, DT);
  const h = hidden(game);
  // 教学提示/旁白/连杀不该是这几帧模拟的副产品——一律由参数决定（见 buildPlay）
  h.elapsed = 6;
  h.hasJumped = true; h.hasDashed = true; h.kills = 3; h.taught.clear();
  h.newKindHint = null; h.newKindHintT = 0;
  h.narrationTimer = 0; h.narrationKey = null;
  game.combo.reset();
  game.score.motes = 0;
  game.score.bonus = 0;
  // 那几步模拟可能把人弄死（敌人贴上来了），摆回游玩态
  game.state = 'playing';
  game.deathCause = null;
  game.dyingT = 0;
  game.justDied = false;
}

function buildPlay(game: Game, spec: DpSpec, warn: string[]) {
  game.start();
  warp(game, spec.dist, spec.danger, warn);
  game.score.motes = spec.motes;
  for (let i = 0; i < spec.combo; i++) game.combo.hit();
  game.charge = spec.charge / 100;
  const h = hidden(game);
  h.newKindHint = spec.hint === 'auto' || spec.hint === 'off' ? null : `hint.${spec.hint}`;
  if (h.newKindHint) h.newKindHintT = 9999;      // 取证期间不许自己收走
  if (spec.hint === 'off') h.elapsed = 20;        // 越过所有常驻提示的时间窗
  if (spec.nar !== null) {
    h.narrationKey = `nar.${spec.nar}`;
    h.narrationTimer = 9999;                      // timer 大 = 念稳了（alpha 已到位）
  }
}

function buildDead(game: Game, spec: DpSpec, warn: string[]) {
  game.start();
  warp(game, spec.dist, spec.danger, warn);
  game.score.motes = spec.motes;
  game.state = 'dead';
  game.deathCause = spec.cause;
  // 回放屏停在「端详」那拍；结算屏直接收束完毕
  game.dyingT = spec.screen === 'replay' ? DYING_TIME * 0.5 : 0;
  game.runStats = {
    score: spec.score ?? game.score.total,
    distanceM: Math.floor(game.score.distanceM),
    durationMs: 42_000,
  };
  game.endingSeed = spec.seed;
}

/** 一帧里每个落字的记录（世界坐标 + 当帧变换，取证脚本据此换算 CSS 像素）。 */
export interface InkEntry {
  text: string; x: number; y: number; fontPx: number; family: string;
  fill: string; align: string; baseline: string; maxW: number | null;
  alpha: number; shadowBlur: number; shadowColor: string;
  /** 当帧变换：a/d 是缩放，e/f 是平移（世界 → 画布设备像素）。 */
  a: number; d: number; e: number; f: number;
  w: number;
}

export interface DpFit {
  vw: number; uiH: number;
  canvasW: number; canvasH: number; cssW: number; cssH: number;
  scale: number;
}

export interface DpDeps {
  game: Game;
  renderer: Renderer;
  assets: Assets;
  store: Store;
  audio: Audio2;
  board: BoardState;
  canvas: HTMLCanvasElement;
  loop: { stop(): void };
  presentFrame: () => void;
  setCoarse: (on: boolean) => void;
  setOverlay: (o: 'none' | 'help' | 'lang') => void;
  setAvOpen: (on: boolean) => void;
  /** 竖持几何下把旋转提示按已消失处理，好拍到它底下的那一屏。 */
  setHintSuppressed: (on: boolean) => void;
  setBest: (v: number) => void;
  setLangHint: (on: boolean) => void;
  /** 在玩家头顶钉一条飘字（文案与时长同主程序那一套）。 */
  spawnPopup: (text: string) => void;
  /** 借换形象入口本身报一声（成功 / 读不出图）。 */
  setNotice: (key: 'avatar.done' | 'avatar.fail') => void;
  /** 取景要求哪个语种就得是哪个语种：`?lang=` 盖不过用户亲选，但盖得过夹具。 */
  forceLocale: (l: Locale) => void;
}

export interface DpApi {
  spec: DpSpec;
  warnings: string[];
  ready: boolean;
  /** 续传批是否到齐（结算屏要用结局图）。 */
  settled: boolean;
  screens: typeof DP_SCREENS;
  /** 取景一帧；`tMs` 把 performance.now 钉在给定时刻，脉动/闪烁于是可复现。 */
  draw: (tMs?: number) => void;
  /** 沿用上一次的钉住时刻重绘（指针事件后用；拿真实时间重绘会把世界解冻）。 */
  redraw: () => void;
  /** 取景一帧并返回这一帧落下的每一个字。 */
  shoot: (tMs?: number) => { ink: InkEntry[]; fit: DpFit };
  /** 控件几何（牌子/声音钮/面板/菜单行）：绘制与命中本就同源，这里原样端出来。 */
  geom: () => Record<string, unknown>;
  /** 世界坐标 → CSS 像素（悬停/点击取证要用真坐标，不能按屏幕比例猜）。 */
  toClient: (wx: number, wy: number) => { x: number; y: number };
  setSpec: (patch: Partial<DpSpec>) => void;
}

/** 装夹具：解析参数 → 摆状态 → 停主循环 → 交出取景口。 */
export async function installDp(q: URLSearchParams, deps: DpDeps): Promise<DpApi | null> {
  const warnings: string[] = [];
  const parsed = parseDp(q, warnings);
  if (!parsed) return null;
  const spec: DpSpec = parsed;

  const { game, renderer, assets, store, audio, board, canvas } = deps;
  silenceStoreWrites(store);
  // 没有 AudioContext 就不会有任何声音（blip 与 ambient 都在 ctx/muted 上早退）
  audio.unlock = () => {};
  audio.muted = spec.muted;   // 帮助浮层那行「声音 开/关」按参数如实显示

  deps.setCoarse(spec.coarse);
  deps.setBest(spec.best);
  // 取景要哪个语种就是哪个语种：正常的协商链里 `?lang=` 让位于用户亲选，
  // 而取证时「亲选」可能是上一轮点稿子留下的，那样拍到的就不是要审的那一屏。
  const wantLang = q.get('lang');
  const hit = wantLang ? LOCALES.find(l => l.id === wantLang) : null;
  if (hit) deps.forceLocale(hit.id);

  function apply() {
    game.setMode(spec.mode);
    switch (spec.screen) {
      case 'play':
        buildPlay(game, spec, warnings);
        break;
      case 'replay':
      case 'dead':
        buildDead(game, spec, warnings);
        break;
      default:   // title / help / lang / rotate 都站在标题页上
        game.state = 'title';
        game.dyingT = 0;
        game.deathCause = null;
        game.score.distanceM = spec.dist;
        break;
    }
    if (spec.screen === 'dead' || spec.screen === 'replay') {
      board.status = spec.board;
      board.rank = spec.board === 'done' ? spec.rank : null;
      board.top = spec.board === 'done' ? DEFAULT_ROWS : null;
    }
    // 自检：参数说要摆到哪，屏上就得真在那儿。仪器自己报错，不等肉眼发现「4300 步拍成 2 步」。
    if (spec.screen === 'play' || spec.screen === 'dead' || spec.screen === 'replay') {
      const got = Math.floor(game.score.distanceM);
      if (Math.abs(got - spec.dist) > Math.max(24, spec.dist * 0.1)) {
        warnings.push(`取景自检失败：要求 dist=${spec.dist}，实际 ${got} 步`);
      }
    }
    deps.setOverlay(spec.screen === 'help' ? 'help' : spec.screen === 'lang' ? 'lang' : 'none');
    deps.setAvOpen(spec.avOpen);
    deps.setHintSuppressed(spec.noHint);
    deps.setLangHint(spec.langHint);
    // 飘字与反馈条都是「事件发生后出现若干秒」的东西，取景时按参数钉住它。
    // 文案取主程序真正会拼出来的那串（击杀是 +分数、拾光是 +10 ×倍率），
    // 位置由主程序按玩家当前头顶算——取景不必自己再算一遍。
    switch (spec.popup) {
      case 'copied': deps.spawnPopup(t('share.copied')); break;
      case 'water': deps.spawnPopup(t('pop.water')); break;
      case 'bounce': deps.spawnPopup(t('pop.bounce')); break;
      case 'backstab': deps.spawnPopup(t('pop.backstab')); break;
      case 'stride': deps.spawnPopup(t('pop.stride')); break;
      case 'kill': deps.spawnPopup(`+${BACKSTAB_BONUS}`); break;
      case 'mote': deps.spawnPopup(`+${MOTE_SCORE}  ×${game.score.multiplier.toFixed(1)}`); break;
      default: break;
    }
    if (spec.notice) deps.setNotice(spec.notice === 'fail' ? 'avatar.fail' : 'avatar.done');
  }
  apply();

  // 主循环停摆：HUD 脉动、连杀计时、长夜逼近都不该在取证时自己走。
  // 活格子里点了牌子需要重绘，显式调 draw。
  deps.loop.stop();

  // 结局图在续传批里，结算屏要等它到货才报 ready
  let settled = false;
  const needEndings = spec.screen === 'dead' || spec.screen === 'replay';
  const deadline = Date.now() + 6000;
  for (;;) {
    if (!needEndings || assets.endingArts.length > 0) { settled = true; break; }
    if (Date.now() > deadline) break;
    await new Promise(r => setTimeout(r, 80));
  }

  let ink: InkEntry[] = [];
  let recording = false;
  const ctxProto = CanvasRenderingContext2D.prototype;
  const origFillText = ctxProto.fillText;
  ctxProto.fillText = function (
    this: CanvasRenderingContext2D, text: string, x: number, y: number, maxW?: number,
  ) {
    if (recording) {
      const m = /([\d.]+)px/.exec(this.font);
      const style = this.fillStyle;
      const tm = this.getTransform();
      ink.push({
        text, x, y,
        fontPx: m ? Number(m[1]) : 0,
        family: String(this.font).replace(/^[\d.\spx]+/, ''),
        fill: typeof style === 'string' ? style : 'gradient',
        align: this.textAlign, baseline: this.textBaseline,
        maxW: maxW === undefined ? null : maxW,
        alpha: this.globalAlpha,
        shadowBlur: this.shadowBlur,
        shadowColor: typeof this.shadowColor === 'string' ? this.shadowColor : '',
        a: tm.a, d: tm.d, e: tm.e, f: tm.f,
        w: this.measureText(text).width,
      });
    }
    return origFillText.call(this, text, x, y, maxW);
  };

  const fitNow = (): DpFit => {
    const vw = renderer.viewWidth, uiH = uiHeight();
    return {
      vw, uiH,
      canvasW: canvas.width, canvasH: canvas.height,
      cssW: canvas.clientWidth, cssH: canvas.clientHeight,
      scale: Math.min(canvas.width / vw, canvas.height / uiH),
    };
  };
  const realNow = performance.now.bind(performance);
  /** 上一次取景钉住的那个时刻。指针事件后的重绘要沿用它，见 `redraw`。 */
  let lastT = 0;
  function draw(tMs = 0) {
    lastT = tMs;
    // 把时间钉住：光柱摆动、日轮呼吸、大招脉动、「按任意键」的闪烁全都可复现
    performance.now = () => tMs;
    try { deps.presentFrame(); } finally { performance.now = realNow; }
  }
  /**
   * 按**上一次那个时刻**重绘一帧——给指针事件用。
   *
   * 事件后若拿 `performance.now()` 重绘，世界就解冻到另一相位：光柱转了、日轮胀了，
   * 配对帧实拍量到 25% 的差，看着像"悬停改了一大片"，其实全是时间漂移。
   * 悬停取证要的是"只有指针那一路变了"，所以这里必须冻在同一时刻。
   */
  function redraw() { draw(lastT); }

  const api: DpApi = {
    spec, warnings, ready: false, settled, screens: DP_SCREENS,
    draw,
    redraw,
    shoot: (tMs = 0) => {
      ink = []; recording = true;
      try { draw(tMs); } finally { recording = false; }
      return { ink, fit: fitNow() };
    },
    geom: () => {
      const vw = renderer.viewWidth, coarse = spec.coarse;
      const soundY = helpSoundCenterY(coarse);
      return {
        vw, uiH: uiHeight(), coarse,
        chipL: chipRect('left', vw), chipR: chipRect('right', vw), chip: CHIP,
        help: helpPanelBounds(vw, coarse),
        sound: { cx: vw / 2, cy: soundY, ...SOUND_BTN },
        menu: MENU_PANEL,
        menuRows: [0, 1, 2, 3, 4].map(langMenuRowCenter),
      };
    },
    toClient: (wx, wy) => {
      const vw = renderer.viewWidth, uiH = uiHeight();
      const scale = Math.min(canvas.width / vw, canvas.height / uiH);
      const offX = (canvas.width - vw * scale) / 2, offY = (canvas.height - uiH * scale) / 2;
      const per = canvas.clientWidth / canvas.width;
      return { x: (wx * scale + offX) * per, y: (wy * scale + offY) * per };
    },
    setSpec: (patch) => { Object.assign(spec, patch); apply(); draw(); },
  };

  draw();
  api.ready = true;
  (window as unknown as { __dp?: DpApi }).__dp = api;
  return api;
}
