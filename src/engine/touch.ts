import { t, type StringKey } from '../render/strings';
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
  private visible: boolean | null = null;   // null = 尚未同步过 aria-hidden
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
    // 同步 aria-hidden：容器若一直是 aria-hidden，applyLocale 写进去的
    // aria-label 就锁在一棵对辅助技术不可见的子树里，等于白写。
    // 本方法由主循环每帧调用，故只在真正变化时写——无条件 setAttribute 即便
    // 值不变也会产生 MutationRecord 并让无障碍树失效，读屏会被反复打断。
    if (this.visible !== on) {
      this.visible = on;
      this.root?.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (!on && this.touchHeld.size) {
      for (const code of this.touchHeld) this.im.keyUp(code);
      this.touchHeld.clear();
    }
  }

  /** 神力满时显示"跨"大招键并脉动。 */
  setUltReady(ready: boolean) { this.ultBtn?.classList.toggle('ready', ready); }

  /**
   * 按当前语种刷新按钮文字与 aria-label。
   *
   * 帮助页的触屏说明（help.*.touch）是拿按钮上的字来指认按钮的，按钮若
   * 恒为中文，外语玩家读到的 "Leap / Dash" 就对不上屏幕上的「跃 / 冲」，
   * 等于没有说明；读屏用户则在任何语种下都只拿到中文标签。
   * 切语言后必须重调。
   */
  applyLocale() {
    const map: [string, StringKey, StringKey][] = [
      ['tc-left', 'btn.back', 'btn.back.aria'],
      ['tc-right', 'btn.fwd', 'btn.fwd.aria'],
      ['tc-dash', 'btn.dash', 'btn.dash.aria'],
      ['tc-jump', 'btn.jump', 'btn.jump.aria'],
      ['tc-ult', 'btn.ult', 'btn.ult.aria'],
    ];
    for (const [id, label, aria] of map) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = t(label);
      el.setAttribute('aria-label', t(aria));
    }
  }
}
