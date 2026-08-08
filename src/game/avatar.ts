import type { Store } from './storage';
import { ASSET_BASE } from '../render/assets';

/**
 * 自定义形象：玩家选一个内置预设、或传一张本地图片，四种姿态（跑/站/跳/冲）都用它。
 *
 * 尺寸必须归一到与美术素材同一口径（renderer 里的 SPRITE_CHAR_PX = 220，"头到脚"
 * 高度），否则同一份 scale 算出来的角色忽大忽小。宽度不限——原素材的杖与发本来
 * 就往画布外自由延伸，renderer 是按高度定标、居中贴地画的。
 *
 * store.avatar 一个字段存两种东西，靠前缀分辨：
 *   `preset:kuafu`      → 内置预设，只存 id，图走 URL
 *   `data:image/webp;…` → 玩家自己传的，缩放后落盘
 */
export const AVATAR_H = 220;

/** 宽高比过于夸张的图（长条幅、全景）按高缩放会宽到糊住半屏，横向再收一道。 */
const MAX_W = 340;

const PRESET_PREFIX = 'preset:';

/**
 * 内置预设。前五个是写实剪影（与内置美术同一语言：连续曲线轮廓 + 发丝/飘带分缕），
 * cat 是彩色卡通的样例，用来告诉玩家「传彩色图也行」。
 *
 * 刻意避开金乌与旱魃——那两个就是 enemy-flyer 与 enemy-walker，
 * 放进来玩家会分不清自己和追杀自己的怪。
 */
export const PRESETS = ['yutu', 'yinglong', 'xingtian', 'houyi', 'feitian', 'cat'] as const;
export type PresetId = (typeof PRESETS)[number];

export function presetUrl(id: string): string {
  return `${ASSET_BASE}assets/sprites/preset-${id}.svg`;
}

/** 按"高归一到 AVATAR_H"缩放；过宽的再整体缩到 MAX_W 以内。纯函数，便于验算。 */
export function fitSize(w: number, h: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const k = AVATAR_H / h;
  const scale = w * k > MAX_W ? MAX_W / w : k;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function decode(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 当前选中的是哪一个：预设返回其 id，自传图返回 'custom'，没设过返回 ''。 */
export function currentAvatarId(store: Store): string {
  const v = store.avatar;
  if (!v) return '';
  return v.startsWith(PRESET_PREFIX) ? v.slice(PRESET_PREFIX.length) : 'custom';
}

/** 读回已存的形象；没存过或数据坏了都返回 null（调用方退回内置素材）。 */
export async function loadAvatar(store: Store): Promise<HTMLImageElement | null> {
  const v = store.avatar;
  if (!v) return null;
  if (v.startsWith(PRESET_PREFIX)) {
    const id = v.slice(PRESET_PREFIX.length);
    // 认不出的 id（改过预设表、或存档被人手改过）当没设过处理，别让页面卡在破图上
    return (PRESETS as readonly string[]).includes(id) ? decode(presetUrl(id)) : null;
  }
  return decode(v);
}

/** 选一个内置预设。只存 id，不存图——预设是随包发的，没必要往 localStorage 里塞副本。 */
export async function selectPreset(store: Store, id: string): Promise<HTMLImageElement | null> {
  if (!(PRESETS as readonly string[]).includes(id)) return null;
  const img = await decode(presetUrl(id));
  if (img) store.avatar = PRESET_PREFIX + id;
  return img;
}

/**
 * 存一张新形象：解码 → 按 fitSize 缩放 → webp 落盘。
 * 失败（非图片、解码失败、localStorage 满）一律返回 null，不抛——换形象失败
 * 不该打断游戏，退回内置素材即可。
 */
export async function saveAvatar(store: Store, file: File): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(file);
  const raw = await decode(url);
  URL.revokeObjectURL(url); // 解码成败都要放，否则每次换形象泄一份 blob
  if (!raw) return null;

  const { w, h } = fitSize(raw.naturalWidth || raw.width, raw.naturalHeight || raw.height);
  if (!w || !h) return null;

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(raw, 0, 0, w, h);

  // webp 保留透明通道（剪影/去背立绘的关键）；浏览器不认时会自动落回 png
  const dataUrl = cv.toDataURL('image/webp', 0.85);
  store.avatar = dataUrl;
  return store.avatar ? decode(dataUrl) : null; // 写盘失败（配额满）时 avatar 为空
}

export function clearAvatar(store: Store) {
  store.avatar = '';
}
