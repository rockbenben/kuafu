export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** 每逻辑帧的输入快照。pressed 类为边沿触发（当帧按下），held 为电平。 */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  dashPressed: boolean;
  ultimatePressed: boolean; // 大招·夸父跨步
}
