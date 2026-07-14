import { DT } from '../game/constants';

const MAX_CATCHUP = 5;

export function createLoop(
  update: (dt: number) => void,
  render: (alpha: number) => void,
  opts?: { raf?: (cb: () => void) => void },
) {
  const raf = opts?.raf ?? ((cb: () => void) => requestAnimationFrame(() => cb()));
  let last = -1;
  let acc = 0;
  let running = false;

  function tick(nowMs: number) {
    if (last < 0) { last = nowMs; render(0); return; }
    acc += (nowMs - last) / 1000;
    last = nowMs;
    let steps = 0;
    while (acc >= DT && steps < MAX_CATCHUP) {
      update(DT);
      acc -= DT;
      steps++;
    }
    if (steps === MAX_CATCHUP) acc = 0; // 丢弃积压，避免螺旋死亡
    render(acc / DT);
  }

  function frame() {
    if (!running) return;
    tick(performance.now());
    raf(frame);
  }

  return {
    tick,
    start() { if (running) return; running = true; last = -1; raf(frame); },
    stop() { running = false; },
  };
}
