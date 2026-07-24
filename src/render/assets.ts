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

const PATHS: Record<SingleKey, string> = {
  playerRun: 'assets/sprites/player-run.png',
  playerIdle: 'assets/sprites/player-idle.png',
  playerJump: 'assets/sprites/player-jump.png',
  playerDash: 'assets/sprites/player-dash.png',
  enemyWalker: 'assets/sprites/enemy-walker.png',
  enemyFlyerUp: 'assets/sprites/enemy-flyer-up.png',
  enemyFlyerDown: 'assets/sprites/enemy-flyer-down.png',
  bgFar: 'assets/bg/bg-far.png',
  bgMid: 'assets/bg/bg-mid.png',
  bgNear: 'assets/bg/bg-near.png',
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

export async function loadAssets(): Promise<Assets> {
  const keys = Object.keys(PATHS) as SingleKey[];
  const runPaths = Array.from({ length: MAX_RUN_FRAMES }, (_, i) => `assets/sprites/player-run-${i}.png`);
  const endingPaths = ['assets/ending-art.webp'];
  for (let i = 2; i <= MAX_ENDINGS; i++) endingPaths.push(`assets/ending-art-${i}.webp`);
  // 六段旅程背景层：每段 far/mid/near
  const phaseLayers = ['far', 'mid', 'near'] as const;
  const phaseBgPaths = PHASE_KEYS.flatMap(p => phaseLayers.map(l => `assets/bg/bg-${p}-${l}.png`));
  const propPaths = PROP_NAMES.map(n => `assets/props/prop-${n}.png`);

  // 一次并行加载全部（单图 + 奔跑帧 + 结局图 + 段落背景 + 道具）
  const [singles, runFrames, endings, phaseBgImgs, propImgs] = await Promise.all([
    Promise.all(keys.map(k => loadOne(PATHS[k]))),
    Promise.all(runPaths.map(loadOne)),
    Promise.all(endingPaths.map(loadOne)),
    Promise.all(phaseBgPaths.map(loadOne)),
    Promise.all(propPaths.map(loadOne)),
  ]);

  const out: Assets = { ...EMPTY_ASSETS, playerRunFrames: [], phaseBg: {}, props: {} };
  keys.forEach((k, i) => { out[k] = singles[i]; });

  // 奔跑帧：帧号必须连续，遇第一个缺失即停
  const frames: HTMLImageElement[] = [];
  for (const img of runFrames) {
    if (!img) break;
    frames.push(img);
  }
  out.playerRunFrames = frames;
  out.endingArts = endings.filter((img): img is HTMLImageElement => img !== null);

  // 段落背景：每段收 3 层（缺失为 null，渲染层回退到基础 bg）
  PHASE_KEYS.forEach((p, pi) => {
    out.phaseBg[p] = [phaseBgImgs[pi * 3], phaseBgImgs[pi * 3 + 1], phaseBgImgs[pi * 3 + 2]];
  });
  // 道具：仅收录成功加载者
  PROP_NAMES.forEach((n, i) => { const img = propImgs[i]; if (img) out.props[n] = img; });

  return out;
}
