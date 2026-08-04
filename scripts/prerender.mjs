// 构建后预渲染：为每个语种产出一份带本地化 <head> 与 hreflang 互指的 HTML。
//
// 单页 canvas 游戏在客户端切语言，搜索引擎是看不见的——它只读首屏 HTML。
// 故这里把语种烘进静态产物：/ 是简体（canonical），/en/ /ja/ /ko/ /zh-Hant/
// 各自成页。renderPage 是纯函数，测试直接调用，不必真的跑构建。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, SITE_URL, DEFAULT_ID, localePath, localeUrl, localeMeta } from './site-meta.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** 把 <head> 里某个 meta 的 content 换掉；标签不存在则原样返回。 */
function setMeta(html, attr, name, value) {
  const re = new RegExp(`(<meta\\s+${attr}=["']${name}["']\\s+content=["'])[^"']*(["'])`, 'i');
  return html.replace(re, `$1${esc(value)}$2`);
}

/** 生成 5 条 hreflang + 一条 x-default。x-default 指向根，即默认语种。 */
function hreflangLinks() {
  const rows = SITE.map(
    s => `  <link rel="alternate" hreflang="${s.htmlLang}" href="${localeUrl(s.id)}" />`,
  );
  rows.push(`  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`);
  return rows.join('\n');
}

/**
 * 该语种页面相对于站点根的深度前缀。根页 './'，语种子页 '../'。
 *
 * 这是**唯一**的深度真源：HTML 里的 src/href 由 reroot 按它重写，JS 运行时
 * 拼资源用的 __ASSET_BASE__ 也由它注入。两者必须同源——此前 reroot 硬编码
 * '../' 而 assetPrefix 另算一份，日后站点再嵌一层（如 /docs/ja/）只改一处
 * 就会让两套路径分叉，重新制造那个被 loadOne 静默吞掉的 404。
 */
export function assetPrefix(id) {
  return id === DEFAULT_ID ? './' : '../';
}

/**
 * 把 HTML 里的相对资源路径改写到给定深度。
 *
 * base 保持 './' 是因为同一份产物既挂在根域（EdgeOne）也挂在子路径
 * （GitHub Pages 的 rockbenben.github.io/kuafu/），绝对路径会让后者整站 404。
 * 但 './assets/x.js' 在 /en/index.html 下会解析成 /en/assets/x.js——同样 404。
 */
function reroot(html, prefix) {
  return html
    .replace(/(\s(?:src|href)=")\.\//g, `$1${prefix}`)
    .replace(/(\s(?:src|href)=")(?!https?:|\/\/|\.\.?\/|data:|#)(assets\/)/g, `$1${prefix}$2`);
}

/**
 * 把构建产物的 HTML 改写为某语种的页面。
 * @param {string} html 构建出的 dist/index.html
 * @param {string} id   语种 id
 */
export function renderPage(html, id) {
  const m = localeMeta(id);
  const prefix = assetPrefix(id);
  let out = reroot(html, prefix);

  out = out.replace(/<html\s+lang=["'][^"']*["']/i, `<html lang="${m.htmlLang}"`);
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`);
  out = setMeta(out, 'name', 'description', m.description);
  out = setMeta(out, 'property', 'og:title', m.ogTitle);
  out = setMeta(out, 'property', 'og:description', m.ogDescription);
  out = setMeta(out, 'property', 'og:url', localeUrl(id));
  out = setMeta(out, 'property', 'og:image', `${SITE_URL}/og/${id}.jpg`);
  out = setMeta(out, 'name', 'twitter:image', `${SITE_URL}/og/${id}.jpg`);

  // 追加：og:locale、twitter 文案、canonical、hreflang
  const extra = [
    `  <meta property="og:locale" content="${m.ogLocale}" />`,
    `  <meta name="twitter:title" content="${esc(m.ogTitle)}" />`,
    `  <meta name="twitter:description" content="${esc(m.ogDescription)}" />`,
    `  <link rel="canonical" href="${localeUrl(id)}" />`,
    hreflangLinks(),
  ].join('\n');

  // 非默认语种要注入两件事：
  //  1) __LANG__：路径语种，交给 pickLocale。根路径不注入——它是默认页而非
  //     用户的显式意图，注入会盖过用户存过的偏好。
  //  2) __ASSET_BASE__：资源深度前缀。美术资源是 assets.ts 在**运行时**拼出的
  //     URL，reroot() 只改 HTML 属性够不着；不注入的话 './assets/x.png' 在
  //     /ja/ 下会解析成 /ja/assets/x.png 而 404，且 loadOne 吞掉 onerror，
  //     页面只会静默退化成占位矢量图。与 reroot 共用 assetPrefix 这一个真源。
  const inject = id === DEFAULT_ID
    ? ''
    : `\n  <script>window.__LANG__="${id}";window.__ASSET_BASE__="${prefix}"</script>`;

  return out.replace(/<\/head>/i, `${extra}${inject}\n</head>`);
}

/** sitemap：5 个 URL，各带全套 xhtml:link 互指。 */
export function buildSitemap() {
  const alts = SITE.map(
    s => `      <xhtml:link rel="alternate" hreflang="${s.htmlLang}" href="${localeUrl(s.id)}" />`,
  ).concat(`      <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`).join('\n');

  const urls = SITE.map(s => `  <url>
    <loc>${localeUrl(s.id)}</loc>
${alts}
    <changefreq>weekly</changefreq>
    <priority>${s.id === DEFAULT_ID ? '1.0' : '0.8'}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function main() {
  const base = readFileSync(join(DIST, 'index.html'), 'utf8');
  for (const s of SITE) {
    const html = renderPage(base, s.id);
    const path = localePath(s.id);
    const dir = path === '/' ? DIST : join(DIST, s.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    console.log(`  ${path.padEnd(11)} ${s.htmlLang}`);
  }
  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(), 'utf8');
  console.log(`  /sitemap.xml  ${SITE.length} 条`);
}

// 仅在直接执行时跑，被测试导入时不跑
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
