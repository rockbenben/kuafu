// 为 og 卡片生成取字：把 Noto Serif 各语种版本裁到卡面实际用到的那几十个字。
//
// 为什么要自带字体：本机（及 CI）通常没有 Yu Mincho / Batang / Nanum Myeongjo，
// 直接用系统字体会让中英卡是衬线、日韩卡退化成黑体，五张卡不成套。裁完每份
// 只有几 KB，提交进仓库即可，og 生成从此不依赖任何机器上装了什么。
//
// 用法：npm run fonts   （文案改了才需要重跑）

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, SOCIAL } from './site-meta.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts', 'og');

// 各语种用其对应的 Noto Serif 版本，字形才对（简繁字形有别，日文汉字亦有别）
const FAMILY = {
  'zh-Hans': 'Noto Serif SC',
  'zh-Hant': 'Noto Serif TC',
  en: 'Noto Serif',
  ja: 'Noto Serif JP',
  ko: 'Noto Serif KR',
};

const CARD_FIELDS = ['cardTitle', 'cardSub', 'cardTagline', 'cardFooter'];

/**
 * 社交预览图用霞鹜文楷（楷体骨架），而非上面五张卡的 Noto Serif（宋体骨架）。
 *
 * 游戏内每一个字都是楷体（见 render/strings.ts 的 fontKai），题头引的又是
 * 《山海经》——宋体是印刷体的声音，楷体才是写下这些句子时的声音。社交预览图
 * 是整个仓库的门面，声音得对。TC 版同样带简化字码位（已核对 轮/阳/话/计/划/
 * 开/赖），而卡面这几个字简繁同形，不会串字形。
 */
export const SOCIAL_FAMILY = 'LXGW WenKai TC';

/** 该语种卡面用到的全部字符（去重、排序，保证可复现）。 */
export function charsetFor(meta) {
  const set = new Set();
  for (const f of CARD_FIELDS) for (const c of meta[f]) set.add(c);
  return [...set].sort().join('');
}

/** 社交预览图卡面用到的全部字符。 */
export function socialCharset() {
  const set = new Set();
  for (const v of Object.values(SOCIAL)) for (const c of v) set.add(c);
  return [...set].sort().join('');
}

async function fetchSubset(family, text) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}`;
  // 老 UA 让 Google 返回 truetype 而非 woff2——@napi-rs/canvas 只吃 ttf/otf
  const css = await fetch(url, { headers: { 'User-Agent': 'Mozilla/4.0' } }).then(r => {
    if (!r.ok) throw new Error(`${family}: CSS ${r.status}`);
    return r.text();
  });
  const m = css.match(/url\((https:\/\/[^)]+)\)\s*format\('truetype'\)/);
  if (!m) throw new Error(`${family}: CSS 里没找到 truetype 链接\n${css}`);
  const buf = await fetch(m[1]).then(r => {
    if (!r.ok) throw new Error(`${family}: 字体 ${r.status}`);
    return r.arrayBuffer();
  });
  return Buffer.from(buf);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const s of SITE) {
    const text = charsetFor(s);
    const buf = await fetchSubset(FAMILY[s.id], text);
    writeFileSync(join(OUT, `${s.id}.subset.ttf`), buf);
    total += buf.length;
    console.log(`  ${s.id.padEnd(8)} ${FAMILY[s.id].padEnd(14)} ${String(text.length).padStart(3)} 字  ${(buf.length / 1024).toFixed(1)} KB`);
  }
  const social = socialCharset();
  const buf = await fetchSubset(SOCIAL_FAMILY, social);
  writeFileSync(join(OUT, 'social.subset.ttf'), buf);
  total += buf.length;
  console.log(`  ${'social'.padEnd(8)} ${SOCIAL_FAMILY.padEnd(14)} ${String(social.length).padStart(3)} 字  ${(buf.length / 1024).toFixed(1)} KB`);

  writeFileSync(join(OUT, 'OFL.txt'), OFL, 'utf8');
  console.log(`  合计 ${(total / 1024).toFixed(1)} KB`);
}

const OFL = `本目录下的 *.subset.ttf 取自 Google Fonts，仅裁剪为卡面所需的字形，
未作其他修改。

五语种站点分享卡（zh-Hans / zh-Hant / en / ja / ko.subset.ttf）
  Noto Serif 家族 (Noto Serif / Noto Serif SC / TC / JP / KR)
  Copyright 2012-2023 The Noto Project Authors (https://github.com/notofonts)

GitHub 社交预览图（social.subset.ttf）
  LXGW WenKai TC / 霞鹜文楷
  Copyright 2021 The LXGW WenKai Project Authors (https://github.com/lxgw/LxgwWenKai)

两者均以 SIL Open Font License 1.1 授权，全文见：
https://scripts.sil.org/OFL

这些字体仅用于构建期生成分享卡图，不随游戏下发给浏览器。
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
