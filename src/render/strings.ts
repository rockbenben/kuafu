// 文案与字体的转发层：实现搬到 src/i18n/，此处只保留渲染层习惯的入口，
// 避免 ui/renderer/share 三个消费方改 import 路径。

export {
  t, tf, tTouch, getLocale, setLocale, resolveLocale, pickLocale, fontKai, fontHud, fontKaiFor,
  LOCALES, MESSAGES,
} from '../i18n';
export type { Locale, LocaleMeta, LocaleSources, StringKey, Messages } from '../i18n';


// 按功业分数授予称号（逐日进阶，退出/分享皆见其名，成留存与身份钩子）
const RANK_CUTS = [100, 300, 700, 1500, 3000];
export type RankKey = 'rank.0' | 'rank.1' | 'rank.2' | 'rank.3' | 'rank.4' | 'rank.5';

export function rankKeyFor(score: number): RankKey {
  let i = 0;
  while (i < RANK_CUTS.length && score >= RANK_CUTS[i]) i++;
  return `rank.${i as 0 | 1 | 2 | 3 | 4 | 5}`;
}
