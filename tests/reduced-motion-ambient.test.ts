import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/renderer';
import { Particles } from '../src/engine/particles';
import type { Game } from '../src/game/game';

/**
 * 减弱动效冻住的是**装饰时钟**，不是真实时间。
 *
 * 判据取自实拍配对帧量的同一件事：把 performance.now 钉在相隔 600ms 的两个时刻各
 * 渲一帧——冻住时两帧必须逐笔相同（上一轮它们差 10.4%/25.3%），放行时必须不同。
 * 放行那一条是**反向对照**：两档读数一样的话，上面那条就是在量一个根本没动的东西。
 */

type Entry = string;

// 渲染器活在浏览器里，node 下这几个全局不存在。测试自己补上——不为测试去改产品代码。
Object.assign(globalThis, {
  devicePixelRatio: 1, innerWidth: 800, innerHeight: 450,
});

function makeHarness() {
  const grad = () => ({ addColorStop: () => {} });
  let log: Entry[] = [];
  const props: Record<string, unknown> = {
    createLinearGradient: grad, createRadialGradient: grad,
    measureText: (s: string) => ({ width: String(s).length * 8 }),
  };
  const ctx = new Proxy(props, {
    get(t, p) {
      if (p in t) return t[p as string];
      return (...a: unknown[]) => {
        log.push(String(p) + '(' + a.map(v => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'object' ? 'o' : String(v))).join(',') + ')');
      };
    },
    set(t, p, v) { t[p as string] = v; log.push(String(p) + '=' + (typeof v === 'object' ? 'grad' : String(v))); return true; },
  });
  const canvas = {
    width: 1600, height: 900, clientWidth: 800, clientHeight: 450,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, start: () => { log = []; return () => log.slice(); } };
}

const GAME = {
  state: 'title', mode: 'endless', cameraX: 0, dying: false, deathCause: 'darkness',
  score: { total: 0, motes: 0, distanceM: 0, multiplier: 1 }, player: { pos: { x: 0, y: 0 } },
  combo: { count: 0, multiplier: 1, alpha: 0 }, charge: 0, chargeReady: false,
} as unknown as Game;

/** 同一个渲染器实例，跨 600ms 各渲一帧，返回两帧的逐笔日志。 */
function framesOf(frozen: boolean): [Entry[], Entry[]] {
  const h = makeHarness();
  const r = new Renderer(h.canvas);
  const real = performance.now.bind(performance);
  const frames: Entry[][] = [];
  try {
    r.setAmbientFrozen(frozen);
    for (const ms of [1000, 1600]) {
      const done = h.start();
      performance.now = () => ms;
      r.render(GAME, new Particles());
      frames.push(done());
    }
  } finally {
    performance.now = real;
  }
  return [frames[0], frames[1]];
}

describe('减弱动效：装饰时钟停走，真实时钟照走', () => {
  it('冻住时，相隔 600ms 的两帧逐笔相同', () => {
    const [a, b] = framesOf(true);
    expect(a.length, '一帧都没画出来，判据没在跑真绘制').toBeGreaterThan(200);
    expect(b, '冻住了还在动').toEqual(a);
  });

  it('反向对照：放行时两帧必须不同（否则冻与不冻没有区别，上面那条测了个空）', () => {
    const [a, b] = framesOf(false);
    expect(a.length).toBeGreaterThan(200);
    expect(b, '放行两帧却一样——量的是根本没在动的东西').not.toEqual(a);
  });

  it('冻住的时刻要**惰性**取：另开一次会话（墙钟不同）也必须落在同一相位', () => {
    // 夹具每次实拍都是新页面。若冻结时当场记墙钟，两张"冻住"的图相位不同，
    // 配对帧仍差 0.56%——仪器的抖动会被读成界面的残留动画。
    const first = framesOf(true)[0];
    const second = framesOf(true)[0];
    expect(second, '冻住的时刻记成了墙钟，跨页面不可复现').toEqual(first);
  });
});
