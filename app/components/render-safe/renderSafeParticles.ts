import { TILE_SIZE } from "./renderSafeMap";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: "dust" | "ripple";
}

const MAX_PARTICLES = 28;

export class RenderSafeParticlePool {
  private particles: Particle[] = [];

  spawnDust(x: number, y: number) {
    if (this.particles.length >= MAX_PARTICLES) return;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + 4,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -0.2 - Math.random() * 0.4,
        life: 0,
        maxLife: 420 + Math.random() * 280,
        size: 1 + Math.random() * 1.5,
        kind: "dust",
      });
    }
  }

  spawnRipple(x: number, y: number) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 900,
      size: 4,
      kind: "ripple",
    });
  }

  tick(dtMs: number) {
    this.particles = this.particles.filter((p) => {
      p.life += dtMs;
      if (p.kind === "dust") {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.002;
      } else {
        p.size += dtMs * 0.012;
      }
      return p.life < p.maxLife;
    });
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cameraY: number,
    viewportHeight: number,
  ) {
    for (const p of this.particles) {
      if (p.y < cameraY - TILE_SIZE || p.y > cameraY + viewportHeight + TILE_SIZE) continue;
      const t = p.life / p.maxLife;
      const alpha = 1 - t;

      if (p.kind === "dust") {
        ctx.fillStyle = `rgba(90,80,60,${alpha * 0.45})`;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else {
        ctx.strokeStyle = `rgba(140,190,240,${alpha * 0.35})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
