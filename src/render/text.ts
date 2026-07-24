// 画布文字排版助手。
//
// 游戏文字全部画在 960×576 的逻辑视口里、位置手调，原本每处 fillText 都不带
// maxWidth——中文够短所以看不出问题，换成英文/韩文就会冲出画面。这里提供两件事：
// 估宽（供无 canvas 的测试环境用）与自适应绘制。

/** 需要按全角（1 em）计算的码位区间：CJK 表意文字、假名、谚文、全角标点。 */
const FULL_WIDTH: [number, number][] = [
  [0x1100, 0x115f],   // 谚文字母
  [0x2e80, 0x303e],   // CJK 部首、汉字结构、CJK 标点
  [0x3041, 0x33ff],   // 假名、注音、兼容字符
  [0x3400, 0x4dbf],   // CJK 扩展 A
  [0x4e00, 0x9fff],   // CJK 基本区
  [0xa000, 0xa4cf],   // 彝文
  [0xac00, 0xd7a3],   // 谚文音节
  [0xf900, 0xfaff],   // CJK 兼容表意
  [0xfe30, 0xfe6f],   // CJK 兼容形式
  [0xff00, 0xff60],   // 全角 ASCII、全角标点
  [0xffe0, 0xffe6],   // 全角符号
];

function isFullWidth(cp: number): boolean {
  for (const [lo, hi] of FULL_WIDTH) if (cp >= lo && cp <= hi) return true;
  return false;
}

/**
 * 粗略估算绘制宽度：全角字符计 1 em，其余计 0.5 em。
 *
 * 这是**近似模型**，用来在无 canvas 的测试环境里挡住「英文比中文长三倍」
 * 这类回归，不能替代真实的 ctx.measureText——观感仍需人工过一遍。
 */
export function estWidth(text: string, px: number): number {
  let em = 0;
  for (const ch of text) em += isFullWidth(ch.codePointAt(0)!) ? 1 : 0.5;
  return em * px;
}

/**
 * 按宽度软换行。拉丁语系按空格断词（不切断单词，除非单词本身就超长），
 * CJK 无空格故逐字断行。
 */
export function wrapByWidth(text: string, px: number, maxWidth: number): string[] {
  if (estWidth(text, px) <= maxWidth) return [text];

  const lines: string[] = [];
  let line = '';

  // 行尾的分隔空白不该留下，否则重新拼接时会多出空格
  const flush = () => { const s = line.replace(/\s+$/, ''); if (s) lines.push(s); line = ''; };
  // 先按空格切成「词」，再对超宽的词逐字切
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    const candidate = line + word;
    if (estWidth(candidate, px) <= maxWidth) { line = candidate; continue; }

    // 放不下：先换行，再看这个词本身是否超宽
    if (/^\s+$/.test(word)) { flush(); continue; }
    flush();
    if (estWidth(word, px) <= maxWidth) { line = word; continue; }
    for (const ch of word) {
      if (estWidth(line + ch, px) > maxWidth) flush();
      line += ch;
    }
  }
  flush();
  return lines.length ? lines : [text];
}

/**
 * 自适应绘制：超宽先按比例降字号（下限 0.72×），仍超宽才退回 fillText 的
 * maxWidth 做横向压缩——那会让字变形，是最后手段。
 *
 * 返回实际使用的字号，供调用方据此排下一行。
 */
export function drawFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  basePx: number,
  family: string,
  minScale = 0.72,
): number {
  ctx.font = `${basePx}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w <= maxWidth) { ctx.fillText(text, x, y); return basePx; }

  const px = Math.max(basePx * minScale, basePx * (maxWidth / w));
  ctx.font = `${px}px ${family}`;
  // 降到下限仍不够时交给 maxWidth 压缩，宁可略扁也不出界
  ctx.fillText(text, x, y, maxWidth);
  return px;
}
