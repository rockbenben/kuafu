import { describe, it, expect } from 'vitest';
import { LOCALES } from '../src/i18n/keys';
import { SITE, SITE_URL, localeMeta } from '../scripts/site-meta.mjs';
import { renderPage, buildSitemap, assetPrefix } from '../scripts/prerender.mjs';

// 构建产物的最小骨架，够覆盖所有要替换的头部字段
const BASE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>逐光 · Chasing Light</title>
  <meta name="description" content="中文描述" />
  <meta property="og:title" content="逐光 · 夸父逐日" />
  <meta property="og:description" content="中文 og 描述" />
  <meta property="og:url" content="https://kuafu.newzone.top/" />
  <meta property="og:image" content="https://kuafu.newzone.top/og-card.webp" />
  <meta name="twitter:image" content="https://kuafu.newzone.top/og-card.webp" />
  <script type="module" crossorigin src="./assets/index-abc.js"></script>
  <link rel="icon" href="./favicon.svg" />
</head>
<body><canvas id="game"></canvas></body>
</html>`;

describe('site-meta 与 LOCALES 不漂移', () => {
  it('两处的语种集合完全一致', () => {
    expect(SITE.map(s => s.id)).toEqual(LOCALES.map(l => l.id));
  });

  it('每个语种的 htmlLang / ogLocale 与 keys.ts 一致', () => {
    for (const l of LOCALES) {
      const m = localeMeta(l.id);
      expect(m.htmlLang, l.id).toBe(l.htmlLang);
      expect(m.ogLocale, l.id).toBe(l.ogLocale);
      expect(m.native, l.id).toBe(l.native);
    }
  });

  it('每个语种都有非空的 title / description / ogTitle / ogDescription', () => {
    for (const s of SITE) {
      for (const f of ['title', 'description', 'ogTitle', 'ogDescription'] as const) {
        expect(String(s[f] ?? '').trim().length, `${s.id}.${f}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('renderPage', () => {
  const ja = renderPage(BASE_HTML, 'ja');
  const root = renderPage(BASE_HTML, 'zh-Hans');

  it('改写 <html lang>', () => {
    expect(ja).toContain('<html lang="ja">');
    expect(root).toContain('<html lang="zh-Hans">');
  });

  it('本地化 title 与 description', () => {
    const m = localeMeta('ja');
    expect(ja).toContain(`<title>${m.title}</title>`);
    expect(ja).toContain(`content="${m.description}"`);
    expect(ja).not.toContain('中文描述');
  });

  it('canonical 指向该语种自身 URL', () => {
    expect(ja).toContain(`<link rel="canonical" href="${SITE_URL}/ja/" />`);
    expect(root).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
  });

  it('五条 hreflang 加一条 x-default，x-default 指向根', () => {
    for (const l of LOCALES) {
      const href = l.id === 'zh-Hans' ? `${SITE_URL}/` : `${SITE_URL}/${l.id}/`;
      expect(ja, l.id).toContain(`hreflang="${l.htmlLang}" href="${href}"`);
    }
    expect(ja).toContain(`hreflang="x-default" href="${SITE_URL}/"`);
    expect((ja.match(/rel="alternate"/g) ?? []).length).toBe(LOCALES.length + 1);
  });

  it('og:url / og:image / og:locale 按语种走', () => {
    expect(ja).toContain(`content="${SITE_URL}/ja/"`);
    expect(ja).toContain(`content="${SITE_URL}/og/ja.webp"`);
    expect(ja).toContain('property="og:locale" content="ja_JP"');
  });

  it('twitter 卡片同步本地化', () => {
    const m = localeMeta('ja');
    expect(ja).toContain(`name="twitter:title" content="${m.ogTitle}"`);
    expect(ja).toContain(`content="${SITE_URL}/og/ja.webp"`);
  });

  // 美术资源是 assets.ts 运行时拼的 URL，reroot() 只改 HTML 属性够不着；
  // 少了这个注入，子页所有美术资源都会 404 且被 loadOne 静默吞掉。
  it('子目录页注入资源深度前缀，且与 HTML 重写用的是同一个真源', () => {
    expect(assetPrefix('ja')).toBe('../');
    expect(assetPrefix('zh-Hans')).toBe('./');
    expect(ja).toContain('window.__ASSET_BASE__="../"');
  });

  it('根页不注入资源前缀（本就位于站点根，用构建期的 base 即可）', () => {
    expect(root).not.toContain('__ASSET_BASE__');
  });

  // 这条要真能失败：从 HTML 里**实测**出前缀，再与注入值比，而不是各自
  // 硬断言 '../'（那样两边一起改错也照样绿）。
  it('HTML 重写与 JS 注入必须用同一个前缀', () => {
    const jsPrefix = /__ASSET_BASE__="([^"]+)"/.exec(ja)?.[1];
    const htmlPrefix = /\ssrc="((?:\.\.?\/)*)assets\//.exec(ja)?.[1];
    expect(jsPrefix, 'JS 注入前缀缺失').toBeTruthy();
    expect(htmlPrefix, 'HTML 里没找到相对的 assets 引用').toBeTruthy();
    expect(htmlPrefix).toBe(jsPrefix);
    expect(jsPrefix).toBe(assetPrefix('ja'));
  });

  it('根页也走同一条重写路径，前缀为 ./', () => {
    const htmlPrefix = /\ssrc="((?:\.\.?\/)*)assets\//.exec(root)?.[1];
    expect(htmlPrefix).toBe(assetPrefix('zh-Hans'));
  });

  it('非根路径注入 __LANG__，根路径不注入', () => {
    // 根路径是默认页而非显式意图，注入会盖过用户存过的偏好（见 pickLocale 的优先级）
    expect(ja).toContain('window.__LANG__="ja"');
    expect(root).not.toContain('window.__LANG__');
  });

  it('子目录页把资源路径退一层——否则 ./assets 会指向 /ja/assets 而 404', () => {
    expect(ja).toContain('src="../assets/index-abc.js"');
    expect(ja).toContain('href="../favicon.svg"');
    expect(ja).not.toContain('"./assets/');
  });

  it('根页保持原样的相对路径', () => {
    expect(root).toContain('src="./assets/index-abc.js"');
    expect(root).not.toContain('"../assets/');
  });

  // 同一份产物既挂根域（EdgeOne）也挂子路径（GitHub Pages），任何绝对
  // 资源路径都会让后者整站 404——这是本次改动踩过的坑，锁死它。
  it('两种页面都不得出现绝对资源路径', () => {
    for (const html of [root, ja]) {
      expect(html).not.toMatch(/\s(?:src|href)="\/(?!\/)/);
    }
  });

  it('绝对 URL（canonical / og / hreflang）不受重写影响', () => {
    expect(ja).toContain(`href="${SITE_URL}/ja/"`);
    expect(ja).toContain(`content="${SITE_URL}/og/ja.webp"`);
  });

  it('五个语种都能渲染且互不串味', () => {
    for (const l of LOCALES) {
      const html = renderPage(BASE_HTML, l.id);
      expect(html, l.id).toContain(`<html lang="${l.htmlLang}">`);
      expect(html, l.id).toContain(`<title>${localeMeta(l.id).title}</title>`);
    }
  });
});

describe('buildSitemap', () => {
  const xml = buildSitemap();

  it('列出五个 URL', () => {
    for (const l of LOCALES) {
      const href = l.id === 'zh-Hans' ? `${SITE_URL}/` : `${SITE_URL}/${l.id}/`;
      expect(xml, l.id).toContain(`<loc>${href}</loc>`);
    }
    expect((xml.match(/<url>/g) ?? []).length).toBe(LOCALES.length);
  });

  it('每个 URL 都带全套 xhtml:link 互指', () => {
    expect((xml.match(/xhtml:link/g) ?? []).length).toBe(LOCALES.length * (LOCALES.length + 1));
    expect(xml).toContain('hreflang="x-default"');
  });

  it('是合法的 XML 头与命名空间', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });
});
