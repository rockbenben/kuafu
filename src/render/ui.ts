import type { Game } from '../game/game';
import { rgb, type Theme } from './theme';
import { WORLD_H, MULT_MAX, MULT_PER_MOTE } from '../game/constants';
import type { BoardState } from '../api/leaderboard';
import { t, tTouch, rankKeyFor, FONT_KAI, FONT_HUD } from './strings';

const DEATH_KEY: Record<string, string> = {
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
    ctx.font = `12px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(240,228,210,0.55)';
    ctx.fillText(t('hud.score'), HX, 11);
    ctx.font = `30px ${FONT_HUD}`;
    ctx.fillStyle = '#f7ecd8';
    ctx.fillText(`${s.total}`, HX, 25);
    brushRule(ctx, HX + 48, 62, 96, theme.glow, 0.4);
    // 日光 → 倍率（日轮字形 + 因果）：紧随功业，构成"计分"一组
    const maxed = s.motes >= MOTES_FOR_MAX;
    ctx.font = `14px ${FONT_HUD}`;
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
    ctx.font = `12px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(240,228,210,0.6)';
    ctx.fillText(t('hud.dist2'), RX, 11);
    ctx.font = `26px ${FONT_HUD}`;
    ctx.fillStyle = 'rgba(247,236,216,0.95)';
    ctx.fillText(`${Math.floor(s.distanceM)}`, RX, 25);
    ctx.font = `11px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(240,228,210,0.5)';
    ctx.fillText(t('hud.dist'), RX, 57);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // 叙事旁白（《山海经》碎片，上方居中，楷书+辉光，淡入淡出）
    const nar = game.narration;
    if (nar) {
      ctx.textAlign = 'center';
      ctx.font = `28px ${FONT_KAI}`;
      ctx.shadowColor = rgb(theme.glow, 0.9 * nar.alpha);
      ctx.shadowBlur = 22;
      ctx.fillStyle = rgb([248, 238, 222], nar.alpha);
      ctx.fillText(t(nar.key), vw / 2, WORLD_H * 0.32);
      ctx.shadowBlur = 0;
    }
    // 新手情境提示（底部居中，脉动辉光）
    const hint = game.hint;
    if (hint) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 320);
      ctx.textAlign = 'center';
      ctx.font = `18px ${FONT_KAI}`;
      ctx.shadowColor = rgb(theme.glow, 0.9);
      ctx.shadowBlur = 16;
      ctx.fillStyle = rgb(theme.glow, pulse);
      ctx.fillText(tTouch(hint, coarse), vw / 2, WORLD_H * 0.72);
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
    ctx.font = `12px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(255,240,220,0.6)';
    ctx.fillText(t('hud.charge'), bx - 10, by - 4);
    if (ready) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 200);
      ctx.textAlign = 'center';
      ctx.font = `15px ${FONT_KAI}`;
      ctx.shadowColor = rgb(theme.glow, 0.9);
      ctx.shadowBlur = 14;
      ctx.fillStyle = rgb(theme.glow, pulse);
      ctx.fillText(tTouch('hint.ult', coarse), vw / 2, by - 20);
      ctx.shadowBlur = 0;
    }
    return;
  }

  if (game.state === 'title') {
    ctx.textAlign = 'center';
    // 题名·逐光
    const titleY = WORLD_H * 0.22;
    ctx.font = `54px ${FONT_KAI}`;
    ctx.shadowColor = rgb(theme.glow, 0.9);
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#f7ecd8';
    ctx.fillText(t('title.main'), vw / 2, titleY);
    ctx.shadowBlur = 0;
    // 笔意细线分隔
    brushRule(ctx, vw / 2, WORLD_H * 0.35, 280, theme.glow, 0.5);
    // 副题·夸父逐日
    ctx.font = `22px ${FONT_KAI}`;
    ctx.fillStyle = rgb(theme.glow, 0.92);
    ctx.fillText(t('title.sub'), vw / 2, WORLD_H * 0.385);
    // 楔子
    ctx.font = `14px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(240,228,210,0.58)';
    ctx.fillText(t('title.prologue'), vw / 2, WORLD_H * 0.45);
    // 模式横幅：常规无尽 / 今日挑战（含日期）+ 切换提示
    const daily = game.mode === 'daily';
    const date = game.boardKey.startsWith('daily:') ? game.boardKey.slice(6) : '';
    ctx.font = `19px ${FONT_KAI}`;
    ctx.fillStyle = rgb(theme.glow, 0.95);
    ctx.fillText(daily ? `${t('mode.daily')} · ${date}` : t('mode.endless'), vw / 2, WORLD_H * 0.52);
    ctx.font = `12px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(240,228,210,0.55)';
    ctx.fillText(`${t(daily ? 'mode.dailyHint' : 'mode.endlessHint')}　·　${tTouch('mode.switch', coarse)}`, vw / 2, WORLD_H * 0.52 + 26);
    // 只显示当前设备的操作行：触屏端示按钮，键盘端示键位（两行并陈徒增噪）
    ctx.font = `15px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(255,248,235,0.72)';
    ctx.fillText(t(coarse ? 'title.ctrl3' : 'title.ctrl1'), vw / 2, WORLD_H * 0.63);
    ctx.fillText(t('title.ctrl2'), vw / 2, WORLD_H * 0.63 + 26);
    if (Math.floor(performance.now() / 600) % 2 === 0) {
      ctx.fillStyle = rgb(theme.glow);
      ctx.font = `16px ${FONT_KAI}`;
      ctx.fillText(tTouch('title.start', coarse), vw / 2, WORLD_H * 0.75);
    }
    // 简繁切换 / 帮助提示（下角）
    ctx.font = `13px ${FONT_KAI}`;
    ctx.fillStyle = 'rgba(240,228,210,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(tTouch('title.script', coarse), vw - 16, WORLD_H - 24);
    ctx.textAlign = 'left';
    ctx.fillText(tTouch('help.open', coarse), 16, WORLD_H - 24);
    return;
  }

  // dead（结局图与压暗由渲染层绘制，此处只叠字）
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';   // 结局图较亮，统一暗影托字，暗淡文案亦可读
  ctx.shadowBlur = 7;
  const st = game.runStats;
  // 死因·升华为神话之句
  ctx.font = `22px ${FONT_KAI}`;
  ctx.fillStyle = 'rgba(248,238,222,0.62)';
  ctx.fillText(t(DEATH_KEY[game.deathCause ?? 'darkness'] ?? 'death.darkness'), vw / 2, WORLD_H * 0.22);
  // 功业·本局总分，朱印钤记（如画作落款用印）
  ctx.font = `48px ${FONT_HUD}`;
  ctx.fillStyle = '#f7ecd8';
  const scoreStr = `${st?.score ?? 0}`;
  ctx.fillText(scoreStr, vw / 2, WORLD_H * 0.30);
  brushRule(ctx, vw / 2, WORLD_H * 0.30 + 62, 200, theme.glow, 0.42);
  // 称号：按本局功业授名（身份与进阶感）
  ctx.font = `21px ${FONT_KAI}`;
  ctx.fillStyle = rgb(theme.glow, 0.95);
  ctx.fillText(`「${t(rankKeyFor(st?.score ?? 0))}」`, vw / 2, WORLD_H * 0.40);
  ctx.font = `15px ${FONT_KAI}`;
  ctx.fillStyle = 'rgba(255,245,230,0.82)';
  ctx.fillText(`${t('death.dist')} ${st?.distanceM ?? 0} ${t('hud.dist')}    ${t('death.best')} ${best}`, vw / 2, WORLD_H * 0.46);
  // 榜
  ctx.font = `13px ${FONT_KAI}`;
  ctx.fillStyle = 'rgba(255,245,230,0.75)';
  let y = WORLD_H * 0.52;
  if (board.status === 'pending') {
    ctx.fillText(t('death.pending'), vw / 2, y);
  } else if (board.status === 'offline') {
    ctx.fillText(t('death.offline'), vw / 2, y);
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
  ctx.font = `16px ${FONT_KAI}`;
  ctx.fillStyle = 'rgba(240,228,210,0.6)';
  ctx.fillText(t('death.footer'), vw / 2, fy);      // 弃其杖，化为邓林
  ctx.font = `13px ${FONT_KAI}`;
  ctx.fillStyle = 'rgba(255,240,220,0.6)';
  ctx.fillText(tTouch('death.share', coarse), vw / 2, fy + 30);
  ctx.font = `16px ${FONT_KAI}`;
  ctx.fillStyle = rgb(theme.glow);
  ctx.fillText(tTouch('death.restart', coarse), vw / 2, fy + 60);
  ctx.shadowBlur = 0;
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
  ctx.font = `${Math.round(26 * s)}px ${FONT_KAI}`;
  ctx.fillText(t('rotate.hint'), cx, cy + 40 * s);
  ctx.fillStyle = rgb(theme.glow, 0.9);
  ctx.font = `${Math.round(18 * s)}px ${FONT_KAI}`;
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
export function drawHelp(ctx: CanvasRenderingContext2D, theme: Theme, vw: number, muted = false, coarse = false) {
  ctx.fillStyle = 'rgba(20,10,6,0.82)';
  ctx.fillRect(0, 0, vw, WORLD_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `30px ${FONT_KAI}`;
  ctx.shadowColor = rgb(theme.glow, 0.8);
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#f7ecd8';
  ctx.fillText(t('help.title'), vw / 2, WORLD_H * 0.13);
  ctx.shadowBlur = 0;
  brushRule(ctx, vw / 2, WORLD_H * 0.13 + 40, 200, theme.glow, 0.5);
  const rows = ['help.move', 'help.jump', 'help.dash', 'help.ult', 'help.mote', 'help.water', 'help.keys'];
  ctx.font = `17px ${FONT_KAI}`;
  ctx.fillStyle = 'rgba(255,246,232,0.9)';
  let y = WORLD_H * 0.28;
  for (const key of rows) {
    ctx.fillText(tTouch(key, coarse), vw / 2, y);
    y += 34;
  }
  // 声音开关：触屏无 M 键，画一枚可点的声音钮（喇叭字形 + 开/关；点击见 main 的浮层命中）
  if (coarse) {
    const my = WORLD_H * 0.80, mw = 168, mh = 44, mx = vw / 2 - mw / 2;
    roundRectPath(ctx, mx, my - mh / 2, mw, mh, mh / 2);
    ctx.fillStyle = 'rgba(10,6,4,0.5)'; ctx.fill();
    ctx.strokeStyle = rgb(theme.glow, muted ? 0.32 : 0.7); ctx.lineWidth = 1; ctx.stroke();
    speakerGlyph(ctx, vw / 2 - 42, my, 1.5, theme.glow, muted ? 0.5 : 0.95, muted);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `18px ${FONT_KAI}`;
    ctx.fillStyle = muted ? 'rgba(240,228,210,0.55)' : rgb(theme.glow, 0.95);
    ctx.fillText(t(muted ? 'help.sound.off' : 'help.sound.on'), vw / 2 - 26, my + 1);
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  }
  ctx.font = `15px ${FONT_KAI}`;
  ctx.fillStyle = rgb(theme.glow);
  ctx.fillText(t('help.close'), vw / 2, WORLD_H * 0.86);
}
