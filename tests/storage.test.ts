import { describe, it, expect } from 'vitest';
import { Store } from '../src/game/storage';

function memBacking(seed: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(seed));
  return {
    map: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('Store', () => {
  it('读写 best/nickname/muted', () => {
    const s = new Store(memBacking());
    expect(s.best).toBe(0);
    s.best = 1234;
    expect(s.best).toBe(1234);
    s.nickname = '影子';
    expect(s.nickname).toBe('影子');
    s.muted = true;
    expect(s.muted).toBe(true);
  });
  it('backing 抛异常时返回默认值不崩溃', () => {
    const s = new Store({
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(s.best).toBe(0);
    expect(() => { s.best = 1; }).not.toThrow();
  });
});

describe('Store.lang', () => {
  it('无偏好时返回 null（好让上层去问浏览器语言）', () => {
    expect(new Store(memBacking()).lang).toBeNull();
  });

  it('读写 lang', () => {
    const b = memBacking();
    const s = new Store(b);
    s.lang = 'ja';
    expect(s.lang).toBe('ja');
    expect(b.map.get('cl.lang')).toBe('ja');
  });

  it('旧 cl.script=hant 迁移为 zh-Hant 并清除旧键', () => {
    const b = memBacking({ 'cl.script': 'hant' });
    const s = new Store(b);
    expect(s.lang).toBe('zh-Hant');
    expect(b.map.get('cl.lang')).toBe('zh-Hant');
    expect(b.map.has('cl.script')).toBe(false);
  });

  it('旧 cl.script=hans 迁移为 zh-Hans', () => {
    const b = memBacking({ 'cl.script': 'hans' });
    expect(new Store(b).lang).toBe('zh-Hans');
    expect(b.map.get('cl.lang')).toBe('zh-Hans');
  });

  it('新键存在时不被旧键覆盖', () => {
    const b = memBacking({ 'cl.script': 'hant', 'cl.lang': 'ko' });
    expect(new Store(b).lang).toBe('ko');
  });

  it('backing 无 removeItem 时也不崩，旧键置空视作无值', () => {
    const m = new Map([['cl.script', 'hant']]);
    const s = new Store({
      getItem: (k: string) => m.get(k) || null,
      setItem: (k: string, v: string) => void m.set(k, v),
    });
    expect(s.lang).toBe('zh-Hant');
    expect(m.get('cl.script') || null).toBeNull();
  });

  it('langPinned 默认为假，写入后为真', () => {
    const b = memBacking();
    const s = new Store(b);
    expect(s.langPinned).toBe(false);
    s.langPinned = true;
    expect(s.langPinned).toBe(true);
  });

  // 升级路径。关键：迁移只能认「升级之前」写下的 cl.lang，而新代码自己也会
  // 给每个人写 cl.lang——靠 cl.langV 版本标记区分，否则新用户第二次访问就会
  // 被追认成「已亲选」并永久钉死，分享链接与 ?lang= 对所有人失效。
  it('升级前存在的 cl.lang 视为已亲选，并写下版本标记', () => {
    const b = memBacking({ 'cl.lang': 'ko' });
    const s = new Store(b);
    expect(s.langPinned).toBe(true);
    expect(b.map.get('cl.langV')).toBe('2');
  });

  it('全新用户：迁移后写下版本标记，但不算亲选', () => {
    const b = memBacking();
    const s = new Store(b);
    expect(s.langPinned).toBe(false);
    expect(b.map.get('cl.langV')).toBe('2');
  });

  it('新代码写入的 cl.lang 不会在下次启动时被追认为亲选', () => {
    const b = memBacking();
    new Store(b).lang = 'en';              // 首次访问：落盘但未亲选
    const second = new Store(b);           // 第二次启动，重新构造
    expect(second.lang).toBe('en');
    expect(second.langPinned, '被误判为亲选，分享链接与 ?lang= 会对所有人失效').toBe(false);
  });

  it('亲选过的在重启后仍是亲选', () => {
    const b = memBacking();
    const first = new Store(b);
    first.lang = 'ko';
    first.langPinned = true;
    expect(new Store(b).langPinned).toBe(true);
  });

  it('显式写过 false 的不被迁移逻辑翻回来', () => {
    const b = memBacking({ 'cl.lang': 'ko', 'cl.langPinned': '0', 'cl.langV': '2' });
    expect(new Store(b).langPinned).toBe(false);
  });

  it('从旧 cl.script 迁移而来的视为亲选（那是他一直在用的语言）', () => {
    const b = memBacking({ 'cl.script': 'hant' });
    const s = new Store(b);
    expect(s.lang).toBe('zh-Hant');
    expect(s.langPinned).toBe(true);
    expect(b.map.has('cl.script')).toBe(false);
  });

  it('迁移只跑一次：已有版本标记时不再追认', () => {
    const b = memBacking({ 'cl.langV': '2', 'cl.lang': 'ja' });
    expect(new Store(b).langPinned).toBe(false);
  });

  it('存了无法识别的值时视作无偏好', () => {
    expect(new Store(memBacking({ 'cl.lang': 'klingon' })).lang).toBeNull();
  });
});
