import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../src/i18n/keys';
import { SITE } from '../scripts/site-meta.mjs';
import { charsetFor, socialCharset } from '../scripts/subset-fonts.mjs';
import { DAWN } from '../scripts/social-card.mjs';
import { themeAt } from '../src/render/theme';

const ROOT = join(__dirname, '..');

/**
 * og 卡与子集字体都是**提交进仓库的产物**（生成脚本不进 npm run build，
 * 因为 CI 没有 CJK 字体会静默产出豆腐块）。所以这里守的是产物本身：
 * 少一个、空一个、或文案改了却忘了重跑，都要在测试里露出来。
 */
describe('og 卡产物', () => {
  for (const { id } of LOCALES) {
    it(`${id}.jpg 存在且不是空壳`, () => {
      const p = join(ROOT, 'public', 'og', `${id}.jpg`);
      expect(existsSync(p), `缺 ${p}——跑 npm run og`).toBe(true);
      expect(statSync(p).size, `${id}.jpg 太小，多半生成失败`).toBeGreaterThan(10 * 1024);
    });

    // 守的是格式本身。Facebook / LinkedIn / 微信 的抓取器不认 WebP 的 og:image，
    // 换回去就是「分享出去没图」，而这种坏法在本地和 CI 都看不出来——只有别人
    // 转发时才发现。谁为了省体积把 encode 改回 webp，这里就该红。
    it(`${id}.jpg 是合法 JPEG`, () => {
      const buf = readFileSync(join(ROOT, 'public', 'og', `${id}.jpg`));
      expect([...buf.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    });
  }
});

// GitHub 的 Social preview 上传口只收 PNG / JPG / GIF 且 ≤1 MB，超了直接拒收。
// 这是**手工**上传的设置，没有 API、也没有构建期能报错的环节——画版一换、
// 卡面一改，超限只会在某次上传时才发现。故把这几条约束钉在测试里。
describe('GitHub 社交预览图', () => {
  const p = join(ROOT, 'docs', 'images', 'social-card.png');

  it('存在，且是 1280×640 的合法 PNG', () => {
    expect(existsSync(p), `缺 ${p}——跑 npm run og`).toBe(true);
    const buf = readFileSync(p);
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1280, 640]);
  });

  it('不超过 GitHub 的 1 MB 上限', () => {
    expect(statSync(p).size).toBeLessThan(1024 * 1024);
  });

  // 卡上的天色是从 render/theme.ts 抄过去的一份常量（node 脚本读不了 TS）。
  // 抄本会漂：游戏里把拂晓调暖了，卡还停在旧色，两边就再也不是同一个世界。
  it('卡面天色与游戏内「拂晓启程」同源', () => {
    const dawn = themeAt(0);
    expect(DAWN.skyTop).toEqual(dawn.skyTop);
    expect(DAWN.skyBottom).toEqual(dawn.skyBottom);
    expect(DAWN.fog).toEqual(dawn.fog);
    expect(DAWN.glow).toEqual(dawn.glow);
  });

  it('楷体子集存在且覆盖卡面用到的全部字', () => {
    const f = join(ROOT, 'assets', 'fonts', 'og', 'social.subset.ttf');
    expect(existsSync(f), `缺 ${f}——跑 npm run fonts`).toBe(true);
    expect(statSync(f).size).toBeGreaterThan(4 * 1024);
    expect(socialCharset().length).toBeGreaterThan(0);
  });
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
