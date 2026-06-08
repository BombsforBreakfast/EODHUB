import { VIEW_W } from "./rainbowCowboyConstants";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX = 48;

export class RainbowCowboyParticlePool {
  private particles: Particle[] = [];

  spawnDust(worldX: number, worldY: number, camX: number) {
    if (this.particles.length >= MAX) return;
    const screenX = worldX - camX;
    if (screenX < -20 || screenX > VIEW_W + 20) return;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: screenX + (Math.random() - 0.5) * 8,
        y: worldY - 2,
        vx: -0.4 - Math.random() * 0.8,
        vy: -0.15 - Math.random() * 0.35,
        life: 0,
        maxLife: 350 + Math.random() * 250,
        size: 2 + Math.random() * 2,
      });
    }
  }

  spawnExplosion(worldX: number, groundY: number, camX: number) {
    const screenX = worldX - camX;
    if (screenX < -80 || screenX > VIEW_W + 80) return;
    for (let i = 0; i < 14 && this.particles.length < MAX; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.5;
      this.particles.push({
        x: screenX + (Math.random() - 0.5) * 10,
        y: groundY - 14 + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6 - 1.5 - Math.random() * 2,
        life: 0,
        maxLife: 400 + Math.random() * 500,
        size: 2 + Math.random() * 4,
      });
    }
  }

  tick(dtMs: number) {
    this.particles = this.particles.filter((p) => {
      p.life += dtMs;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.004;
      return p.life < p.maxLife;
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const alpha = (1 - t) * 0.65;
      const hot = p.vy < -0.5 && t < 0.35;
      ctx.fillStyle = hot
        ? `rgba(255,${120 + Math.floor(t * 80)},40,${alpha})`
        : `rgba(72,58,40,${alpha * 0.75})`;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
  }
}
