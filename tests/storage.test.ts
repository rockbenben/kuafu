import { describe, it, expect } from 'vitest';
import { Store } from '../src/game/storage';

function memBacking() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
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
