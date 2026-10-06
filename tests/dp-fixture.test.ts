import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDp, DP_SCREENS, silenceStoreWrites } from '../src/dev/dp';
import { Store } from '../src/game/storage';

const src = (p: string) =>
  readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/** 取景口的参数契约。夹具自己的 bug 只有打开浏览器才看得见，但它先要能被单测钉住。 */
describe('取景夹具的参数解析', () => {
  const q = (s: string) => parseDp(new URLSearchParams(s));

  it('白名单里的每个屏名都必须认（反向对照：解析器坏了不会只返回 null）', () => {
    for (const s of DP_SCREENS) {
      const spec = q(`dp=${s}`);
      expect(spec, `dp=${s} 应当可用`).not.toBeNull();
      expect(spec!.screen).toBe(s);
    }
  });

  it('屏名不在白名单 → 整个夹具不启用，玩家不会被打错字丢进白屏', () => {
    expect(q('dp=nope')).toBeNull();
    expect(q('dp=titlex')).toBeNull();
    expect(q('dp=')).toBeNull();
    expect(q('lang=ja')).toBeNull();
  });

  it('数值参数：没给=默认、给 0=0、空串按没给（Number(null)===0 不算 NaN）', () => {
    expect(q('dp=play')!.charge).toBe(45);     // 没给 → 产品侧默认档
    expect(q('dp=play&charge=0')!.charge).toBe(0);
    expect(q('dp=play&charge=')!.charge).toBe(45);
    expect(q('dp=play&combo=0')!.combo).toBe(0);
    expect(q('dp=play&dist=')!.dist).toBe(300);
    // danger 的「没给」与「给了 0」是两种画面：前者长夜离得远，后者贴脸告警
    expect(q('dp=play')!.danger).toBeNull();
    expect(q('dp=play&danger=0')!.danger).toBe(0);
  });

  it('越界数值夹到区间端点，坏值报进 warnings 而不是静默变 NaN', () => {
    const warn: string[] = [];
    const spec = parseDp(new URLSearchParams('dp=play&dist=99999&charge=-5&nar=abc'), warn);
    expect(spec!.dist).toBe(9000);
    expect(spec!.charge).toBe(0);
    expect(spec!.nar).toBe(0);
    expect(warn.join('｜')).toMatch(/nar=abc/);
  });

  it('屏名之外的枚举同样走白名单：mode/cause/board/hint', () => {
    expect(q('dp=dead&cause=fall')!.cause).toBe('fall');
    expect(q('dp=dead&cause=explode')!.cause).toBe('spike');
    expect(q('dp=dead&board=pending')!.board).toBe('pending');
    expect(q('dp=play&hint=kill')!.hint).toBe('kill');
    expect(q('dp=play&hint=off')!.hint).toBe('off');
    expect(q('dp=play&hint=nonsense')!.hint).toBe('auto');
    expect(q('dp=title&mode=daily')!.mode).toBe('daily');
  });

  it('默认参数必须与产品默认一致：非触屏、无尽、未静音', () => {
    const s = q('dp=title')!;
    expect(s.coarse).toBe(false);
    expect(s.mode).toBe('endless');
    expect(s.muted).toBe(false);
    expect(s.avOpen).toBe(false);
  });
});

describe('取景夹具不写用户存档', () => {
  it('所有存档字段读得到、写不下去', () => {
    const mem: Record<string, string> = {};
    const backing = {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
    };
    const store = new Store(backing);
    silenceStoreWrites(store);
    const before = JSON.stringify(mem);
    store.best = 9999;
    store.lang = 'ja';
    store.langPinned = true;
    store.nickname = '取证';
    store.seenNar = 7;
    store.muted = true;
    expect(JSON.stringify(mem), '夹具态一个字节都不该落盘').toBe(before);
  });

  it('反向对照：没装夹具时同样的写入确实会落盘', () => {
    const mem: Record<string, string> = {};
    const store = new Store({
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
    });
    store.best = 9999;
    expect(mem['cl.best']).toBe('9999');
  });
});

/**
 * 生产包里不许出现夹具。构建后的机器闸在 `scripts/check-dp.mjs`（挂在 build 之后，
 * 本地与 CI 每次构建都过），这里钉的是它据以成立的那条源码契约。
 */
describe('生产构建里取景夹具必须整个消失', () => {
  const entry = src('../src/main.ts');

  it('main.ts 里夹具只在 DEV 闸门之后动态引入', () => {
    expect(entry).toMatch(/if \(import\.meta\.env\.DEV\) \{/);
    expect(entry).toMatch(/await import\('\.\/dev\/dp'\)/);
    // 静态 import 会让夹具进生产包（tree-shaking 救不了带副作用的模块）
    expect(entry).not.toMatch(/^import .*from '\.\/dev\/dp'/m);
  });

  it('构建闸的标记既是夹具源码里真出现的串，也在闸脚本里列着', () => {
    const dp = src('../src/dev/dp.ts');
    const gate = src('../scripts/check-dp.mjs');
    const MARKERS = ['SunrunnerX', '不是数，按默认', 'silenceStoreWrites'];
    for (const m of MARKERS) {
      expect(dp, `夹具里应当真有 ${m}`).toContain(m);
      expect(gate, `构建闸应当盯着 ${m}`).toContain(m);
    }
  });
});

