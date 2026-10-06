import { describe, it, expect } from 'vitest';
import { MESSAGES, FULLWIDTH_EXEMPT, LOCALES, type Locale } from '../src/i18n';

/**
 * 拉丁语种不许夹全角标点；例外必须是**写下来的名单**，且名单不许烂掉。
 *
 * 上一轮把「全角标点硬拼进 en/ko」那一族按语种收口（punct()），但规则只管到引号、
 * 括号、竖线，没管到**符号**：`avatar.tip` 里那个 ＋ 至今没人说它是例外还是漏网。
 * 全量重扫 116 条命中，ja/ko/zh-Hant 那 115 条是该语种正当标点，en 只剩这一条。
 * 于是把它写成名单：守卫从此咬得住"再往 en 里塞全角"，也咬得住"名单里躺着不再用的条目"。
 */
const FULLWIDTH = /[\uFF01-\uFF60\u3000-\u303F]/;
const LATIN_LOCALES: Locale[] = ['en'];

describe('拉丁语种的全角守卫', () => {
  for (const locale of LATIN_LOCALES) {
    it(`${locale} 的串里除名单之外没有全角标点`, () => {
      const bad: string[] = [];
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        const allowed = FULLWIDTH_EXEMPT[locale]?.[key as keyof typeof MESSAGES[Locale]] ?? '';
        const rest = [...String(value)].filter(c => FULLWIDTH.test(c) && !allowed.includes(c));
        if (rest.length) bad.push(`${key}: [${rest.join(' ')}] ${value}`);
      }
      expect(bad, '\n' + bad.join('\n')).toEqual([]);
    });
  }

  it('名单里每一条都真的还在用（写了不用就该删，否则下一个人不知道还能不能删）', () => {
    const stale: string[] = [];
    for (const [locale, keys] of Object.entries(FULLWIDTH_EXEMPT) as [Locale, Record<string, string>][]) {
      for (const [key, chars] of Object.entries(keys)) {
        const value = MESSAGES[locale][key as keyof typeof MESSAGES[Locale]];
        if (!value || ![...chars].every(c => String(value).includes(c))) stale.push(`${locale} ${key}`);
      }
    }
    expect(stale, '过期条目：' + stale.join(', ')).toEqual([]);
  });

  it('CJK 三语仍然按各自体例用全角（守卫没把它们误伤成半角）', () => {
    const cjk = LOCALES.filter(l => l.id !== 'en').map(l => l.id);
    const withFull = cjk.filter(l => Object.values(MESSAGES[l]).some(v => FULLWIDTH.test(v)));
    expect(withFull.length, 'CJK 语种一个全角都没有——多半是谁把体例抹了').toBe(cjk.length);
  });
});
