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
    // 暗影托底。这一族原本是全场景唯一裸着画的字——HUD、题名、结算、教学提示
    // 上一轮都配了底，唯独漏了这个文件，实拍四条浮动反馈全部判低对比
    // （「+60」13.9px 压在树影与亮地交界、「+10 ×1.6」压在法杖上）。
    // 与 HUD 用同一组值，不另造样式。
    ctx.shadowColor = 'rgba(8,4,2,0.9)';
    ctx.shadowBlur = 12;
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
