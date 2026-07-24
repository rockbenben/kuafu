import { zhHans } from './zh-Hans';

export type Locale = 'zh-Hans' | 'zh-Hant' | 'en' | 'ja' | 'ko';

export interface LocaleMeta {
  id: Locale;
  /** 语种自称：恒以其本身文字显示，不随当前语种变化，故不进文案表。 */
  native: string;
  /** <html lang> 与 hreflang 用 */
  htmlLang: string;
  /** og:locale 用 */
  ogLocale: string;
}

// 首项为默认语种（canonical）
export const LOCALES: readonly LocaleMeta[] = [
  { id: 'zh-Hans', native: '简体中文', htmlLang: 'zh-Hans', ogLocale: 'zh_CN' },
  { id: 'zh-Hant', native: '繁體中文', htmlLang: 'zh-Hant', ogLocale: 'zh_TW' },
  { id: 'en', native: 'English', htmlLang: 'en', ogLocale: 'en_US' },
  { id: 'ja', native: '日本語', htmlLang: 'ja', ogLocale: 'ja_JP' },
  { id: 'ko', native: '한국어', htmlLang: 'ko', ogLocale: 'ko_KR' },
];

export const DEFAULT_LOCALE: Locale = 'zh-Hans';
/** 无法从任何来源推断时的兜底（非中文用户占多数，故不回落到中文） */
export const FALLBACK_LOCALE: Locale = 'en';

export type StringKey = keyof typeof zhHans;
export type Messages = Record<StringKey, string>;
