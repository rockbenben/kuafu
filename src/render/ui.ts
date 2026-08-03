import type { Game } from '../game/game';
import { rgb, type Theme } from './theme';
import { WORLD_H, MULT_MAX, MULT_PER_MOTE } from '../game/constants';
import type { BoardState } from '../api/leaderboard';
import { t, tf, tTouch, rankKeyFor, fontKai, fontHud, fontKaiFor, getLocale, LOCALES, type Locale, type StringKey } from './strings';
import { drawFit } from './text';

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

export function drawUI(ctx: CanvasRenderingContext2D, game: Game, theme: Theme, best: number, board: BoardState, vw: number, coarse = false) {
  ctx.textBaseline = 'top';
  if (game.state === 'playing') {
    const s = game.score;
    // 左上：功业（主角分）+ 日光/倍率；右上高处：路程——与右侧日轮亮核错开，左右均衡
    const HX = 22;
    ctx.textAlign = 'left';
    // 功业（总分·主角）
    ctx.font = `12px ${fontKai()}`;
    ctx.fillStyle = 'rgba(240,228,210,0.55)';
    ctx.fillText(t('hud.score'), HX, 11);
    ctx.font = `30px ${fontHud()}`;
    ctx.fillStyle = '#f7ecd8';
    ctx.fillText(`${s.total}`, HX, 25);
    brushRule(ctx, HX + 48, 62, 96, theme.glow, 0.4);
    // 日光 → 倍率（日轮字形 + 因果）：紧随功业，构成"计分"一组
    const maxed = s.motes >= MOTES_FOR_MAX;
    ctx.font = `14px ${fontHud()}`;
    const lightText = maxed
      ? `${t('hud.brimful')}  →  ${t('hud.mult')} ×${s.multiplier.toFixed(1)}`
      : `${t('hud.motes')} ${s.motes}/${MOTES_FOR_MAX}  →  ${t('hud.mult')} ×${s.multiplier.toFixed(1)}`;
    sunGlyph(ctx, HX + 5, 76, 4, theme.glow);
    ctx.fillStyle = rgb(theme.glow, 0.95);
    ctx.fillText(lightText, HX + 16, 72);
    // 右上高处：路程（进度基石）——置于日轮亮核上方偏外，暗影确保浮于辉光之上可读
    const RX = vw - 22;
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(8,4,2,0.6)'; ctx.shadowBlur = 7;
    ctx.font = `12px ${fontKai()}`;
    ctx.fillStyle = 'rgba(240,228,210,0.6)';
    ctx.fillText(t('hud.dist2'), RX, 11);
    ctx.font = `26px ${fontHud()}`;
    ctx.fillStyle = 'rgba(247,236,216,0.95)';
    ctx.fillText(`${Math.floor(s.distanceM)}`, RX, 25);
    ctx.font = `11px ${fontKai()}`;
    ctx.fillStyle = 'rgba(240,228,210,0.5)';
    ctx.fillText(t('hud.dist'), RX, 57);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // 叙事旁白（《山海经》碎片，上方居中，楷书+辉光，淡入淡出）
    const nar = game.narration;
    if (nar) {
      const narY = WORLD_H * 0.32;
      ctx.textAlign = 'center';
      ctx.shadowColor = rgb(theme.glow, 0.9 * nar.alpha);
      ctx.shadowBlur = 22;
      ctx.fillStyle = rgb([248, 238, 222], nar.alpha);
      // 旁白 key 由 game 的里程碑表在运行时给出，形如 'nar.N'
      drawFit(ctx, t(nar.key as StringKey), vw / 2, narY, vw - 80, 28, fontKai());
      // 出处另起一行、小一号：外语须标注典籍，中文主脉留空则不画
      const narSrc = t(`${nar.key}.src` as StringKey);
      if (narSrc) {
        ctx.shadowBlur = 10;
        ctx.fillStyle = rgb([248, 238, 222], nar.alpha * 0.62);
        drawFit(ctx, narSrc, vw / 2, narY + 34, vw - 160, 15, fontKai());
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
      const pulse = 0.775 + 0.225 * Math.sin(performance.now() / 320);
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(8,4,2,0.85)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = rgb(theme.glow, pulse);
      drawFit(ctx, tTouch(hint, coarse), vw / 2, WORLD_H * 0.72, vw - 80, 18, fontKai());
      ctx.shadowBlur = 0;
    }

    // 大招·神力槽（底部居中）：圆端细槽 + 金泉渐充；满则朱印「夸」脉动待发
    const barW = 200, barH = 6;
    const bx = vw / 2 - barW / 2, by = WORLD_H - 26;
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
    ctx.font = `12px ${fontKai()}`;
    ctx.fillStyle = 'rgba(255,240,220,0.6)';
    ctx.fillText(t('hud.charge'), bx - 10, by - 4);
    if (ready) {
      // 新手不知道攒满的「神力」是个大招：槽满之前它只是一条会变长的细线，槽满
      // 之后的告示又只有 15px、贴在画面最底、还会脉动到 0.55——正好落在视线之外。
      // 与教学提示同一套处理：字号提到 18、暗影托底、脉动只在 0.7~1 之间。
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 200);
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(8,4,2,0.85)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = rgb(theme.glow, pulse);
      drawFit(ctx, tTouch('hint.ult', coarse), vw / 2, by - 26, vw - 80, 18, fontKai());
      ctx.shadowBlur = 0;
    }
    return;
  }

  if (game.state === 'title') {
    ctx.textAlign = 'center';
    // 题名·逐光
    const titleY = WORLD_H * 0.22;
    ctx.font = `54px ${fontKai()}`;
    ctx.shadowColor = rgb(theme.glow, 0.9);
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#f7ecd8';
    ctx.fillText(t('title.main'), vw / 2, titleY);
    ctx.shadowBlur = 0;
    // 笔意细线分隔
    brushRule(ctx, vw / 2, WORLD_H * 0.35, 280, theme.glow, 0.5);
    // 副题·夸父逐日
    ctx.font = `22px ${fontKai()}`;
    ctx.fillStyle = rgb(theme.glow, 0.92);
    ctx.fillText(t('title.sub'), vw / 2, WORLD_H * 0.385);
    // 楔子
    ctx.fillStyle = 'rgba(240,228,210,0.58)';
    drawFit(ctx, t('title.prologue'), vw / 2, WORLD_H * 0.45, vw - 100, 14, fontKai());
    // 模式横幅：常规无尽 / 今日挑战（含日期）+ 切换提示
    const daily = game.mode === 'daily';
    const date = game.boardKey.startsWith('daily:') ? game.boardKey.slice(6) : '';
    ctx.font = `19px ${fontKai()}`;
    ctx.fillStyle = rgb(theme.glow, 0.95);
    ctx.fillText(daily ? `${t('mode.daily')} · ${date}` : t('mode.endless'), vw / 2, WORLD_H * 0.52);
    ctx.fillStyle = 'rgba(240,228,210,0.55)';
    drawFit(ctx, `${t(daily ? 'mode.dailyHint' : 'mode.endlessHint')}　·　${tTouch('mode.switch', coarse)}`, vw / 2, WORLD_H * 0.52 + 26, vw - 100, 12, fontKai());
    // 只显示当前设备的操作行：触屏端示按钮，键盘端示键位（两行并陈徒增噪）
    ctx.fillStyle = 'rgba(255,248,235,0.72)';
    drawFit(ctx, t(coarse ? 'title.ctrl3' : 'title.ctrl1'), vw / 2, WORLD_H * 0.63, vw - 100, 15, fontKai());
    drawFit(ctx, t('title.ctrl2'), vw / 2, WORLD_H * 0.63 + 26, vw - 100, 15, fontKai());
    if (Math.floor(performance.now() / 600) % 2 === 0) {
      ctx.fillStyle = rgb(theme.glow);
      ctx.font = `16px ${fontKai()}`;
      ctx.fillText(tTouch('title.start', coarse), vw / 2, WORLD_H * 0.75);
    }
    // 下角两枚牌：左「? 帮助」、右「地球 当前语言」。
    // 原本是两行暗淡文字，读起来像操作说明而非可点控件。
    drawHelpChip(ctx, theme, vw, coarse);
    drawLangChip(ctx, theme, vw, coarse);
    return;
  }

  // dead（结局图与压暗由渲染层绘制，此处只叠字）
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';   // 结局图较亮，统一暗影托字，暗淡文案亦可读
  ctx.shadowBlur = 7;
  const st = game.runStats;
  // 死因·升华为神话之句
  ctx.font = `22px ${fontKai()}`;
  ctx.fillStyle = 'rgba(248,238,222,0.88)';
  ctx.fillText(t(DEATH_KEY[game.deathCause ?? 'darkness'] ?? 'death.darkness'), vw / 2, WORLD_H * 0.22);
  // 功业·本局总分，朱印钤记（如画作落款用印）
  ctx.font = `48px ${fontHud()}`;
  ctx.fillStyle = '#f7ecd8';
  const scoreStr = `${st?.score ?? 0}`;
  ctx.fillText(scoreStr, vw / 2, WORLD_H * 0.30);
  brushRule(ctx, vw / 2, WORLD_H * 0.30 + 62, 200, theme.glow, 0.42);
  // 称号：按本局功业授名（身份与进阶感）
  ctx.font = `21px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow, 0.95);
  ctx.fillText(`「${t(rankKeyFor(st?.score ?? 0))}」`, vw / 2, WORLD_H * 0.40);
  ctx.font = `15px ${fontKai()}`;
  ctx.fillStyle = 'rgba(255,245,230,0.82)';
  ctx.fillText(`${t('death.dist')} ${st?.distanceM ?? 0} ${t('hud.dist')}    ${t('death.best')} ${best}`, vw / 2, WORLD_H * 0.46);
  // 榜
  ctx.font = `13px ${fontKai()}`;
  ctx.fillStyle = 'rgba(255,245,230,0.75)';
  let y = WORLD_H * 0.52;
  if (board.status === 'pending') {
    drawFit(ctx, t('death.pending'), vw / 2, y, vw - 80, 13, fontKai());
  } else if (board.status === 'offline') {
    // 现在这行会把「为什么没上榜」说清楚，比原来光一个「离线」长得多，
    // 必须走 drawFit——窄视口下 fillText 会直接顶出画布。
    drawFit(ctx, t('death.offline'), vw / 2, y, vw - 80, 13, fontKai());
  } else if (board.status === 'done') {
    ctx.fillStyle = rgb(theme.glow, 0.9);          // 榜名：今日挑战榜 / 天下逐日榜
    ctx.fillText(t(game.mode === 'daily' ? 'board.daily' : 'board.endless'), vw / 2, y);
    brushRule(ctx, vw / 2, y + 18, 120, theme.glow, 0.35);
    y += 26;
    ctx.fillStyle = 'rgba(255,245,230,0.75)';
    ctx.fillText(`${t('death.rank')} ${board.rank ?? '?'}`, vw / 2, y);
    y += 15;
    (board.top ?? []).slice(0, 5).forEach((row, i) => {
      const name = row.name.length > 8 ? row.name.slice(0, 8) : row.name;
      y += 15;
      ctx.fillText(`${i + 1}. ${name}  ${row.score}`, vw / 2, y);
    });
  }

  // 底部收尾：随榜单高度自适应下移，避免与榜行相撞
  let fy = Math.max(WORLD_H * 0.60, y + 34);
  ctx.font = `16px ${fontKai()}`;
  ctx.fillStyle = 'rgba(240,228,210,0.78)';
  ctx.fillText(t('death.footer'), vw / 2, fy);      // 弃其杖，化为邓林
  // 分享是这一屏的第二动作，此前 0.6 的暖白压在亮结局图上近乎隐形，
  // 等于没有出口；提到与「再逐一程」相称的亮度。
  ctx.fillStyle = 'rgba(255,240,220,0.85)';
  drawFit(ctx, tTouch('death.share', coarse), vw / 2, fy + 30, vw - 80, 13, fontKai());
  ctx.fillStyle = rgb(theme.glow);
  drawFit(ctx, tTouch('death.restart', coarse), vw / 2, fy + 60, vw - 80, 16, fontKai());
  ctx.shadowBlur = 0;
  // 死亡页也放一枚语言牌：触屏此前只能在标题页切语言，结算页是唯一「盯着
  // 一屏文字却没有任何菜单入口」的地方，这正是要补的可达性缺口。
  drawLangChip(ctx, theme, vw, coarse);
}

/** 竖屏提示：触屏竖持时**铺满整屏**（在设备像素空间绘制，不受世界视口信箱化影响）
 *  提示旋转横屏，避免大幅黑边与局促视野。w/h 为 CSS 像素屏幕尺寸。 */
export function drawRotateHint(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number) {
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
  ctx.fillStyle = '#f7ecd8';
  ctx.font = `${Math.round(26 * s)}px ${fontKai()}`;
  ctx.fillText(t('rotate.hint'), cx, cy + 40 * s);
  ctx.fillStyle = rgb(theme.glow, 0.9);
  ctx.font = `${Math.round(18 * s)}px ${fontKai()}`;
  ctx.fillText(t('rotate.sub'), cx, cy + 76 * s);
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
  return { x0, x1: x0 + w, y0: WORLD_H * topFy, y1: WORLD_H * bottomFy };
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
  ctx.fillRect(0, 0, vw, WORLD_H);

  const b = overlayPanelBounds(vw, topFy, bottomFy, widthFrac);
  roundRectPath(ctx, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 10);
  ctx.fillStyle = 'rgba(24,14,9,0.92)';
  ctx.fill();
  ctx.strokeStyle = rgb(theme.glow, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
  return b;
}

/** 帮助浮层的内容布局常量。绘制与命中共用，避免两处各写一份而漂移。 */
const HELP_LAYOUT = {
  padTop: 26,      // 面板顶 → 标题
  titleH: 58,      // 标题 + 笔意细线占高
  rowH: 34,
  rows: 7,
  soundGap: 22,    // 末行 → 声音钮中心
  soundH: 56,      // 声音钮整体占高（仅触屏）
  closeH: 40,
  padBottom: 18,
};

function helpBodyHeight(coarse: boolean): number {
  const { padTop, titleH, rowH, rows, soundH, closeH, padBottom } = HELP_LAYOUT;
  return padTop + titleH + rowH * rows + (coarse ? soundH : 0) + closeH + padBottom;
}

/** 帮助面板的世界坐标边界。 */
export function helpPanelBounds(vw: number, coarse: boolean) {
  const h = helpBodyHeight(coarse);
  const y0 = Math.max(WORLD_H * 0.05, (WORLD_H - h) / 2);
  return overlayPanelBounds(vw, y0 / WORLD_H, (y0 + h) / WORLD_H, 0.62);
}

/**
 * 声音钮的中心 y（世界坐标）。
 *
 * 声音钮改为跟随内容流后，位置不再是写死的比例；绘制与命中都必须由这里
 * 算——上一轮正是两处各写一份、差了半个按钮高，点喇叭反而关掉了浮层。
 */
export function helpSoundCenterY(coarse: boolean): number {
  const b = helpPanelBounds(820, coarse);   // y 与 vw 无关，取任意值即可
  const { padTop, titleH, rowH, rows, soundGap } = HELP_LAYOUT;
  return b.y0 + padTop + titleH + rowH * rows + soundGap;
}

export function drawHelp(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, muted = false, coarse = false) {
  const b = helpPanelBounds(vw, coarse);
  overlayPanel(ctx, theme, vw, b.y0 / WORLD_H, b.y1 / WORLD_H, 0.62);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let y = b.y0 + HELP_LAYOUT.padTop;

  ctx.font = `30px ${fontKai()}`;
  ctx.shadowColor = rgb(theme.glow, 0.8);
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#f7ecd8';
  ctx.fillText(t('help.title'), vw / 2, y);
  ctx.shadowBlur = 0;
  brushRule(ctx, vw / 2, y + 38, 200, theme.glow, 0.5);
  y += HELP_LAYOUT.titleH;

  const rows = ['help.move', 'help.jump', 'help.dash', 'help.ult', 'help.mote', 'help.water', 'help.keys'];
  ctx.fillStyle = 'rgba(255,246,232,0.9)';
  for (const key of rows) {
    drawFit(ctx, tTouch(key, coarse), vw / 2, y, b.x1 - b.x0 - 40, 17, fontKai());
    y += HELP_LAYOUT.rowH;
  }

  // 声音开关：触屏无 M 键，画一枚可点的声音钮（喇叭字形 + 开/关）
  if (coarse) {
    const my = helpSoundCenterY(true);
    const mw = SOUND_BTN.w, mh = SOUND_BTN.h, mx = vw / 2 - mw / 2;
    roundRectPath(ctx, mx, my - mh / 2, mw, mh, mh / 2);
    ctx.fillStyle = 'rgba(10,6,4,0.5)'; ctx.fill();
    ctx.strokeStyle = rgb(theme.glow, muted ? 0.32 : 0.7); ctx.lineWidth = 1; ctx.stroke();
    speakerGlyph(ctx, vw / 2 - 42, my, 1.5, theme.glow, muted ? 0.5 : 0.95, muted);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `18px ${fontKai()}`;
    ctx.fillStyle = muted ? 'rgba(240,228,210,0.55)' : rgb(theme.glow, 0.95);
    ctx.fillText(t(muted ? 'help.sound.off' : 'help.sound.on'), vw / 2 - 26, my + 1);
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  }

  ctx.font = `15px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow);
  ctx.fillText(t('help.close'), vw / 2, b.y1 - HELP_LAYOUT.closeH + 6);
}

/** 帮助浮层里声音钮的尺寸；其 y 由 helpSoundCenterY 按内容流算出。 */
export const SOUND_BTN = { w: 168, h: 44 };

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
  return {
    x: side === 'left' ? CHIP.margin : vw - CHIP.margin - CHIP.w,
    y: WORLD_H - CHIP.bottom - CHIP.h,
    w: CHIP.w,
    h: CHIP.h,
  };
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
function chipBase(ctx: CanvasRenderingContext2D, theme: Theme, r: { x: number; y: number; w: number; h: number }) {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fillStyle = 'rgba(12,7,4,0.5)';
  ctx.fill();
  ctx.strokeStyle = rgb(theme.glow, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 键位徽标：键盘端在牌右端标出对应按键。删掉旧角落文字后，屏上就再没有
 *  地方提过 H / T 了，键盘玩家会完全不知道这两个键存在。 */
function chipKey(ctx: CanvasRenderingContext2D, theme: Theme, r: { x: number; y: number; w: number; h: number }, key: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `11px ${fontKaiFor('en')}`;
  ctx.fillStyle = rgb(theme.glow, 0.5);
  ctx.fillText(key, r.x + r.w - 13, r.y + r.h / 2 + 1);
  ctx.restore();
}

/** 语言牌（右下）：地球 + 当前语言的自称（+ 键盘端的 T）。 */
export function drawLangChip(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, coarse = false) {
  const r = chipRect('right', vw);
  const cy = r.y + r.h / 2;
  ctx.save();
  chipBase(ctx, theme, r);
  globeGlyph(ctx, r.x + 17, cy, 7, theme.glow, 0.85);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const cur = getLocale();
  // 自称须以其本身文字显示，故字体跟着该语种走，否则日韩会出豆腐块
  ctx.font = `13px ${fontKaiFor(cur)}`;
  ctx.fillStyle = 'rgba(247,236,216,0.9)';
  ctx.fillText(LOCALES.find(l => l.id === cur)?.native ?? '', r.x + 30, cy + 1, CHIP.w - 54);
  ctx.restore();
  if (!coarse) chipKey(ctx, theme, r, 'T');
}

/** 帮助牌（左下）：'?' + 短标签（+ 键盘端的 H）。'?' 是 ASCII，任何字体都覆盖。 */
export function drawHelpChip(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, coarse = false) {
  const r = chipRect('left', vw);
  const cy = r.y + r.h / 2;
  ctx.save();
  chipBase(ctx, theme, r);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `15px ${fontKai()}`;
  ctx.fillStyle = rgb(theme.glow, 0.85);
  ctx.fillText('?', r.x + 17, cy + 1);
  ctx.textAlign = 'left';
  ctx.font = `13px ${fontKai()}`;
  ctx.fillStyle = 'rgba(247,236,216,0.9)';
  ctx.fillText(t('help.label'), r.x + 30, cy + 1, CHIP.w - 54);
  ctx.restore();
  if (!coarse) chipKey(ctx, theme, r, 'H');
}

// ---- 语言菜单 ----
//
// 命中与绘制都用**世界**归一化坐标（相对 vw × WORLD_H），调用方须先用
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
 * @param fy 世界坐标 y / WORLD_H
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
export function drawLangMenu(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, coarse = false) {
  // 面板要容下：标题 + 5 行 + 关闭提示。行中心由 langMenuRowCenter 固定
  // （既有命中测试依赖它），故只把面板上下边界撑开，不动行位置。
  const b = overlayPanel(ctx, theme, vw, MENU_PANEL.top, MENU_PANEL.bottom, MENU_X1 - MENU_X0);
  const x0 = b.x0, x1 = b.x1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 标题：帮助浮层有「操作说明」，语言菜单原本什么都没有，误开的人无从判断这是什么
  ctx.font = `20px ${fontKai()}`;
  ctx.fillStyle = 'rgba(247,236,216,0.92)';
  ctx.fillText(t('lang.title'), vw / 2, b.y0 + 30);
  brushRule(ctx, vw / 2, b.y0 + 46, 120, theme.glow, 0.45);

  const cur = getLocale();
  LOCALES.forEach(({ id, native }, i) => {
    const cy = WORLD_H * langMenuRowCenter(i).fy;
    const on = id === cur;
    if (on) {
      roundRectPath(ctx, x0 + 12, cy - 17, x1 - x0 - 24, 34, 6);
      ctx.fillStyle = rgb(theme.glow, 0.14);
      ctx.fill();
    }
    // 各语种自称须以其本身文字显示，故字体也要跟着切，否则日韩会出豆腐块
    ctx.font = `${on ? 20 : 18}px ${fontKaiFor(id)}`;
    if (!coarse) {                       // 键盘端：左侧标出可直选的数字键
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = `13px ${fontKaiFor('en')}`;
      ctx.fillStyle = rgb(theme.glow, on ? 0.8 : 0.42);
      ctx.fillText(String(i + 1), x0 + 22, cy);
      ctx.restore();
      ctx.font = `${on ? 20 : 18}px ${fontKaiFor(id)}`;
    }
    ctx.fillStyle = on ? rgb(theme.glow, 1) : 'rgba(240,228,210,0.72)';
    ctx.fillText(on ? `✓ ${native}` : native, (x0 + x1) / 2, cy);
  });

  // 关闭提示：帮助浮层有，语言菜单原本没有——触屏用户不知道点外面能关
  ctx.textAlign = 'center';
  ctx.font = `13px ${fontKai()}`;
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
  drawFit(ctx, tf('lang.autoPicked', { lang: native }), vw - 16, chipRect('right', vw).y - 8, vw * 0.62, 13, fontKai());
  ctx.textBaseline = 'top';
  ctx.restore();
}
