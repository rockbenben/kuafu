import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fitSize, AVATAR_H, PRESETS, presetUrl, currentAvatarId, loadAvatar, selectPreset } from '../src/game/avatar';
import { Store } from '../src/game/storage';

describe('fitSize', () => {
  it('常规比例按高归一到 AVATAR_H——renderer 按高度定标，高不齐角色就忽大忽小', () => {
    expect(fitSize(110, 220)).toEqual({ w: 110, h: 220 });
    expect(fitSize(400, 800)).toEqual({ w: 110, h: 220 });
    expect(fitSize(50, 100).h).toBe(AVATAR_H);
  });

  it('方图也照高归一', () => {
    expect(fitSize(512, 512)).toEqual({ w: 220, h: 220 });
  });

  it('长条幅按高缩会宽到糊住半屏，改为限宽', () => {
    const r = fitSize(2000, 200); // 10:1
    expect(r.w).toBeLessThanOrEqual(440);
    expect(r.h).toBeLessThan(AVATAR_H); // 让位给限宽，高必然低于归一值
    expect(r.w / r.h).toBeCloseTo(10, 1); // 但比例不许变形
  });

  it('极端瘦高图不会被压成 0 像素', () => {
    const r = fitSize(1, 4000);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBe(AVATAR_H);
  });

  it('非法尺寸返回 0，调用方据此放弃', () => {
    expect(fitSize(0, 100)).toEqual({ w: 0, h: 0 });
    expect(fitSize(100, 0)).toEqual({ w: 0, h: 0 });
  });
});

describe('Store.avatar', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
    };
  };

  it('存取往返', () => {
    const s = new Store(mem());
    expect(s.avatar).toBe('');
    s.avatar = 'data:image/webp;base64,AAA';
    expect(s.avatar).toBe('data:image/webp;base64,AAA');
  });

  it('置空即清除——「还原形象」靠它，留着空串会被当成有形象', () => {
    const s = new Store(mem());
    s.avatar = 'data:image/webp;base64,AAA';
    s.avatar = '';
    expect(s.avatar).toBe('');
  });
});

describe('预设形象', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
    };
  };

  it('每个 id 都有对应的 SVG 文件——改了列表忘了放图，线上只会静默变回内置素材', () => {
    const missing = PRESETS.filter(id => !existsSync(`public/assets/sprites/preset-${id}.svg`));
    expect(missing, `缺图: ${missing.join(', ')}`).toEqual([]);
  });

  it('presetUrl 落在 sprites 目录下', () => {
    expect(presetUrl('kuafu')).toMatch(/assets\/sprites\/preset-kuafu\.svg$/);
  });

  it('currentAvatarId 分得清预设 / 自传图 / 没设过——一排圆的高亮全靠它', () => {
    const s = new Store(mem());
    expect(currentAvatarId(s)).toBe('');
    s.avatar = 'preset:yutu';
    expect(currentAvatarId(s)).toBe('yutu');
    s.avatar = 'data:image/webp;base64,AAA';
    expect(currentAvatarId(s)).toBe('custom');
  });

  it('认不出的预设 id 当没设过处理，不让页面卡在破图上', async () => {
    const s = new Store(mem());
    s.avatar = 'preset:nosuchthing';
    await expect(loadAvatar(s)).resolves.toBeNull();
  });

  it('selectPreset 拒绝未知 id，且不写脏数据进存档', async () => {
    const s = new Store(mem());
    await expect(selectPreset(s, 'nosuchthing')).resolves.toBeNull();
    expect(s.avatar).toBe('');
  });
});
