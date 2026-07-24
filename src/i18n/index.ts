// i18n 入口：文案查表、当前语种、按语种字体。
// 5 个语种全量内联（合计 gzip 约 4-5KB），不做懒加载——换取切换零延迟、无首帧语种竞态。

import { zhHans } from './zh-Hans';
import { zhHant } from './zh-Hant';
import { en } from './en';
import { ja } from './ja';
import { ko } from './ko';
import { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES, type Locale, type Messages, type StringKey } from './keys';

export * from './keys';

export const MESSAGES: Record<Locale, Messages> = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  en,
  ja,
  ko,
};

let current: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale): void {
  current = l;
}

export function t(key: StringKey): string {
  return MESSAGES[current][key] ?? key;
}

/** 插值：只做 `{name}` 字面替换。未提供的占位符原样保留，便于测试发现漏传。 */
export function tf(key: StringKey, vars: Record<string, string>): string {
  return t(key).replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m);
}

/** 触屏变体优先：粗指针设备取 `${key}.touch`（改说按钮），无变体则回退键位文案。 */
export function tTouch(key: string, coarse: boolean): string {
  const touch = `${key}.touch` as StringKey;
  if (coarse && MESSAGES[current][touch] !== undefined) return t(touch);
  return t(key as StringKey);
}

// ---- 字体 ----
//
// 全部选衬线 / 明朝系以保住古意。表里都是本机可能已装的族名，命中则用、
// 不命中继续往下退——不下发任何 webfont，游戏须离线可用。
//
// 各栈末尾除 serif 外还补一个同语种黑体：Windows 默认不装 Mincho / Myeongjo
// （本机实测有 Yu Gothic 与 Malgun Gothic，无 Yu Mincho、无 Batang），
// 宁可退化成同语种黑体，也不能出豆腐块。

const KAI_ZH = '"STKaiti","KaiTi","楷体","BiauKai","DFKai-SB","KaiTi_GB2312","Noto Serif SC",serif';
const KAI_JA = '"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS Mincho","Noto Serif JP","Yu Gothic",serif';
const KAI_KO = '"Nanum Myeongjo","AppleMyungjo","Batang","Noto Serif KR","Malgun Gothic",serif';
const KAI_EN = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';

const HUD_ZH = '"STKaiti","KaiTi","楷体","Noto Serif SC",serif';
const HUD_JA = '"Yu Mincho","YuMincho","MS Mincho","Noto Serif JP","Yu Gothic",serif';
const HUD_KO = '"Nanum Myeongjo","Batang","Noto Serif KR","Malgun Gothic",serif';
const HUD_EN = '"Palatino Linotype",Palatino,Georgia,serif';

const KAI: Record<Locale, string> = {
  'zh-Hans': KAI_ZH, 'zh-Hant': KAI_ZH, en: KAI_EN, ja: KAI_JA, ko: KAI_KO,
};
const HUD: Record<Locale, string> = {
  'zh-Hans': HUD_ZH, 'zh-Hant': HUD_ZH, en: HUD_EN, ja: HUD_JA, ko: HUD_KO,
};

/** 古体字体栈：题名、旁白、说明文字用之。 */
export function fontKai(): string { return KAI[current]; }
/** 指定语种的古体字体栈——语言菜单要用各语种自己的字体画自称，否则出豆腐块。 */
export function fontKaiFor(l: Locale): string { return KAI[l]; }
/** HUD 数字用，兼顾易读与古意。 */
export function fontHud(): string { return HUD[current]; }

// ---- 语种协商 ----

/**
 * 把一个 BCP-47 标签归一化到支持的语种；认不出返回 null。
 * 与 resolveLocale 的区别在于「认不出」是否兜底——上层要靠这个区分
 * 「用户显式指定了但我们不支持」和「用户没指定」。
 */
function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const s = tag.replace(/_/g, '-').toLowerCase();
  if (s.startsWith('zh')) {
    return /hant|-tw|-hk|-mo/.test(s) ? 'zh-Hant' : 'zh-Hans';
  }
  const base = s.split('-')[0];
  return LOCALES.find(l => l.id.toLowerCase() === s || l.id.toLowerCase() === base)?.id ?? null;
}

/** 归一化到支持的语种，认不出则兜底 en。 */
export function resolveLocale(tag: string | null | undefined): Locale {
  return matchLocale(tag) ?? FALLBACK_LOCALE;
}

export interface LocaleSources {
  /** ?lang= 查询参数 */
  query?: string | null;
  /** 预渲染页注入的 window.__LANG__（根路径不注入） */
  injected?: string | null;
  /** localStorage 里存过的偏好 */
  stored?: string | null;
  /** stored 是否为用户在语言菜单里亲自选定的 */
  pinned?: boolean;
  /** navigator.languages */
  navigator?: readonly string[];
}

/**
 * 按优先级选定语种：
 *   用户亲选的偏好 → ?lang= → 注入的路径语种 → 存着的偏好 → navigator → en
 *
 * 「亲选」排在最前是关键：?lang= 与路径语种都常来自**别人**构造的链接，
 * 而亲选来自本人。此前 ?lang= 压在亲选之上，导致在 ?lang=ja 的链接上选了
 * 韩文、一刷新又变回日文，选择器看起来像坏的；路径语种压在亲选之上，则
 * 让点一次朋友发来的 /ja/ 就把自己选的语种顶掉。
 *
 * 代价：已亲选的用户无法再用 ?lang= 预览别的语言——那属于排障场景，
 * 让位于「用户的选择必须留得住」。chooseLocale 另会把 ?lang= 从地址栏
 * 清掉，免得参数和偏好长期打架。
 *
 * `auto` 为真表示是从浏览器语言推断的（没有任何显式意图），
 * 上层据此决定要不要提示「已为你选择 X」。
 */
export function pickLocale(src: LocaleSources): { locale: Locale; auto: boolean } {
  const pinned = src.pinned ? matchLocale(src.stored) : null;
  for (const explicit of [pinned, src.query, src.injected, src.stored]) {
    const hit = matchLocale(explicit);
    if (hit) return { locale: hit, auto: false };
  }
  for (const tag of src.navigator ?? []) {
    const hit = matchLocale(tag);
    if (hit) return { locale: hit, auto: true };
  }
  return { locale: FALLBACK_LOCALE, auto: true };
}
