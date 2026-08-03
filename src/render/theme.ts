export interface Theme {
  skyTop: [number, number, number];
  skyBottom: [number, number, number];
  fog: [number, number, number];
  glow: [number, number, number];
  water: number; // 0..1 河渭/大泽水景显现程度
  peach: number; // 0..1 邓林桃林显现程度
  heat: number;  // 0..1 灼日热浪强度（入日段）
  night: number; // 0..1 夜色/星野显现程度（终章之后的月夜与大荒）
}

// 夸父逐日·一路景随事迁：场景随古籍叙事单向推进。
// 0~2000《海外北经》主脉；此后为《大荒北经》《列子》陶潜等更深记载对应的
// 月夜、大荒长夜、曦光重临（逐日永不休），越过终章停驻于重临之曦。
// 每个路标的距离与 game.ts MILESTONES 呼应，故事一出，天地即变。
interface Phase extends Theme { d: number }
const JOURNEY: Phase[] = [
  // 0 夸父与日逐走 —— 拂晓启程：晨曦微明，紫青转暖金
  { d: 0, skyTop: [66, 60, 92], skyBottom: [235, 158, 102], fog: [120, 92, 104], glow: [255, 226, 182], water: 0.1, peach: 0, heat: 0.1, night: 0 },
  // 1 入日，渴欲得饮 —— 灼日当空：白金烈日、热浪蒸腾
  { d: 250, skyTop: [104, 62, 44], skyBottom: [246, 176, 86], fog: [150, 86, 58], glow: [255, 246, 206], water: 0, peach: 0, heat: 1, night: 0 },
  // 2 饮于河、渭 —— 河光泛蓝：暖意稍退，大河映天
  { d: 550, skyTop: [78, 66, 72], skyBottom: [214, 152, 108], fog: [98, 100, 110], glow: [255, 232, 178], water: 0.75, peach: 0, heat: 0.4, night: 0 },
  // 3 北饮大泽 —— 浩渺大泽：琥珀天光、水面无垠
  { d: 900, skyTop: [70, 50, 56], skyBottom: [222, 142, 84], fog: [112, 92, 86], glow: [255, 216, 150], water: 1, peach: 0, heat: 0.5, night: 0 },
  // 4 未至，道渴而死 —— 赤地残阳：血色暮天、水尽土裂
  { d: 1400, skyTop: [42, 24, 36], skyBottom: [158, 60, 48], fog: [94, 44, 46], glow: [255, 190, 118], water: 0.08, peach: 0, heat: 0.75, night: 0 },
  // 5 弃其杖，化为邓林 —— 桃霞暮天：万木成林、落英缤纷
  { d: 2000, skyTop: [48, 32, 54], skyBottom: [208, 112, 130], fog: [122, 72, 94], glow: [255, 198, 206], water: 0, peach: 1, heat: 0.2, night: 0 },
  // 6 邓林月夜 —— 深靛夜天，冷月映桃，星子初现（大荒北经异记）
  { d: 2700, skyTop: [24, 18, 40], skyBottom: [64, 40, 64], fog: [54, 40, 60], glow: [156, 172, 214], water: 0, peach: 0.8, heat: 0, night: 0.7 },
  // 7 大荒长夜 —— 近墨星野，寒芒微茫（成都载天、珥蛇之荒）
  { d: 4200, skyTop: [10, 10, 22], skyBottom: [26, 24, 50], fog: [28, 28, 48], glow: [140, 158, 205], water: 0, peach: 0.1, heat: 0, night: 1 },
  // 8 曦光重临 —— 天光再启，逐日永不休（功竟在身后）
  { d: 5800, skyTop: [60, 54, 86], skyBottom: [226, 152, 102], fog: [116, 90, 102], glow: [255, 224, 182], water: 0.1, peach: 0, heat: 0.1, night: 0.15 },
];

// 每个旅程段落所用的背景/道具美术键（缺新图则复用既有六套）：
// 月夜→桃、长夜→焦土、重临→拂晓，故无需新素材即可景随事迁。
export const PHASE_ART = ['dawn', 'blaze', 'river', 'lake', 'parch', 'peach', 'peach', 'parch', 'dawn'] as const;

/**
 * 世界坐标 → 0~1 的确定性伪随机（地形裂纹、桃林、道具的散布都靠它）。
 *
 * 必须先异或再乘：裸的 `x * 2654435761` 在等距采样下（裂纹每 72px 取一次、
 * 桃树每 190px 取一次）退化成等差数列——"随机"偏移于是整齐地一格格递进，
 * 1920 以上的屏幕上一眼就看出是复读的纹样，而不是干裂的地。异或黄金比常数
 * 再 imul 打散了这层线性关系。
 */
export const posHash = (n: number) => (Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number];
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 旅程段落定位：返回所处段索引 i 与向下一段推进的插值 t(0..1)；
// 越过终章停驻末段（曦光重临）。供背景/道具按段选美术并在过渡区交叉淡入。
export function journeyPhase(distanceM: number): { i: number; t: number } {
  let i = 0;
  while (i < JOURNEY.length - 1 && distanceM >= JOURNEY[i + 1].d) i++;
  const a = JOURNEY[i];
  const b = JOURNEY[Math.min(i + 1, JOURNEY.length - 1)];
  const span = b.d - a.d;
  const t = span > 0 ? Math.max(0, Math.min(1, (distanceM - a.d) / span)) : 0;
  return { i, t };
}

export function themeAt(distanceM: number): Theme {
  const { i, t } = journeyPhase(distanceM);
  const a = JOURNEY[i];
  const b = JOURNEY[Math.min(i + 1, JOURNEY.length - 1)];
  return {
    skyTop: lerp3(a.skyTop, b.skyTop, t),
    skyBottom: lerp3(a.skyBottom, b.skyBottom, t),
    fog: lerp3(a.fog, b.fog, t),
    glow: lerp3(a.glow, b.glow, t),
    water: lerp(a.water, b.water, t),
    peach: lerp(a.peach, b.peach, t),
    heat: lerp(a.heat, b.heat, t),
    night: lerp(a.night, b.night, t),
  };
}

export function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
