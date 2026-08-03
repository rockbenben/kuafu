import { describe, it, expect } from 'vitest';
import { LOCALES, type StringKey } from '../src/i18n/keys';
import { MESSAGES } from '../src/i18n';
import { estWidth } from '../src/render/text';

/**
 * 外语文案的宽度预算。
 *
 * px 取自 ui.ts 的实际绘制字号；max 必须按**最窄**的运行时视口算，而不是
 * VIEW_W(960)——renderer.ts 的 VW = max(820, min(1400, ...))，任何宽高比
 * 低于约 1.42 的显示（4:3 笔记本与 iPad、竖屏手机、缩小的桌面窗口）都会
 * 落到 820 这个下限。此前按 960 写预算，等于给了 17% 的虚额，测试报绿而
 * 实际仍被 drawFit 缩字——那正是这条测试本该拦住的事。
 *
 * 于是 max = 820 - (该绘制点让出的边距)：旁白/提示 vw-80 → 740，
 * 帮助行 vw-120 → 700，标题页 vw-100 → 720，旁白出处 vw-160 → 660。
 *
 * estWidth 是近似模型（全角 1em / 其余 0.5em），挡的是量级性的回归，
 * 不替代真实 measureText；最终观感仍需人工过一遍五个语种。
 */
const VW_MIN = 820;   // renderer.ts 的视口下限
// 帮助行现在画在面板里，可用宽度是「面板宽 − 左右各 20」，不再是 vw − 120。
// 预算必须跟着绘制走，否则这条测试守的是一个已经不存在的宽度。
const HELP_ROW_MAX = Math.floor(VW_MIN * 0.62) - 40;
const BUDGET: { key: StringKey; px: number; max: number }[] = [
  { key: 'title.prologue', px: 14, max: VW_MIN - 100 },
  { key: 'title.ctrl1', px: 15, max: VW_MIN - 100 },
  { key: 'title.ctrl2', px: 15, max: VW_MIN - 100 },
  { key: 'title.ctrl3', px: 15, max: VW_MIN - 100 },
  { key: 'title.start', px: 16, max: VW_MIN - 120 },
  { key: 'mode.dailyHint', px: 12, max: 400 },
  { key: 'mode.endlessHint', px: 12, max: 400 },
  { key: 'help.move', px: 17, max: HELP_ROW_MAX },
  { key: 'help.jump', px: 17, max: HELP_ROW_MAX },
  { key: 'help.dash', px: 17, max: HELP_ROW_MAX },
  { key: 'help.ult', px: 17, max: HELP_ROW_MAX },
  { key: 'help.mote', px: 17, max: HELP_ROW_MAX },
  { key: 'help.water', px: 17, max: HELP_ROW_MAX },
  { key: 'help.keys', px: 17, max: HELP_ROW_MAX },
  { key: 'help.close', px: 15, max: HELP_ROW_MAX },
  { key: 'hint.run', px: 18, max: VW_MIN - 80 },
  { key: 'hint.jump', px: 18, max: VW_MIN - 80 },
  { key: 'hint.dash', px: 18, max: VW_MIN - 80 },
  { key: 'hint.kill', px: 18, max: VW_MIN - 80 },
  { key: 'hint.score', px: 18, max: VW_MIN - 80 },
  { key: 'hint.ult', px: 18, max: VW_MIN - 80 },
  { key: 'death.spike', px: 22, max: VW_MIN - 80 },
  { key: 'death.fall', px: 22, max: VW_MIN - 80 },
  { key: 'death.darkness', px: 22, max: VW_MIN - 80 },
  { key: 'death.enemy', px: 22, max: VW_MIN - 80 },
  { key: 'death.footer', px: 16, max: VW_MIN - 80 },
  { key: 'death.restart', px: 16, max: VW_MIN - 80 },
  { key: 'death.share', px: 13, max: VW_MIN - 80 },
  { key: 'death.offline', px: 13, max: VW_MIN - 80 },
  { key: 'death.pending', px: 13, max: VW_MIN - 80 },
  { key: 'share.tagline', px: 32, max: 1100 }, // 分享卡 1200 宽
];

// 旁白正文 28px / 出处 15px，均居中；maxWidth 分别为 vw-80 与 vw-160
for (let i = 0; i <= 11; i++) {
  BUDGET.push({ key: `nar.${i}` as StringKey, px: 28, max: VW_MIN - 80 });
  BUDGET.push({ key: `nar.${i}.src` as StringKey, px: 15, max: VW_MIN - 160 });
}

describe('外语文案不撑破画布', () => {
  for (const { id } of LOCALES) {
    for (const b of BUDGET) {
      it(`${id} ${b.key}`, () => {
        const text = MESSAGES[id][b.key];
        const w = estWidth(text, b.px);
        expect(w, `${id} ${b.key} @${b.px}px 估宽 ${Math.round(w)} > ${b.max}\n  「${text}」`)
          .toBeLessThanOrEqual(b.max);
      });
    }
  }

  it('触屏变体同样受约束', () => {
    const over: string[] = [];
    for (const { id } of LOCALES) {
      for (const b of BUDGET) {
        const touch = `${b.key}.touch` as StringKey;
        const text = MESSAGES[id][touch];
        if (typeof text !== 'string') continue;
        const w = estWidth(text, b.px);
        if (w > b.max) over.push(`${id} ${touch} ${Math.round(w)}>${b.max}「${text}」`);
      }
    }
    expect(over, over.join('\n')).toEqual([]);
  });
});

/**
 * 触屏按钮是为**单个**字形定尺的圆钮（index.html 里 width/font-size 按 vh 写死，
 * 无换行也无自适应缩小）。多字符标签会溢出圆盘、与相邻按钮重叠——英文首版的
 * 'STRIDE'/'JUMP'/'DASH' 就是这么撑破的。
 */
describe('触屏按钮标签必须装得进圆钮', () => {
  const BTN: StringKey[] = ['btn.back', 'btn.fwd', 'btn.dash', 'btn.jump', 'btn.ult'];
  for (const { id } of LOCALES) {
    for (const key of BTN) {
      it(`${id} ${key}`, () => {
        const label = MESSAGES[id][key];
        // 按**字形个数**卡，而不是 estWidth：estWidth 把 ◀ ▶ ▲ ≫ ★ 都算 0.5 格，
        // 于是上限 1 格会放行任何两字符标签（'GO'、'≫≫'、重新引入的两字母缩写），
        // 而圆钮是按单个字形定尺的（width 17vh / font-size 7vh，无换行无自适应）。
        expect([...label].length, `${id} ${key} = 「${label}」 只能是一个字形，否则溢出圆钮`)
          .toBe(1);
      });
    }
  }

  it('帮助与提示文案必须提到按钮上真正印着的字', () => {
    const bad: string[] = [];
    for (const { id } of LOCALES) {
      const m = MESSAGES[id];
      const pairs: [StringKey, StringKey][] = [
        ['help.move.touch', 'btn.back'],
        ['help.move.touch', 'btn.fwd'],
        ['help.jump.touch', 'btn.jump'],
        ['help.dash.touch', 'btn.dash'],
        ['help.ult.touch', 'btn.ult'],
        ['hint.run.touch', 'btn.fwd'],
        ['hint.jump.touch', 'btn.jump'],
        ['hint.dash.touch', 'btn.dash'],
        ['hint.kill.touch', 'btn.dash'],
        ['hint.kill.touch', 'btn.jump'],   // 打怪有两法：撞碎与踩踏，两个按钮都得提到
        ['hint.ult.touch', 'btn.ult'],
      ];
      for (const [textKey, btnKey] of pairs) {
        if (!m[textKey].includes(m[btnKey])) {
          bad.push(`${id} ${textKey}「${m[textKey]}」未提到按钮字「${m[btnKey]}」`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
