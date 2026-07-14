import { describe, it, expect } from 'vitest';
import { Particles } from '../src/engine/particles';

describe('Particles', () => {
  it('spawn 增加、寿命耗尽移除', () => {
    const ps = new Particles();
    ps.spawn(0, 0, { color: '#fff', life: 0.1, count: 3 });
    expect(ps.count).toBe(3);
    ps.update(0.2);
    expect(ps.count).toBe(0);
  });
  it('池上限 500', () => {
    const ps = new Particles();
    ps.spawn(0, 0, { color: '#fff', life: 10, count: 600 });
    expect(ps.count).toBe(500);
  });
});
