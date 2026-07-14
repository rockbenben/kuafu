import type { InputManager } from './input';

// 触屏控制：绑定 index.html 的 HTML 覆盖按钮（像素级命中、随屏缩放、避让安全区），
// 按下→注入按键、松开→释放；比全屏点触区更精准，也不误触背景。
const HOLD: Record<string, string> = {
  'tc-left': 'ArrowLeft',
  'tc-right': 'ArrowRight',
  'tc-jump': 'Space', // 长按可变高
  'tc-dash': 'KeyJ',
};

export class TouchControls {
  private root = document.getElementById('tc');
  private ultBtn = document.getElementById('tc-ult');
  private touchHeld = new Set<string>(); // 仅记录"由触屏按下、尚未松开"的长按键

  constructor(private im: InputManager, private onFirstTouch: () => void) {
    for (const id of Object.keys(HOLD)) this.bindHold(id, HOLD[id]);
    this.bindTap('tc-ult', 'KeyK'); // 大招·夸父跨步：边沿触发
  }

  /** 长按型：按下按住方向/跳，松开释放；指针捕获保证滑出也能正确释放。 */
  private bindHold(id: string, code: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
      this.onFirstTouch();
      this.touchHeld.add(code);
      this.im.keyDown(code);
    });
    const up = (e: PointerEvent) => { e.preventDefault(); this.touchHeld.delete(code); this.im.keyUp(code); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** 点触型：按一下即触发（大招）。 */
  private bindTap(id: string, code: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.onFirstTouch();
      this.im.keyDown(code);
      this.im.keyUp(code);
    });
  }

  /** 主循环每帧调用：仅触屏游玩时显示控制层。隐藏期间持续释放"由触屏按下"的
   *  长按键——每帧幂等，防止丢失 pointerup / display:none 竞态导致按键残留、
   *  "下一局无输入自跑"。只清触屏自己按下的键，绝不误伤键盘输入（桌面端
   *  touchHeld 恒空，此分支等同 no-op）。 */
  setVisible(on: boolean) {
    this.root?.classList.toggle('on', on);
    if (!on && this.touchHeld.size) {
      for (const code of this.touchHeld) this.im.keyUp(code);
      this.touchHeld.clear();
    }
  }

  /** 神力满时显示"跨"大招键并脉动。 */
  setUltReady(ready: boolean) { this.ultBtn?.classList.toggle('ready', ready); }
}
