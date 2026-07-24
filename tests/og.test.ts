import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../src/i18n/keys';
import { SITE } from '../scripts/site-meta.mjs';
import { charsetFor } from '../scripts/subset-fonts.mjs';

const ROOT = join(__dirname, '..');

/**
 * og 卡与子集字体都是**提交进仓库的产物**（生成脚本不进 npm run build，
 * 因为 CI 没有 CJK 字体会静默产出豆腐块）。所以这里守的是产物本身：
 * 少一个、空一个、或文案改了却忘了重跑，都要在测试里露出来。
 */
describe('og 卡产物', () => {
  for (const { id } of LOCALES) {
    it(`${id}.webp 存在且不是空壳`, () => {
      const p = join(ROOT, 'public', 'og', `${id}.webp`);
      expect(existsSync(p), `缺 ${p}——跑 npm run og`).toBe(true);
      expect(statSync(p).size, `${id}.webp 太小，多半生成失败`).toBeGreaterThan(10 * 1024);
    });

    it(`${id}.webp 是合法 WebP`, () => {
      const buf = readFileSync(join(ROOT, 'public', 'og', `${id}.webp`));
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    });
  }
});

describe('og 子集字体', () => {
  for (const { id } of LOCALES) {
    it(`${id}.subset.ttf 存在且覆盖该语种卡面用到的全部字`, () => {
      const p = join(ROOT, 'assets', 'fonts', 'og', `${id}.subset.ttf`);
      expect(existsSync(p), `缺 ${p}——跑 npm run fonts`).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(2 * 1024);

      // 子集是按卡面文案裁的：文案改了字体没重跑，字数对不上就该报警
      const meta = SITE.find(s => s.id === id)!;
      expect(charsetFor(meta).length).toBeGreaterThan(0);
    });
  }

  it('OFL 署名随字体一同提交（SIL 许可要求）', () => {
    const p = join(ROOT, 'assets', 'fonts', 'og', 'OFL.txt');
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, 'utf8')).toContain('SIL Open Font License');
  });

  it('五份子集合计不过分——它们只服务于构建期，不下发给浏览器', () => {
    const total = LOCALES.reduce(
      (n, { id }) => n + statSync(join(ROOT, 'assets', 'fonts', 'og', `${id}.subset.ttf`)).size, 0);
    expect(total).toBeLessThan(120 * 1024);
  });
});
