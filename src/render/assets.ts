export interface Assets {
  playerRun: HTMLImageElement | null;
  playerRunFrames: HTMLImageElement[]; // 奔跑循环帧（若存在则优先于 playerRun 播放动画）
  playerIdle: HTMLImageElement | null;  // 站立姿（不移动时）
  playerJump: HTMLImageElement | null;
  playerDash: HTMLImageElement | null;
  enemyWalker: HTMLImageElement | null;
  enemyFlyerUp: HTMLImageElement | null;
  enemyFlyerDown: HTMLImageElement | null;
  bgFar: HTMLImageElement | null;
  bgMid: HTMLImageElement | null;
  bgNear: HTMLImageElement | null;
  titleArt: HTMLImageElement | null;
  endingArts: HTMLImageElement[]; // 死亡结局图（弃杖化邓林，多种，随机选一）
  phaseBg: Record<string, (HTMLImageElement | null)[]>; // 旅程六段各自的 [far,mid,near] 背景层
  props: Record<string, HTMLImageElement>;              // 前景装饰道具剪影（按名索引，缺失即无）
}

// 旅程六段（与 theme.ts JOURNEY 对齐）
export const PHASE_KEYS = ['dawn', 'blaze', 'river', 'lake', 'parch', 'peach'] as const;

// 各段适配的前景道具（景随事迁，前景装饰按段落切换）
export const PROP_BIOMES: Record<string, string[]> = {
  dawn: ['dead-tree-1', 'pine-1', 'pine-2', 'grass-1', 'grass-2', 'boulder-1'],
  blaze: ['dead-tree-2', 'dead-tree-3', 'boulder-2', 'spire-1', 'shrub-1'],
  river: ['willow-1', 'reed-1', 'reed-2', 'boulder-1', 'grass-1'],
  lake: ['cattail-1', 'reed-1', 'reed-2', 'crane-1', 'grass-2'],
  parch: ['ox-skull-1', 'bones-1', 'shrub-1', 'spire-1', 'stele-1', 'cairn-1'],
  peach: ['peach-1', 'peach-2', 'lantern-1', 'pavilion-1', 'crane-1'],
};

const PROP_NAMES = [...new Set(Object.values(PROP_BIOMES).flat())];

export const EMPTY_ASSETS: Assets = {
  playerRun: null,
  playerRunFrames: [],
  playerIdle: null,
  playerJump: null,
  playerDash: null,
  enemyWalker: null,
  enemyFlyerUp: null,
  enemyFlyerDown: null,
  bgFar: null,
  bgMid: null,
  bgNear: null,
  titleArt: null,
  endingArts: [],
  phaseBg: {},
  props: {},
};

type SingleKey = Exclude<keyof Assets, 'playerRunFrames' | 'endingArts' | 'phaseBg' | 'props'>;

// 全部美术资源为**无损** WebP（由 PNG 转来，不透明像素与 alpha 逐位一致，体积减半）。
// 无损而非 q88：两者体积几乎相同，但无损免去逐张肉眼验画质这件事。
const PATHS: Record<SingleKey, string> = {
  playerRun: 'assets/sprites/player-run.webp',
  playerIdle: 'assets/sprites/player-idle.webp',
  playerJump: 'assets/sprites/player-jump.webp',
  playerDash: 'assets/sprites/player-dash.webp',
  enemyWalker: 'assets/sprites/enemy-walker.webp',
  enemyFlyerUp: 'assets/sprites/enemy-flyer-up.webp',
  enemyFlyerDown: 'assets/sprites/enemy-flyer-down.webp',
  bgFar: 'assets/bg/bg-far.webp',
  bgMid: 'assets/bg/bg-mid.webp',
  bgNear: 'assets/bg/bg-near.webp',
  titleArt: 'assets/title-art.webp',
};

const MAX_RUN_FRAMES = 8;
const MAX_ENDINGS = 10; // ending-art.webp + ending-art-2..10（连续无缺口，避免多余 404）

/**
 * 美术资源的基址。
 *
 * 不能直接用 import.meta.env.BASE_URL：base 为相对路径时它被编译成字面量
 * './'，在预渲染出的 /ja/ 等子页上会解析成 /ja/assets/... 而**全部 404**；
 * 而 loadOne 吞掉 onerror，页面只会静默退化成占位矢量图，不报任何错。
 * 子页由 scripts/prerender.mjs 注入正确的深度前缀（与 HTML 重写同一个真源）。
 */
export const ASSET_BASE =
  (globalThis as { __ASSET_BASE__?: string }).__ASSET_BASE__ ?? import.meta.env.BASE_URL;

function loadOne(path: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${ASSET_BASE}${path}`;
  });
}

const PHASE_LAYERS = ['far', 'mid', 'near'] as const;
const phaseBgPaths = (p: string) => PHASE_LAYERS.map(l => `assets/bg/bg-${p}-${l}.webp`);
const propPath = (n: string) => `assets/props/prop-${n}.webp`;

/** 首屏批里就要到齐的那一段旅程（PHASE_KEYS[0]，玩家开局即身处此段）。 */
const FIRST_PHASE = PHASE_KEYS[0];

/**
 * 首屏批。**只加载「能进标题页、能跑完第一段」所需的那些**——约 0.6 MB。
 *
 * 此前这里是一个 Promise.all 吞下全部 5.3 MB（含十张只在死亡时用一张的结局图、
 * 五段几分钟后才走到的背景），main.ts 的 `await loadAssets()` 顶在最前面，于是
 * 玩家要盯着空白页等全部下完。实测本机（无限带宽）都要 2.0 秒，4G 上是 5 秒起。
 *
 * 剩下的由 loadRest 在此之后自行续传，**不 await**：它直接改写同一个 Assets 对象，
 * 而 main.ts 与 Renderer 持有的正是这个引用（main.ts 换形象时本来就在原地改它），
 * 所以调用方一行都不用动。未到货的部分渲染层本就按 null / 缺键优雅退化。
 */
export async function loadAssets(): Promise<Assets> {
  const keys = Object.keys(PATHS) as SingleKey[];
  const runPaths = Array.from({ length: MAX_RUN_FRAMES }, (_, i) => `assets/sprites/player-run-${i}.webp`);

  const [singles, runFrames, firstBg, firstProps] = await Promise.all([
    Promise.all(keys.map(k => loadOne(PATHS[k]))),
    Promise.all(runPaths.map(loadOne)),
    Promise.all(phaseBgPaths(FIRST_PHASE).map(loadOne)),
    Promise.all(PROP_BIOMES[FIRST_PHASE].map(n => loadOne(propPath(n)))),
  ]);

  const out: Assets = { ...EMPTY_ASSETS, playerRunFrames: [], phaseBg: {}, props: {} };
  keys.forEach((k, i) => { out[k] = singles[i]; });
  // 未到货的段落先占好 null 位：渲染层按「该段无图」回退到基础 bg，不会读到 undefined
  PHASE_KEYS.forEach(p => { out.phaseBg[p] = [null, null, null]; });
  out.phaseBg[FIRST_PHASE] = firstBg;
  PROP_BIOMES[FIRST_PHASE].forEach((n, i) => { const img = firstProps[i]; if (img) out.props[n] = img; });

  // 奔跑帧：帧号必须连续，遇第一个缺失即停
  const frames: HTMLImageElement[] = [];
  for (const img of runFrames) {
    if (!img) break;
    frames.push(img);
  }
  out.playerRunFrames = frames;

  void loadRest(out);
  return out;
}

/**
 * 续传批：玩家已经在标题页上了，剩下的边玩边到。
 *
 * 分三批**顺序**发，而不是一把 Promise.all——请求的创建顺序就是浏览器的下载优先级，
 * 而这三批被需要的时刻先后分明：
 *   1. 结局图——任何一次死亡都要用，而开局二十秒内死是最常见的一局；
 *   2. 其余五段背景——按旅程顺序，玩家是顺着走过去的；
 *   3. 其余道具——纯装饰，缺了只是少几棵树。
 */
async function loadRest(out: Assets) {
  const endingPaths = ['assets/ending-art.webp'];
  for (let i = 2; i <= MAX_ENDINGS; i++) endingPaths.push(`assets/ending-art-${i}.webp`);
  const endings = await Promise.all(endingPaths.map(loadOne));
  out.endingArts = endings.filter((img): img is HTMLImageElement => img !== null);

  const rest = PHASE_KEYS.filter(p => p !== FIRST_PHASE);
  const bgs = await Promise.all(rest.map(p => Promise.all(phaseBgPaths(p).map(loadOne))));
  rest.forEach((p, i) => { out.phaseBg[p] = bgs[i]; });

  const restProps = PROP_NAMES.filter(n => !PROP_BIOMES[FIRST_PHASE].includes(n));
  const propImgs = await Promise.all(restProps.map(n => loadOne(propPath(n))));
  restProps.forEach((n, i) => { const img = propImgs[i]; if (img) out.props[n] = img; });
}
