// 浮动反馈文字：拾取/击杀时在世界坐标处升起一行小字并淡出，直观展示"作用"。
interface Popup { x: number; y: number; text: string; color: string; age: number; life: number }

export class Popups {
  private list: Popup[] = [];

  spawn(x: number, y: number, text: string, color: string, life = 1.1) {
    this.list.push({ x, y, text, color, age: 0, life });
    if (this.list.length > 40) this.list.shift();
  }

  update(dt: number) {
    for (const p of this.list) p.age += dt;
    this.list = this.list.filter(p => p.age < p.life);
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number, font: string) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font;
    for (const p of this.list) {
      const k = p.age / p.life;
      const alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const y = p.y - k * 32; // 上升
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x - cameraX, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
