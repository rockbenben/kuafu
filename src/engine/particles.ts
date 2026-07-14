interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}
const MAX = 500;

export class Particles {
  private pool: P[] = [];

  get count() { return this.pool.length; }

  spawn(x: number, y: number, opts: {
    vx?: number; vy?: number; life?: number; size?: number;
    color: string; spread?: number; count?: number;
  }) {
    const n = opts.count ?? 1;
    const spread = opts.spread ?? 40;
    for (let i = 0; i < n; i++) {
      this.pool.push({
        x, y,
        vx: (opts.vx ?? 0) + (Math.random() - 0.5) * spread,
        vy: (opts.vy ?? 0) + (Math.random() - 0.5) * spread,
        life: opts.life ?? 0.6,
        maxLife: opts.life ?? 0.6,
        size: opts.size ?? 3,
        color: opts.color,
      });
    }
    if (this.pool.length > MAX) this.pool.splice(0, this.pool.length - MAX);
  }

  update(dt: number) {
    for (const p of this.pool) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.pool = this.pool.filter(p => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, cameraX: number) {
    for (const p of this.pool) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const s = p.size * (p.life / p.maxLife);
      ctx.fillRect(p.x - cameraX - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
