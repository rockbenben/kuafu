import { describe, it, expect } from 'vitest';
import { rankKeyFor, t, setLocale } from '../src/render/strings';

describe('rankKeyFor 称号进阶', () => {
  it('随功业分数逐级晋升', () => {
    expect(rankKeyFor(0)).toBe('rank.0');
    expect(rankKeyFor(99)).toBe('rank.0');
    expect(rankKeyFor(100)).toBe('rank.1');
    expect(rankKeyFor(300)).toBe('rank.2');
    expect(rankKeyFor(700)).toBe('rank.3');
    expect(rankKeyFor(1500)).toBe('rank.4');
    expect(rankKeyFor(2999)).toBe('rank.4');
    expect(rankKeyFor(3000)).toBe('rank.5');
    expect(rankKeyFor(999999)).toBe('rank.5');
  });
  it('每个称号键都有简繁文案', () => {
    setLocale('zh-Hans');
    for (let i = 0; i <= 5; i++) expect(t(rankKeyFor([0, 100, 300, 700, 1500, 3000][i]))).not.toMatch(/^rank\./);
    setLocale('zh-Hant');
    expect(t('rank.5')).toBe('與日齊光');
    setLocale('zh-Hans');
  });
});
