import type { Game } from '../game/game';
import { rgb, type Theme } from './theme';
import { WORLD_H, MULT_MAX, MULT_PER_MOTE, DYING_TIME, DEATH_FADE } from '../game/constants';
import type { BoardState } from '../api/leaderboard';
import { t, tf, tTouch, punct, MID, rankKeyFor, fontKai, fontHud, fontKaiFor, getLocale, LOCALES, type Locale, type StringKey } from './strings';
import { drawFit, estWidth } from './text';
import { uiHeight, uiFont, uiInsetL, uiInsetR, uiInsetT, uiInsetB } from './viewport';

const DEATH_KEY: Record<string, StringKey> = {
  spike: 'death.spike',
  fall: 'death.fall',
  darkness: 'death.darkness',
  enemy: 'death.enemy',
};

// 集满倍率所需光点数（倍率 1 + n*MULT_PER_MOTE 触顶 MULT_MAX）
const MOTES_FOR_MAX = Math.round((MULT_MAX - 1) / MULT_PER_MOTE);

type RGB = [number, number, number];

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 笔意细线：两端渐隐的横向分隔，替生硬直线。 */
function brushRule(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, color: RGB, alpha = 0.6) {
  const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, rgb(color, 0));
  g.addColorStop(0.5, rgb(color, alpha));
  g.addColorStop(1, rgb(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - w / 2, y, w, 1.4);
}

/** 小日轮字形：替代表情符号 ☀，与全局风格统一。 */
function sunGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: RGB) {
  ctx.save();
  ctx.fillStyle = rgb(color, 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgb(color, 0.65);
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 1.6), cy + Math.sin(a) * (r + 1.6));
    ctx.lineTo(cx + Math.cos(a) * (r + 3.4), cy + Math.sin(a) * (r + 3.4));
    ctx.stroke();
  }
  ctx.restore();
}

/** 界面层的当帧环境：由主程序注入，绘制侧据此让位与收敛。 */
export interface UiChrome {
  /** HTML 的换形象条正展开着——标题页那行「按任意键」被它压住，让位。 */
  avatarOpen: boolean;
  /** 系统要求减弱动效：闪烁与脉动一律停在可读的那一相。 */
  reduceMotion: boolean;
  /** 鼠标正悬停在哪枚画布控件上。触屏没有 hover，恒为 null。 */
  hover?: UiTarget | null;
  /** 指针按下且尚未抬起的那枚。与 hover 分开，是为了让「按下去」有独立的一相。 */
  pressed?: UiTarget | null;
}

/**
 * HUD 最底一行相对 TY 的偏移与它的字号。
 *
 * 顶部遮罩的下沿由这两个数推出来，不再写「屏高的 16%」：HUD 那一摞是**固定像素**，
 * 遮罩却是比例——900px 高的屏上遮罩 144px 盖得住最后一行，568×320 上只剩 51px，
 * 「连击 3 ×2.0」与「步」整行落在遮罩外（实拍 4.34 / 3.78，跌破 4.5）。
 * 按满格（有连击）取，不按当下画了几行取：否则连击一起来遮罩就往下撑一截，
 * 读作闪烁。
 */
export const HUD_BOTTOM = { offset: 81, fontPx: 16 };
/** 遮罩要盖过最后一行的下沿，再留一点呼吸。 */
export const hudBandBottom = (ty: number, uiH = uiHeight()) =>
  Math.max(uiH * 0.16, ty + HUD_BOTTOM.offset + uiFont(HUD_BOTTOM.fontPx) + 8);

const STILL: UiChrome = { avatarOpen: false, reduceMotion: false, hover: null, pressed: null };


/**
 * 画布上「指得着」的控件。
 *
 * 这些界面全画在 canvas 里，DOM 上没有对应节点，所以浏览器不会替我们给任何
 * 指针反馈。上一轮实拍量出来：四枚画布控件的悬停帧与静止帧 **PNG md5 逐字节相同**，
 * 而同屏的 DOM 控件与触屏虚拟键都会变——一套界面里存在两套词汇。
 * 这一组类型就是给画布补上那套词汇的坐标。
 */
export type UiTarget =
  | { id: 'chipL' | 'chipR' | 'sound' }
  | { id: 'langRow'; index: number };

export function sameUiTarget(a: UiTarget | null | undefined, b: UiTarget | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.id !== b.id) return false;
  return a.id === 'langRow' ? b.id === 'langRow' && a.index === b.index : b.id !== 'langRow';
}

/** 指针此刻的可见状态：决定哪些控件在屏上、因而哪些指得着。 */
export interface UiPresence {
  state: 'title' | 'playing' | 'dead' | string;
  langMenuOpen: boolean;
  helpOpen: boolean;
  coarse: boolean;
}

/**
 * 这一点落在哪枚画布控件上？
 *
 * **点选、悬停、按压、光标样式四家共用这一份判据**——分四处写必然漂移，
 * 而漂移的表现是「亮的是这枚、点下去开的是那枚」。
 * 入参为世界坐标（须先经 Renderer.screenToWorld）：这些控件画在 renderUI 的
 * 信箱化变换里，拿屏幕比例去比在非 16:9 视口下会错开几行。
 */
export function uiTargetAt(
  world: { x: number; y: number }, vw: number, up: UiPresence,
): UiTarget | null {
  const fx = world.x / vw;
  const fy = world.y / uiHeight();
  if (up.langMenuOpen) {
    const hit = langMenuHit(fx, fy);
    if (!hit) return null;                       // 面板之外不是控件
    const index = LOCALES.findIndex(l => l.id === hit);
    return index < 0 ? null : { id: 'langRow', index };
  }
  if (up.helpOpen) {
    // 声音钮只在触屏端画（桌面用 M 键），故也只有触屏端指得着
    return up.coarse && helpSoundHit(world.x, world.y, vw) ? { id: 'sound' } : null;
  }
  // 两枚牌的出场条件与绘制处一致：语言牌在标题与结算，帮助牌只在标题
  const showsChips = up.state === 'title' || up.state === 'dead';
  if (!showsChips) return null;
  if (chipHit('right', world.x, world.y, vw)) return { id: 'chipR' };
  if (up.state === 'title' && chipHit('left', world.x, world.y, vw)) return { id: 'chipL' };
  return null;
}

/**
 * 控件此刻的指针档位：0 静止、1 悬停、2 按下。
 *
 * 只给档位、不给具体值——各控件的静止描边本来就不同（牌 0.45、声音钮 0.7），
 * 由它们自己在静止值上加一档。这样"没指针时"的画法逐字节不变，
 * 上一轮的实拍基线不会因为这轮改动而漂移。
 */
export type UiPointerLevel = 0 | 1 | 2;

export function uiLevel(target: UiTarget, chrome: UiChrome): UiPointerLevel {
  if (sameUiTarget(target, chrome.pressed)) return 2;
  if (sameUiTarget(target, chrome.hover)) return 1;
  return 0;
}

export function drawUI(ctx: CanvasRenderingContext2D, game: Game, theme: Theme, best: number, board: BoardState, vw: number, coarse = false, chrome: UiChrome = STILL) {
  ctx.textBaseline = 'top';
  if (game.state === 'playing') {
    const s = game.score;
    // HUD 全部压在动世界上：统一一层暗影托底（右列的「路程」本来就有，左列却没有——
    // 实测同一屏里 日光/倍率 4.44、连击 3.15，而有暗影的「路程」区只输在 α 上）。
    ctx.shadowColor = 'rgba(8,4,2,0.9)';
    ctx.shadowBlur = 12;
    // 顶部再给一条极淡的压暗：12px 的小标签只有两个字，字框里大半像素落在笔画阴影之外，
    // 拂晓那段亮天上它们停在 3.7–3.8。这条渐变吃到的深度由 HUD 那一摞自己报
    // （见 hudBandBottom），地形顶在 50% 以下，不动玩法区。
    // 左上：功业（主角分）+ 日光/倍率；右上高处：路程——与右侧日轮亮核错开，左右均衡
    // 边距经 uiInset*：设计值是世界单位、在小屏上物理更小，而刘海/圆角/home 指示条
    // 恰恰只出现在小屏上。见 viewport.ts 的安全区一节。
    const HX = uiInsetL(22);
    const TY = uiInsetT(11);
    const hudBand = hudBandBottom(TY);
    const hg = ctx.createLinearGradient(0, 0, 0, hudBand);
    hg.addColorStop(0, 'rgba(8,4,2,0.34)');
    hg.addColorStop(1, 'rgba(8,4,2,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, vw, hudBand);
    ctx.textAlign = 'left';
    // 功业（总分·主角）
    ctx.font = `${uiFont(12)}px ${fontKai()}`;
    ctx.fillStyle = 'rgba(240,228,210,0.8)';
    ctx.fillText(t('hud.score'), HX, TY);
    ctx.font = `${uiFont(30)}px ${fontHud()}`;
    ctx.fillStyle = '#f7ecd8';
    ctx.fillText(`${s.total}`, HX, TY + 14);
    brushRule(ctx, HX + 48, TY + 51, 96, theme.glow, 0.4);
    // 日光 → 倍率（日轮字形 + 因果）：紧随功业，构成"计分"一组
    const maxed = s.motes >= MOTES_FOR_MAX;
    ctx.font = `${uiFont(14)}px ${fontHud()}`;
    const lightText = maxed
      ? `${t('hud.brimful')}  →  ${t('hud.mult')} ×${s.multiplier.toFixed(1)}`
      : `${t('hud.motes')} ${s.motes}/${MOTES_FOR_MAX}  →  ${t('hud.mult')} ×${s.multiplier.toFixed(1)}`;
    sunGlyph(ctx, HX + 5, TY + 65, 4, theme.glow);
    ctx.fillStyle = rgb(theme.glow, 0.95);
    ctx.fillText(lightText, HX + 16, TY + 61);
    // 连杀：清版格斗的分数引擎，断连前淡出让「要断了」看得见
    if (game.combo.count >= 2) {
      ctx.font = `${uiFont(HUD_BOTTOM.fontPx)}px ${fontHud()}`;
      // 淡出是 Combo 的契约（「要断了」看得见），但可读性是绘制侧的事：
      // 原先一路淡到 0，最后那截其实已经看不清了却还占着一行。兜到 .62，到点直接不画。
      // 亮金压在亮地上顶不到 4.5（实测 3.4），往白里走一档再靠暗影拉开差距
      ctx.fillStyle = rgb([255, 232, 190], Math.max(0.62, game.combo.alpha));
      ctx.fillText(`${t('hud.combo')} ${game.combo.count}  ×${game.combo.multiplier.toFixed(1)}`, HX + 16, TY + HUD_BOTTOM.offset);
    }
    // 右上高处：路程（进度基石）——置于日轮亮核上方偏外，暗影确保浮于辉光之上可读
    const RX = vw - uiInsetR(22);
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(8,4,2,0.6)'; ctx.shadowBlur = 7;
    ctx.font = `${uiFont(12)}px ${fontKai()}`;
    ctx.fillStyle = 'rgba(240,228,210,0.88)';
    ctx.fillText(t('hud.dist2'), RX, TY);
    ctx.font = `${uiFont(26)}px ${fontHud()}`;
    ctx.fillStyle = 'rgba(247,236,216,0.95)';
    ctx.fillText(`${Math.floor(s.distanceM)}`, RX, TY + 14);
    ctx.font = `${uiFont(11)}px ${fontKai()}`;
    ctx.fillStyle = 'rgba(240,228,210,0.82)';
    ctx.fillText(t('hud.dist'), RX, TY + 46);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // 叙事旁白（《山海经》碎片，上方居中，楷书+辉光，淡入淡出）
    const nar = game.narration;
    if (nar) {
      const narY = uiHeight() * 0.32;
      ctx.textAlign = 'center';
      ctx.shadowColor = rgb(theme.glow, 0.9 * nar.alpha);
      ctx.shadowBlur = 22;
      ctx.fillStyle = rgb([248, 238, 222], nar.alpha);
      // 旁白 key 由 game 的里程碑表在运行时给出，形如 'nar.N'
      drawFit(ctx, t(nar.key as StringKey), vw / 2, narY, vw - 80, uiFont(28), fontKai());
      // 出处另起一行、小一号：外语须标注典籍，中文主脉留空则不画
      const narSrc = t(`${nar.key}.src` as StringKey);
      if (narSrc) {
        ctx.shadowBlur = 10;
        ctx.fillStyle = rgb([248, 238, 222], nar.alpha * 0.62);
        drawFit(ctx, narSrc, vw / 2, narY + 34, vw - 160, uiFont(15), fontKai());
      }
      ctx.shadowBlur = 0;
    }
    // 新手情境提示（底部居中，脉动辉光）
    const hint = game.hint;
    if (hint) {
      // 教学提示画在 0.72 高度，那一带正是剪影树线——最杂的背景。此前用
      // 辉光色当阴影（亮底上等于没有阴影）、脉动又低到 0.2，于是新手最需要
      // 它的时候恰好看不清。改：暗影托底保证任何背景上都读得出，脉动只在
      // 0.55~1 之间起伏（仍在呼吸，但不再隐身）。
      // 减弱动效时停在 .95，不再起伏
      const pulse = chrome.reduceMotion ? 0.95 : 0.9 + 0.1 * Math.sin(performance.now() / 320);
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(8,4,2,0.85)';
      ctx.shadowBlur = 10;
      // 字色由辉光金改暖白：亮金压在亮地上实测只有 3.40:1（五语种同值），
      // 抬 α 治不了——病灶是色相差太小，不是不透明。
      ctx.fillStyle = `rgba(255,246,228,${pulse.toFixed(3)})`;
      drawFit(ctx, tTouch(hint, coarse), vw / 2, uiHeight() * 0.72, vw - 80, uiFont(18), fontKai());
      ctx.shadowBlur = 0;
    }

    // 大招·神力槽（底部居中）：圆端细槽 + 金泉渐充；满则朱印「夸」脉动待发
    ctx.shadowBlur = 0;
    const barW = 200, barH = 6;
    const bx = vw / 2 - barW / 2, by = uiHeight() - 26;
    const ready = game.chargeReady;
    const frac = Math.min(1, game.charge);
    roundRectPath(ctx, bx, by, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(10,6,4,0.55)';
    ctx.fill();
    if (frac > 0.005) {
      roundRectPath(ctx, bx, by, Math.max(barH, barW * frac), barH, barH / 2);
      const fg = ctx.createLinearGradient(bx, 0, bx + barW, 0);
      fg.addColorStop(0, rgb(theme.glow, 0.72));
      fg.addColorStop(1, ready ? 'rgba(255,190,110,1)' : rgb(theme.glow, 1));
      ctx.fillStyle = fg;
      ctx.fill();
    }
    roundRectPath(ctx, bx, by, barW, barH, barH / 2);
    ctx.strokeStyle = rgb(theme.glow, ready ? 0.7 : 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.font = `${uiFont(12)}px ${fontKai()}`;
    // 全 HUD 唯一没暗影的字：α .6 的暖白压在焦土上实测 4.15:1（右侧「路程」有暗影所以 5+）
    ctx.shadowColor = 'rgba(8,4,2,0.6)'; ctx.shadowBlur = 7;
    ctx.fillStyle = 'rgba(255,240,220,0.8)';
    ctx.fillText(t('hud.charge'), bx - 10, by - 4);
    ctx.shadowBlur = 0;
    if (ready) {
      // 新手不知道攒满的「神力」是个大招：槽满之前它只是一条会变长的细线，槽满
      // 之后的告示又只有 15px、贴在画面最底、还会脉动到 0.55——正好落在视线之外。
      // 与教学提示同一套处理：字号提到 18、暗影托底、脉动只在 0.7~1 之间。
      const pulse = chrome.reduceMotion ? 0.95 : 0.9 + 0.1 * Math.sin(performance.now() / 200);
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(8,4,2,0.85)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(255,246,228,${pulse.toFixed(3)})`;
      drawFit(ctx, tTouch('hint.ult', coarse), vw / 2, by - 26, vw - 80, uiFont(18), fontKai());
      ctx.shadowBlur = 0;
    }
    return;
  }

  if (game.state === 'title') {
    ctx.textAlign = 'center';
    // 文字带衬底：题名以下那几行全画在美术图上，而这一屏最亮的正是落日——实拍
    // 楔子 2.94 / 模式行 2.19（英文 2.02）/ 操作行 2.52 / 起始提示 2.59。结算页读得出来
    // 是因为有一层压暗，这一屏缺的就是那一层。渐变只在文字带内起落，不吃掉落日本体。
    const bandTop = uiHeight() * 0.335, bandH = uiHeight() * 0.545;
    const scrim = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
    scrim.addColorStop(0, 'rgba(10,6,4,0)');
    scrim.addColorStop(0.42, 'rgba(10,6,4,0.52)');
    scrim.addColorStop(1, 'rgba(10,6,4,0.40)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, bandTop, vw, bandH);
    // 题名·逐光
    const titleY = uiHeight() * 0.22;
    ctx.font = `${uiFont(54)}px ${fontKai()}`;
    // 阴影改暗：原先拿辉光色当阴影压在亮天上，等于给自己蒙一层雾（实测 3.63–4.43）
    ctx.shadowColor = 'rgba(8,4,2,0.75)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#f7ecd8';
    ctx.fillText(t('title.main'), vw / 2, titleY);
    // 笔意细线分隔
    brushRule(ctx, vw / 2, uiHeight() * 0.35, 280, theme.glow, 0.5);
    // 副题·夸父逐日
    ctx.font = `${uiFont(22)}px ${fontKai()}`;
    ctx.fillStyle = rgb(theme.glow, 0.95);
    ctx.fillText(t('title.sub'), vw / 2, uiHeight() * 0.385);
    // 楔子
    ctx.fillStyle = 'rgba(240,228,210,0.88)';
    drawFit(ctx, t('title.prologue'), vw / 2, uiHeight() * 0.45, vw - 100, uiFont(14), fontKai());
    // 模式横幅：常规无尽 / 今日挑战 + 切换提示。
    // 横幅上**不带日期**：种子按 UTC 日派发是全球同关的前提（不能改），可 UTC+8 的
    // 玩家每天 00:00–08:00 看到的标签会是"昨天"，西岸反过来。一句读起来像 bug 的
    // 真话不如不说——榜单本来就按日分键，玩家不需要知道那个键长什么样。
    const daily = game.mode === 'daily';
    ctx.font = `${uiFont(19)}px ${fontKai()}`;
    ctx.fillStyle = rgb(theme.glow, 0.98);
    ctx.fillText(daily ? t('mode.daily') : t('mode.endless'), vw / 2, uiHeight() * 0.52);
    ctx.fillStyle = 'rgba(240,228,210,0.86)';
    drawFit(ctx, `${t(daily ? 'mode.dailyHint' : 'mode.endlessHint')}${MID}${tTouch('mode.switch', coarse)}`, vw / 2, uiHeight() * 0.52 + 26, vw - 100, uiFont(12), fontKai());
    // 只显示当前设备的操作行：触屏端示按钮，键盘端示键位（两行并陈徒增噪）
    ctx.fillStyle = 'rgba(255,248,235,0.95)';
    drawFit(ctx, t(coarse ? 'title.ctrl3' : 'title.ctrl1'), vw / 2, uiHeight() * 0.63, vw - 100, uiFont(15), fontKai());
    drawFit(ctx, t('title.ctrl2'), vw / 2, uiHeight() * 0.63 + 26, vw - 100, uiFont(15), fontKai());
    ctx.shadowBlur = 0;
    // 起始提示：原先是 600ms 一间隔的硬闪——整屏唯一的动作指引，每 1.2 秒有 0.6 秒
    // 是空的，且完全不理「减弱动效」。改成亮度呼吸（永不消失），减弱动效下恒亮。
    // 换形象条展开时它正被那一排圆压住（实测 126×7px 交叠），此时让位。
    if (!chrome.avatarOpen) {
      const breathe = chrome.reduceMotion ? 1 : 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(performance.now() / 420));
      ctx.fillStyle = `rgba(255,243,216,${breathe.toFixed(3)})`;
      ctx.shadowColor = 'rgba(8,4,2,0.9)'; ctx.shadowBlur = 12;
      ctx.font = `${uiFont(16)}px ${fontKai()}`;
      ctx.fillText(tTouch('title.start', coarse), vw / 2, uiHeight() * 0.75);
      ctx.shadowBlur = 0;
    }
    // 下角两枚牌：左「? 帮助」、右「地球 当前语言」。
    // 原本是两行暗淡文字，读起来像操作说明而非可点控件。
    drawHelpChip(ctx, theme, vw, coarse, chrome);
    drawLangChip(ctx, theme, vw, coarse, chrome);
    return;
  }

  // dead（结局图与压暗由渲染层绘制，此处只叠字）
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';   // 结局图较亮，统一暗影托字，暗淡文案亦可读
  ctx.shadowBlur = 7;

  const st = game.runStats;
  // 死因·升华为神话之句。
  // 回放与结算页**共用同一位置与字号**，中间只有透明度在变——死因是这两屏之间
  // 唯一贯穿的东西，位置一跳，「定格→结算」就断成两个画面而不是一次收束。
  const causeFade = game.dying
    ? Math.min(1, (1 - game.dyingT / DYING_TIME) * 3.2) // 回放前三成时间里浮出
    : 1;
  ctx.font = `${uiFont(22)}px ${fontKai()}`;
  ctx.fillStyle = `rgba(248,238,222,${(0.88 * causeFade).toFixed(3)})`;
  ctx.fillText(t(DEATH_KEY[game.deathCause ?? 'darkness'] ?? 'death.darkness'), vw / 2, uiHeight() * 0.22);

  // 成绩、称号、榜单随结局图一起淡入（见 renderer 的 endingAlpha，同一条曲线）。
  // 回放主体那一秒多里它们一律不上：一上就把死亡现场盖住了，而那正是回放的全部意义。
  const contentAlpha = game.dying ? Math.max(0, 1 - game.dyingT / DEATH_FADE) : 1;
  if (contentAlpha <= 0) {
    ctx.shadowBlur = 0;
    return;
  }
  ctx.globalAlpha = contentAlpha;
  // 功业·本局总分，朱印钤记（如画作落款用印）
  ctx.font = `${uiFont(48)}px ${fontHud()}`;
  ctx.fillStyle = '#f7ecd8';
  const scoreStr = `${st?.score ?? 0}`;
  ctx.fillText(scoreStr, vw / 2, uiHeight() * 0.30);
  brushRule(ctx, vw / 2, uiHeight() * 0.30 + 62, 200, theme.glow, 0.42);
  // 称号：按本局功业授名（身份与进阶感）
  ctx.font = `${uiFont(21)}px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow, 1);
  // 称号的引号族按语种选（英文屏上不该出现「Sun-Chaser」这种四不像）
  ctx.shadowColor = 'rgba(8,4,2,0.85)'; ctx.shadowBlur = 10;
  const q = punct();
  ctx.fillText(`${q.lq}${t(rankKeyFor(st?.score ?? 0))}${q.rq}`, vw / 2, uiHeight() * 0.40);
  ctx.shadowBlur = 0;
  ctx.font = `${uiFont(15)}px ${fontKai()}`;
  ctx.fillStyle = 'rgba(255,245,230,0.9)';
  // 这行是拼出来的，也走 drawFit：拼串类绘制点全都不在宽度回归里（T10 同一盲区）
  // 分隔符用裸 MID，与其余四处一致。原本两侧各留了 4 个字面空格（上一轮把 MID
  // 插在空格中间没收掉），于是这一行的间隙是全游戏最宽的三倍。
  drawFit(ctx, `${t('death.dist')} ${st?.distanceM ?? 0} ${t('hud.dist')}${MID}${t('death.best')} ${best}`, vw / 2, uiHeight() * 0.46, vw - 100, uiFont(15), fontKai());
  // 榜
  ctx.font = `${uiFont(13)}px ${fontKai()}`;
  ctx.fillStyle = 'rgba(255,245,230,0.75)';
  let y = uiHeight() * 0.52;
  if (board.status === 'pending') {
    drawFit(ctx, t('death.pending'), vw / 2, y, vw - 80, uiFont(13), fontKai());
  } else if (board.status === 'offline') {
    // 现在这行会把「为什么没上榜」说清楚，比原来光一个「离线」长得多，
    // 必须走 drawFit——窄视口下 fillText 会直接顶出画布。
    drawFit(ctx, t('death.offline'), vw / 2, y, vw - 80, uiFont(13), fontKai());
  } else if (board.status === 'done') {
    ctx.fillStyle = rgb(theme.glow, 0.9);          // 榜名：今日挑战榜 / 天下逐日榜
    ctx.fillText(t(game.mode === 'daily' ? 'board.daily' : 'board.endless'), vw / 2, y);
    brushRule(ctx, vw / 2, y + 18, 120, theme.glow, 0.35);
    y += 26;
    ctx.fillStyle = 'rgba(255,245,230,0.75)';
    ctx.fillText(`${t('death.rank')} ${board.rank ?? '?'}`, vw / 2, y);
    y += 15;
    // 短屏（裁天空后可见高只有 448）榜身摆不下五行：字号未随之缩小，末行
    // 「按 R · 再逐一程」——这一屏唯一的出口——会被挤到画外。榜在手机上本
    // 就是一瞥，且自己的名次另有「天下第 N」单独一行，砍到三行不丢信息。
    const rows = uiHeight() < WORLD_H ? 3 : 5;
    const shown = (board.top ?? []).slice(0, rows);
    // 三列各自定位（名次／名字／分数）。原先是一整串居中，名字长短不一把分数
    // 推得东倒西歪，五行读不出一条线；分数右对齐才看得出高低。
    ctx.font = `${uiFont(13)}px ${fontKai()}`;
    const names = shown.map(r => boardName(r.name));
    const rankW = ctx.measureText('88. ').width;
    const nameW = Math.max(40, ...names.map(n => ctx.measureText(n).width));
    const scoreW = Math.max(24, ...shown.map(r => ctx.measureText(String(r.score)).width));
    const blockW = rankW + nameW + 18 + scoreW;
    const colX = vw / 2 - blockW / 2;
    shown.forEach((row, i) => {
      // 榜上有我就点亮那一行——否则玩家盯着五个名字也认不出哪个是自己，
      // 「天下第 37」与榜身之间没有任何视觉关联
      const mine = board.rank === i + 1;
      ctx.fillStyle = mine ? rgb(theme.glow, 0.95) : 'rgba(255,245,230,0.75)';
      y += 15;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}.`, colX, y);
      ctx.fillText(names[i], colX + rankW, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(row.score), colX + blockW, y);
      ctx.textAlign = 'center';
    });
    ctx.fillStyle = 'rgba(255,245,230,0.75)';
  }

  // 底部收尾：随榜单高度自适应下移，避免与榜行相撞
  let fy = deadFooterY(y);
  ctx.font = `${uiFont(16)}px ${fontKai()}`;
  ctx.fillStyle = 'rgba(240,228,210,0.78)';
  ctx.fillText(t('death.footer'), vw / 2, fy);      // 弃其杖，化为邓林
  // 分享是这一屏的第二动作，此前 0.6 的暖白压在亮结局图上近乎隐形，
  // 等于没有出口；提到与「再逐一程」相称的亮度。
  ctx.fillStyle = 'rgba(255,240,220,0.85)';
  drawFit(ctx, tTouch('death.share', coarse), vw / 2, fy + 30, vw - 80, uiFont(13), fontKai());
  ctx.fillStyle = rgb(theme.glow);
  drawFit(ctx, tTouch('death.restart', coarse), vw / 2, fy + 60, vw - 80, uiFont(16), fontKai());
  ctx.shadowBlur = 0;
  // 死亡页也放一枚语言牌：触屏此前只能在标题页切语言，结算页是唯一「盯着
  // 一屏文字却没有任何菜单入口」的地方，这正是要补的可达性缺口。
  drawLangChip(ctx, theme, vw, coarse, chrome);
  ctx.globalAlpha = 1; // 淡入用的 alpha 必须还原：ctx 跨帧复用，泄漏会让整屏越画越淡
}

/** 竖屏提示：触屏竖持时**铺满整屏**（在设备像素空间绘制，不受世界视口信箱化影响）
 *  提示旋转横屏，避免大幅黑边与局促视野。w/h 为 CSS 像素屏幕尺寸。 */
/**
 * 竖持提示。`canFullscreen` 为真时多给一行「点一下就替你办」——
 *
 * 「请旋转设备」对**开了系统方向锁的人是句做不到的话**，而那正是首触自动锁横屏
 * 要救的那批人：他们物理转手机也转不过来，此前只能一直盯着这句提示。所以要把
 * 「你去转」换成「点一下，我来转」。但这句只在浏览器真支持全屏时才出现——
 * iPhone Safari 不实现元素全屏，那里点了什么也不会发生，许诺一件不会兑现的事
 * 比不许诺更糟。
 */
export function drawRotateHint(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number, canFullscreen = false) {
  ctx.fillStyle = 'rgba(14,8,6,0.96)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = w / 2, cy = h / 2;
  const s = Math.max(1, Math.min(w, h) / 390); // 以手机为基准，大屏平板等比放大
  // 旋转的手机意象（简笔）
  ctx.save();
  ctx.translate(cx, cy - 44 * s);
  ctx.rotate(-0.35 + Math.sin(performance.now() / 600) * 0.12);
  ctx.strokeStyle = rgb(theme.glow, 0.9);
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(-46 * s, -28 * s, 92 * s, 56 * s);
  ctx.strokeRect(-38 * s, -20 * s, 76 * s, 40 * s);
  ctx.restore();
  // 两句都走 drawFit：它们是「按字号 × 字数」最可能出血的地方（ko/en 最长），
  // 而这一屏恰恰只在窄机上出现。原先只有第三句走了，前两句是裸 fillText。
  ctx.fillStyle = '#f7ecd8';
  drawFit(ctx, t('rotate.hint'), cx, cy + 40 * s, w - 48 * s, Math.round(26 * s), fontKai());
  ctx.fillStyle = rgb(theme.glow, 0.92);
  drawFit(ctx, t('rotate.sub'), cx, cy + 76 * s, w - 48 * s, Math.round(18 * s), fontKai());
  if (canFullscreen) {
    // 走 drawFit：这句是五语种里最长的一条，竖屏只有 390 CSS px 宽，
    // 直接 fillText 会横着漏出屏幕两侧
    ctx.fillStyle = 'rgba(240,228,210,0.62)';
    drawFit(ctx, t('rotate.tap'), cx, cy + 108 * s, w - 48 * s, Math.round(14 * s), fontKai());
  }
  ctx.textBaseline = 'top';
}

/** 喇叭字形（线描，与 sunGlyph 同调）；muted 时叠一斜杠。 */
function speakerGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: RGB, alpha: number, muted: boolean) {
  ctx.save();
  ctx.strokeStyle = rgb(color, alpha);
  ctx.fillStyle = rgb(color, alpha);
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  // 箱体 + 喇叭口
  ctx.beginPath();
  ctx.moveTo(cx - 5 * s, cy - 2.2 * s);
  ctx.lineTo(cx - 2 * s, cy - 2.2 * s);
  ctx.lineTo(cx + 1.5 * s, cy - 5 * s);
  ctx.lineTo(cx + 1.5 * s, cy + 5 * s);
  ctx.lineTo(cx - 2 * s, cy + 2.2 * s);
  ctx.lineTo(cx - 5 * s, cy + 2.2 * s);
  ctx.closePath();
  ctx.fill();
  if (muted) {
    ctx.beginPath();
    ctx.moveTo(cx + 3.5 * s, cy - 3.5 * s);
    ctx.lineTo(cx + 8 * s, cy + 3.5 * s);
    ctx.stroke();
  } else {
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx + 1.5 * s, cy, (2 + i * 2.4) * s, -0.9, 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 帮助/操作说明浮层（H 键切换）。muted 决定声音开关显示；coarse 时才画可点的声音钮。 */
/** 浮层面板的世界坐标边界。绘制与内容排版共用，故单独成函数便于测试。 */
export function overlayPanelBounds(vw: number, topFy: number, bottomFy: number, widthFrac: number) {
  const w = vw * widthFrac;
  const x0 = (vw - w) / 2;
  return { x0, x1: x0 + w, y0: uiHeight() * topFy, y1: uiHeight() * bottomFy };
}

/**
 * 浮层面板：遮罩 + 圆角面板 + 描边。
 *
 * 抽出来是因为帮助浮层原本只有一层压暗、没有面板，标题页的大标题与楔子
 * 会整片透在帮助文字之后；而语言菜单有面板。两个同级浮层各画各的，视觉
 * 语言不一致，现在统一走这里。
 */
export function overlayPanel(
  ctx: CanvasRenderingContext2D, theme: Theme, vw: number,
  topFy: number, bottomFy: number, widthFrac = 0.4,
) {
  ctx.fillStyle = 'rgba(10,6,4,0.86)';
  ctx.fillRect(0, 0, vw, uiHeight());

  const b = overlayPanelBounds(vw, topFy, bottomFy, widthFrac);
  roundRectPath(ctx, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 10);
  ctx.fillStyle = 'rgba(24,14,9,0.92)';
  ctx.fill();
  ctx.strokeStyle = rgb(theme.glow, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
  return b;
}

/**
 * 帮助浮层的内容布局常量。绘制与命中共用，避免两处各写一份而漂移。
 *
 * 数值按 576 的世界高手调，故整体随可见高等比收拢（见 viewport 的 skyCrop）：
 * 触屏端的内容高本就是 470，逼近 576，短屏裁到 448 之后照原值摆会直接漏出
 * 面板与屏幕之外。收拢后行距 34→26，17px 的行文仍装得下。
 */
function helpLayout() {
  const k = uiHeight() / WORLD_H;
  return {
    k,
    padTop: 26 * k,   // 面板顶 → 标题
    titleH: 58 * k,   // 标题 + 笔意细线占高
    rowH: 34 * k,
    rows: 8,          // 与 drawHelp 里的 rows 数组等长；改一处必须改另一处
    soundGap: 22 * k, // 末行 → 声音钮中心
    soundH: 68 * k,   // 声音钮整体占高（仅触屏；含 SOUND_BTN.h 52 的余量）
    closeH: 40 * k,
    padBottom: 18 * k,
  };
}

function helpBodyHeight(coarse: boolean): number {
  const { padTop, titleH, rowH, rows, soundH, closeH, padBottom } = helpLayout();
  return padTop + titleH + rowH * rows + (coarse ? soundH : 0) + closeH + padBottom;
}

/** 帮助面板的世界坐标边界。 */
export function helpPanelBounds(vw: number, coarse: boolean) {
  const h = helpBodyHeight(coarse);
  const y0 = Math.max(uiHeight() * 0.05, (uiHeight() - h) / 2);
  return overlayPanelBounds(vw, y0 / uiHeight(), (y0 + h) / uiHeight(), 0.62);
}

/**
 * 声音钮的中心 y（世界坐标）。
 *
 * 声音钮改为跟随内容流后，位置不再是写死的比例；绘制与命中都必须由这里
 * 算——上一轮正是两处各写一份、差了半个按钮高，点喇叭反而关掉了浮层。
 */
export function helpSoundCenterY(coarse: boolean): number {
  const b = helpPanelBounds(820, coarse);   // y 与 vw 无关，取任意值即可
  const { padTop, titleH, rowH, rows, soundGap } = helpLayout();
  return b.y0 + padTop + titleH + rowH * rows + soundGap;
}

export function drawHelp(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, muted = false, coarse = false, chrome: UiChrome = STILL) {
  const b = helpPanelBounds(vw, coarse);
  const L = helpLayout();
  overlayPanel(ctx, theme, vw, b.y0 / uiHeight(), b.y1 / uiHeight(), 0.62);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = b.y0 + L.padTop;

  ctx.font = `${uiFont(30)}px ${fontKai()}`;
  ctx.shadowColor = rgb(theme.glow, 0.8);
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#f7ecd8';
  ctx.fillText(t('help.title'), vw / 2, y);
  ctx.shadowBlur = 0;
  brushRule(ctx, vw / 2, y + 38 * L.k, 200, theme.glow, 0.5);
  y += L.titleH;

  const rows = ['help.move', 'help.jump', 'help.dash', 'help.ult', 'help.mote', 'help.water', 'help.avatar', 'help.keys'];
  ctx.fillStyle = 'rgba(255,246,232,0.9)';
  for (const key of rows) {
    drawFit(ctx, tTouch(key, coarse), vw / 2, y, b.x1 - b.x0 - 40, uiFont(17), fontKai());
    y += L.rowH;
  }

  // 声音开关：触屏无 M 键，画一枚可点的声音钮（喇叭字形 + 开/关）
  if (coarse) {
    const my = helpSoundCenterY(true);
    const mw = SOUND_BTN.w, mh = SOUND_BTN.h, mx = vw / 2 - mw / 2;
    // 悬停在触屏端拿不到（没有 hover），但指针式设备开着帮助时要有反馈，
    // 故仍走 uiLevel：它与点选判据同源，不会亮一枚开另一枚。
    const level = uiLevel({ id: 'sound' }, chrome);
    roundRectPath(ctx, mx, my - mh / 2, mw, mh, mh / 2);
    ctx.fillStyle = `rgba(10,6,4,${0.5 + level * 0.12})`; ctx.fill();
    ctx.strokeStyle = rgb(theme.glow, (muted ? 0.32 : 0.7) + level * 0.22); ctx.lineWidth = 1; ctx.stroke();
    speakerGlyph(ctx, vw / 2 - 42, my, 1.5, theme.glow, muted ? 0.5 : 0.95, muted);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `${uiFont(18)}px ${fontKai()}`;
    ctx.fillStyle = muted ? 'rgba(240,228,210,0.55)' : rgb(theme.glow, 0.95);
    ctx.fillText(t(muted ? 'help.sound.off' : 'help.sound.on'), vw / 2 - 26, my + 1);
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  }

  ctx.font = `${uiFont(15)}px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow);
  // 触屏没有 H 键，必须走 tTouch——旁边的语言菜单一直是这么做的，这里漏了
  ctx.fillText(tTouch('help.close', coarse), vw / 2, b.y1 - L.closeH + 6);
}

/**
 * 帮助浮层里声音钮的尺寸；其 y 由 helpSoundCenterY 按内容流算出。
 *
 * 高 52 不是随手加的：短屏（横持手机 0.871 CSS px/世界）上 44 只剩 38.3 CSS px，
 * 低于本仓库给触屏控件定的 44px 下限（见 index.html 的 #tc / .avopt）。
 * 52 × 0.871 ≈ 45 ✓。占高 soundH 必须跟着抬，否则按钮会顶到关闭提示。
 */
/** 榜上的名字截断：必须留省略号——`Sunrunner` 硬切成 `Sunrunne` 会被当成写错了名字。 */
function boardName(name: string): string {
  return name.length > 8 ? `${name.slice(0, 7)}…` : name;
}

/**
 * 结算页收尾三行的起点：榜身下沿与屏高共同决定，绘制与守卫共用这一份算式。
 * （守卫拿录制式画布跑一遍真绘制去量「最后一行的下沿」，不复制算术——
 * 两处各写一份正是这仓库反复踩过的那类病。）
 */
export function deadFooterY(boardBottom: number, uiH = uiHeight()): number {
  return Math.max(uiH * 0.60, boardBottom + 34);
}

/**
 * 结算页的换形象条该不该贴左下角。
 *
 * 短屏（裁过天空那一档，与榜身砍到 3 行同一个判据）中间那条带是两行出口的：
 * 胶囊居中实测压在「点下半屏 · 再逐一程」上 100×14 CSS px，五语种全中。
 * 让到角上——右边是语言牌，那一角在结算页是空的（帮助牌只画在标题页）。
 */
export const deadBarAtCorner = (uiH = uiHeight()) => uiH < WORLD_H;

export const SOUND_BTN = { w: 168, h: 52 };

/**
 * 命中帮助浮层的声音钮？入参为**世界**坐标（须先经 Renderer.screenToWorld）。
 * 与语言菜单同理：它画在 renderUI 的信箱化变换里，拿屏幕比例去比会错位。
 */
export function helpSoundHit(x: number, y: number, vw: number): boolean {
  // drawHelp 画的是 roundRectPath(mx, my - h/2, w, h)——以 my 为**中心**，
  // 且 my 来自 helpSoundCenterY。命中必须用同一个来源，否则会重演上一轮
  // 「差半个按钮高、点喇叭反而关掉浮层」。
  const cy = helpSoundCenterY(true);
  const mx = vw / 2 - SOUND_BTN.w / 2;
  return x >= mx && x <= mx + SOUND_BTN.w
    && y >= cy - SOUND_BTN.h / 2 && y <= cy + SOUND_BTN.h / 2;
}

// ---- 角落的牌子（语言 / 帮助）----
//
// 原本这两处是 rgba(240,228,210,0.5) 的松散文字（「T / 点此 · 语言」），
// 读起来像一句操作说明而非可点控件。改成带边框的「牌」：图标 + 短标签。
// 语言牌的标签是当前语言的自称，于是它同时告诉你「这是语言控件」「现在
// 是哪种」「可以点」。

export const CHIP = {
  w: 112, h: 26, margin: 16, bottom: 18,
  /**
   * 命中区在四周外扩的余量。
   *
   * 旧的角落命中是 fx<0.24 && fy>0.84 那种约 197×92 的大框；换成精确牌子后
   * 触控目标一下小了约 7 倍，差一点点就会落到 game.start() 上——想开帮助
   * 却直接开局。视觉上仍是那枚小牌，但可点范围放宽到接近手指的实际精度。
   */
  pad: 14,
};

/** 牌子的世界坐标矩形。绘制与命中共用，不得两处各写一份。 */
export function chipRect(side: 'left' | 'right', vw: number) {
  const w = chipWidth(side);
  // 牌贴在屏幕角上，安全区必须算进去——绘制与命中读的是同一个函数，改这里两边同步
  return {
    x: side === 'left' ? uiInsetL(CHIP.margin) : vw - uiInsetR(CHIP.margin) - w,
    y: uiHeight() - uiInsetB(CHIP.bottom) - CHIP.h,
    w,
    h: CHIP.h,
  };
}

/**
 * 牌宽：装得下才叫按钮。
 *
 * 原本写死 112，而 `uiFont()` 有 12 CSS px 的地板——屏越矮，字号撞地板后**不再缩**，
 * 112 就装不下「简体中文」了，于是 drawFit 拿 maxWidth 把字横向挤扁（实拍三处报
 * 「压扁」，探针认的是"给了上限且实给宽 < 自然宽"，不是目测）。压扁不是字小一点，
 * 是字形变形：CJK 被横向压缩后笔画粘连，偏偏发生在我们已经放弃缩字号的那批屏上。
 * 改成由文字自然宽推出牌宽，命中区跟着一起变宽。
 */
export function chipWidth(side: 'left' | 'right'): number {
  const label = side === 'left' ? t('help.label') : LOCALES.find(l => l.id === getLocale())?.native ?? '';
  // 30 = 图标列 + 文字左间隙；26 = 键位徽标列 + 牌边余量（触屏不画徽标，多出的当衬）
  return Math.max(CHIP.w, 30 + estWidth(label, uiFont(13)) + 26);
}

/**
 * 命中牌子？入参为**世界**坐标（须先经 Renderer.screenToWorld）。
 * 命中区比画出来的牌四周各宽 CHIP.pad——手指没有像素级精度。
 */
export function chipHit(side: 'left' | 'right', x: number, y: number, vw: number): boolean {
  const r = chipRect(side, vw);
  const p = CHIP.pad;
  return x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p;
}

/**
 * 地球字形（线描，与 sunGlyph / speakerGlyph 同调）。
 *
 * 刻意画出来而非取字体里的字形：上一轮把触屏按钮标签换成 ◀ ▶ ▲ ≫ ★ 时
 * 踩过字形覆盖的坑——非 CJK 设备上兜底的拉丁 serif 不带这些码位，会出
 * 豆腐块，而按钮上的字往往是识别它的唯一线索。画出来的没有这个风险。
 */
function globeGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: RGB, alpha: number) {
  ctx.save();
  ctx.strokeStyle = rgb(color, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();                    // 球
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.46, r, 0, 0, Math.PI * 2); ctx.stroke();   // 经线
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();        // 赤道
  for (const dy of [-r * 0.5, r * 0.5]) {                                               // 两道纬线
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    ctx.beginPath(); ctx.moveTo(cx - half, cy + dy); ctx.lineTo(cx + half, cy + dy); ctx.stroke();
  }
  ctx.restore();
}

/** 牌底：圆角 + 淡底 + 描边，让它读起来是个按钮而非一行说明文字。 */
function chipBase(ctx: CanvasRenderingContext2D, theme: Theme, r: { x: number; y: number; w: number; h: number }, level: UiPointerLevel) {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = `rgba(12,7,4,${0.5 + level * 0.1})`;
  ctx.fill();
  ctx.strokeStyle = rgb(theme.glow, 0.45 + level * 0.2);
  ctx.lineWidth = level ? 1.5 : 1;   // 指到了就粗半像素：小牌上这是最省的"它动了"
  ctx.stroke();
}

/** 键位徽标：键盘端在牌右端标出对应按键。删掉旧角落文字后，屏上就再没有
 *  地方提过 H / T 了，键盘玩家会完全不知道这两个键存在。 */
function chipKey(ctx: CanvasRenderingContext2D, theme: Theme, r: { x: number; y: number; w: number; h: number }, key: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${uiFont(11)}px ${fontKaiFor('en')}`;
  ctx.fillStyle = rgb(theme.glow, 0.5);
  ctx.fillText(key, r.x + r.w - 13, r.y + r.h / 2 + 1);
  ctx.restore();
}

/** 语言牌（右下）：地球 + 当前语言的自称（+ 键盘端的 T）。 */
export function drawLangChip(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, coarse = false, chrome: UiChrome = STILL) {
  const r = chipRect('right', vw);
  const level = uiLevel({ id: 'chipR' }, chrome);
  const cy = r.y + r.h / 2;
  ctx.save();
  chipBase(ctx, theme, r, level);
  globeGlyph(ctx, r.x + 17, cy, 7, theme.glow, 0.85);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const cur = getLocale();
  // 自称须以其本身文字显示，故字体跟着该语种走，否则日韩会出豆腐块
  ctx.font = `${uiFont(13)}px ${fontKaiFor(cur)}`;
  ctx.fillStyle = `rgba(247,236,216,${0.9 + level * 0.1})`;
  ctx.fillText(LOCALES.find(l => l.id === cur)?.native ?? '', r.x + 30, cy + 1, r.w - 54);
  ctx.restore();
  if (!coarse) chipKey(ctx, theme, r, 'T');
}

/** 帮助牌（左下）：'?' + 短标签（+ 键盘端的 H）。'?' 是 ASCII，任何字体都覆盖。 */
export function drawHelpChip(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, coarse = false, chrome: UiChrome = STILL) {
  const r = chipRect('left', vw);
  const level = uiLevel({ id: 'chipL' }, chrome);
  const cy = r.y + r.h / 2;
  ctx.save();
  chipBase(ctx, theme, r, level);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `${uiFont(15)}px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow, 0.85);
  ctx.fillText('?', r.x + 17, cy + 1);
  ctx.textAlign = 'left';
  ctx.font = `${uiFont(13)}px ${fontKai()}`;
  ctx.fillStyle = `rgba(247,236,216,${0.9 + level * 0.1})`;
  ctx.fillText(t('help.label'), r.x + 30, cy + 1, r.w - 54);
  ctx.restore();
  if (!coarse) chipKey(ctx, theme, r, 'H');
}

// ---- 语言菜单 ----
//
// 命中与绘制都用**世界**归一化坐标（相对 vw × uiHeight()），调用方须先用
// Renderer.screenToWorld 把指针坐标换算过来。
//
// 早先这里用的是屏幕归一化坐标，而绘制在 renderUI 的信箱化变换里——
// 两个坐标系在非 16:9 视口下会错开整整几行（390×844 竖屏上偏移 285px，
// 远超行高），点第一行会切到第二种语言，最后两行根本点不到。

const MENU_X0 = 0.30, MENU_X1 = 0.70;
const MENU_ROW_Y0 = 0.26, MENU_ROW_H = 0.094;

/** 第 i 项的中心（归一化屏幕坐标），供命中测试与测试用例共用同一套几何。 */
export function langMenuRowCenter(i: number): { fx: number; fy: number } {
  return { fx: (MENU_X0 + MENU_X1) / 2, fy: MENU_ROW_Y0 + MENU_ROW_H * (i + 0.5) };
}

/**
 * 命中语言菜单的某一项则返回其 locale；点在面板外返回 null（调用方据此关闭菜单）。
 * @param fx 世界坐标 x / vw
 * @param fy 世界坐标 y / uiHeight()
 */
/** 菜单面板的世界归一化上下边界。绘制与命中共用，勿两处各写一份。 */
export const MENU_PANEL = {
  top: MENU_ROW_Y0 - 0.105,
  bottom: MENU_ROW_Y0 + MENU_ROW_H * 5 + 0.075,
};

/**
 * 点在菜单面板之内？
 *
 * 面板为容纳新加的标题与关闭提示而上下撑开，但 langMenuHit 只认行区——
 * 于是点面板自己的「语言」标题会被判成 null，调用方当作「点外面」把菜单
 * 关掉，而同一次提交加的提示恰恰写着「点屏幕别处 · 关闭」。
 */
export function langMenuPanelHit(fx: number, fy: number): boolean {
  return fx >= MENU_X0 && fx <= MENU_X1 && fy >= MENU_PANEL.top && fy <= MENU_PANEL.bottom;
}

export function langMenuHit(fx: number, fy: number): Locale | null {
  if (fx < MENU_X0 || fx > MENU_X1) return null;
  const i = Math.floor((fy - MENU_ROW_Y0) / MENU_ROW_H);
  return i >= 0 && i < LOCALES.length ? LOCALES[i].id : null;
}

/**
 * 语言菜单浮层：遮罩 + 面板 + 五项自称（各以其本身文字显示），当前项前置钩号。
 * 键盘端在每项前标出 1~5：桌面玩家按 T 打开后总得知道除了点还能怎么选。
 */
export function drawLangMenu(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, coarse = false, chrome: UiChrome = STILL) {
  // 面板要容下：标题 + 5 行 + 关闭提示。行中心由 langMenuRowCenter 固定
  // （既有命中测试依赖它），故只把面板上下边界撑开，不动行位置。
  const b = overlayPanel(ctx, theme, vw, MENU_PANEL.top, MENU_PANEL.bottom, MENU_X1 - MENU_X0);
  const x0 = b.x0, x1 = b.x1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 标题：帮助浮层有「操作说明」，语言菜单原本什么都没有，误开的人无从判断这是什么
  ctx.font = `${uiFont(20)}px ${fontKai()}`;
  ctx.fillStyle = 'rgba(247,236,216,0.92)';
  ctx.fillText(t('lang.title'), vw / 2, b.y0 + 30);
  brushRule(ctx, vw / 2, b.y0 + 46, 120, theme.glow, 0.45);

  const cur = getLocale();
  LOCALES.forEach(({ id, native }, i) => {
    const cy = uiHeight() * langMenuRowCenter(i).fy;
    const on = id === cur;
    // 指针档：不是当前项也要能看出"要点的是这一行"，否则五项长得一模一样
    const level = uiLevel({ id: 'langRow', index: i }, chrome);
    if (on || level) {
      roundRectPath(ctx, x0 + 12, cy - 17, x1 - x0 - 24, 34, 6);
      ctx.fillStyle = on ? rgb(theme.glow, 0.14) : rgb(theme.glow, 0.06 + level * 0.06);
      ctx.fill();
    }
    // 各语种自称须以其本身文字显示，故字体也要跟着切，否则日韩会出豆腐块
    ctx.font = `${uiFont(on ? 20 : 18)}px ${fontKaiFor(id)}`;
    if (!coarse) {                       // 键盘端：左侧标出可直选的数字键
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = `${uiFont(13)}px ${fontKaiFor('en')}`;
      ctx.fillStyle = rgb(theme.glow, on ? 0.8 : 0.42);
      ctx.fillText(String(i + 1), x0 + 22, cy);
      ctx.restore();
      ctx.font = `${uiFont(on ? 20 : 18)}px ${fontKaiFor(id)}`;
    }
    ctx.fillStyle = on ? rgb(theme.glow, 1) : `rgba(240,228,210,${0.72 + level * 0.2})`;
    // 当前项不额外加勾。这一行本来就有三重信号：高亮底、字号大两号、满不透明的
    // 辉光色。原先那个 `✓`(U+2713) 是全 UI 里唯一一个落在自身字体栈字符集之外的
    // 字形——KAI_KO/KAI_JA 与它们末尾的 serif 都不含它，能不能显示全靠浏览器的
    // 逐字回退，而那不保证。离屏渲染实测：韩文那行出的是豆腐块「▯ 한국어」。
    ctx.fillText(native, (x0 + x1) / 2, cy);
  });

  // 关闭提示：帮助浮层有，语言菜单原本没有——触屏用户不知道点外面能关
  ctx.textAlign = 'center';
  ctx.font = `${uiFont(13)}px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow, 0.66);
  ctx.fillText(tTouch('lang.close', coarse), vw / 2, b.y1 - 22);
  ctx.textBaseline = 'top';
}

/**
 * 首次按浏览器语言自动选定后的一次性提示，画在标题页右下角「语言」提示的上方。
 * alpha 由调用方按剩余时间算，0 则不画。
 */
export function drawLangHint(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, alpha: number) {
  if (alpha <= 0) return;
  const native = LOCALES.find(l => l.id === getLocale())?.native ?? '';
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = rgb(theme.glow, 0.9 * alpha);
  ctx.shadowColor = 'rgba(8,4,2,0.8)';
  ctx.shadowBlur = 8;
  // 画在语言牌**上方**：它指的就是那枚牌，压在牌上反而挡住自己所指之物
  ctx.textBaseline = 'bottom';
  // 右边距与语言牌同源（uiInsetR(CHIP.margin)）：写死 16 的话，有安全区的横屏机上
  // 牌会内收、这句不会，于是它压进刘海，也不再指向自己所说明的那枚牌。
  drawFit(ctx, tf('lang.autoPicked', { lang: native }), vw - uiInsetR(CHIP.margin), chipRect('right', vw).y - 8, vw * 0.62, uiFont(13), fontKai());
  ctx.textBaseline = 'top';
  ctx.restore();
}
