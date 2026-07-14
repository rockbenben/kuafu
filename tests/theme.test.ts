import { describe, it, expect } from 'vitest';
import { themeAt, journeyPhase, PHASE_ART, rgb } from '../src/render/theme';

describe('themeAt 景随事迁', () => {
  it('0m 拂晓启程色', () => {
    expect(themeAt(0).skyTop).toEqual([66, 60, 92]);
  });
  it('故事路标与场景对齐（各段基准色）', () => {
    expect(themeAt(250).skyTop).toEqual([104, 62, 44]); // 入日
    expect(themeAt(550).skyTop).toEqual([78, 66, 72]);  // 饮河渭
    expect(themeAt(2000).skyTop).toEqual([48, 32, 54]); // 化邓林
  });
  it('单向推进：饮河渭/大泽段水景显现', () => {
    expect(themeAt(550).water).toBeCloseTo(0.75, 2);
    expect(themeAt(900).water).toBeCloseTo(1, 2);
  });
  it('终章之后景仍变迁：月夜→大荒长夜→曦光重临', () => {
    expect(themeAt(2000).peach).toBeCloseTo(1, 2);   // 化邓林·桃景满
    expect(themeAt(2700).night).toBeCloseTo(0.7, 2); // 邓林月夜·夜色现
    expect(themeAt(4200).night).toBeCloseTo(1, 2);   // 大荒长夜·星野
    expect(themeAt(5800).night).toBeCloseTo(0.15, 2);// 曦光重临·天光再启
    expect(themeAt(2700).skyTop).not.toEqual(themeAt(2000).skyTop); // 不再停驻邓林
  });
  it('越过末段停驻曦光重临', () => {
    expect(themeAt(9000).skyTop).toEqual(themeAt(5800).skyTop);
  });
  it('段落美术映射覆盖全部旅程段落', () => {
    // 每段都能取到对应背景/道具键（含终章后段复用既有六套）
    expect(PHASE_ART.length).toBe(9);
    expect(PHASE_ART[journeyPhase(2700).i]).toBe('peach'); // 月夜复用桃
    expect(PHASE_ART[journeyPhase(4200).i]).toBe('parch'); // 长夜复用焦土
    expect(PHASE_ART[journeyPhase(5800).i]).toBe('dawn');  // 重临复用拂晓
  });
  it('段内线性插值', () => {
    const mid = themeAt(125).skyTop; // 0→250 中点
    expect(mid[0]).toBe(Math.round((66 + 104) / 2));
  });
});

describe('rgb', () => {
  it('输出 rgba 字符串', () => {
    expect(rgb([10, 20, 30], 0.5)).toBe('rgba(10,20,30,0.5)');
    expect(rgb([10, 20, 30])).toBe('rgba(10,20,30,1)');
  });
});
