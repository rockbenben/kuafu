import type { InputState } from '../game/types';

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const JUMP = ['Space', 'KeyW', 'ArrowUp'];
const DASH = ['ShiftLeft', 'ShiftRight', 'KeyJ'];
const ULT = ['KeyK', 'KeyL'];

export class InputManager {
  private held = new Set<string>();
  private jumpPressed = false;
  private dashPressed = false;
  private ultimatePressed = false;

  keyDown(code: string) {
    if (this.held.has(code)) return; // OS 重复触发
    this.held.add(code);
    if (JUMP.includes(code)) this.jumpPressed = true;
    if (DASH.includes(code)) this.dashPressed = true;
    if (ULT.includes(code)) this.ultimatePressed = true;
  }

  keyUp(code: string) {
    this.held.delete(code);
  }

  private anyHeld(codes: string[]) {
    return codes.some(c => this.held.has(c));
  }

  snapshot(): InputState {
    const s: InputState = {
      left: this.anyHeld(LEFT),
      right: this.anyHeld(RIGHT),
      up: this.anyHeld(UP),
      down: this.anyHeld(DOWN),
      jumpHeld: this.anyHeld(JUMP),
      jumpPressed: this.jumpPressed,
      dashPressed: this.dashPressed,
      ultimatePressed: this.ultimatePressed,
    };
    this.jumpPressed = false;
    this.dashPressed = false;
    this.ultimatePressed = false;
    return s;
  }

  attach(target: { addEventListener: Window['addEventListener'] }) {
    target.addEventListener('keydown', (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keyDown(e.code);
    });
    target.addEventListener('keyup', (e: KeyboardEvent) => this.keyUp(e.code));
  }
}
