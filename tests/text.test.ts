import { describe, it, expect } from 'vitest';
import { estWidth, wrapByWidth } from '../src/render/text';

describe('estWidth 粗字宽模型', () => {
  it('CJK 计满宽，拉丁计半宽', () => {
    expect(estWidth('逐光', 28)).toBe(56);
    expect(estWidth('abcd', 28)).toBe(56);
  });

  it('谚文按满宽算（韩文方块字与汉字同宽）', () => {
    expect(estWidth('한국어', 28)).toBe(84);
  });

  it('假名按满宽算', () => {
    expect(estWidth('ひらがな', 20)).toBe(80);
  });

  it('全角标点计满宽，半角标点计半宽', () => {
    expect(estWidth('，。', 20)).toBe(40);
    expect(estWidth(',.', 20)).toBe(20);
  });

  it('空串为 0', () => {
    expect(estWidth('', 28)).toBe(0);
  });

  it('中英混排逐字累加', () => {
    // 「逐光 x2」= 2 汉字 + 1 空格 + 2 拉丁 = 2*1 + 3*0.5 = 3.5 em
    expect(estWidth('逐光 x2', 10)).toBeCloseTo(35, 5);
  });
});

describe('wrapByWidth 软换行', () => {
  it('拉丁语系按词断行，不切断单词', () => {
    const lines = wrapByWidth('the quick brown fox jumps', 10, 50);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(estWidth(l, 10)).toBeLessThanOrEqual(50);
    expect(lines.join(' ')).toBe('the quick brown fox jumps'); // 不丢字
  });

  it('CJK 无空格，逐字断行', () => {
    const lines = wrapByWidth('夸父与日逐走饮于河渭', 10, 40);
    expect(lines.length).toBe(3); // 每行 4 字
    expect(lines.join('')).toBe('夸父与日逐走饮于河渭');
  });

  it('放得下就不换行', () => {
    expect(wrapByWidth('短句', 10, 999)).toEqual(['短句']);
  });

  it('单个超长词也要吐出来，不能丢', () => {
    const lines = wrapByWidth('supercalifragilistic', 10, 30);
    expect(lines.join('')).toContain('supercalifragilistic'.slice(0, 6));
    expect(lines.length).toBeGreaterThan(1);
  });
});
