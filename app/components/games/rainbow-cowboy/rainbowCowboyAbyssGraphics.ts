import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";
import type { AbyssBossController, AbyssTentacleLayout } from "./rainbowCowboyAbyssBoss";
import { computeHorizontalTentaclePath } from "./rainbowCowboyAbyssBoss";
import { ABYSS_ARENA_Y, ABYSS_TENTACLE_TIP_HIT_R } from "./rainbowCowboyAbyssConstants";
import type { LevelConfig } from "./rainbowCowboyTypes";

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawMiniHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hp: number,
  maxHp: number,
  flash: boolean,
) {
  const w = 36;
  const h = 5;
  const pct = Math.max(0, hp / maxHp);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = flash ? "#ffee66" : pct > 0.35 ? "#cc4422" : "#ff2200";
  ctx.fillRect(x - w / 2, y, w * pct, h);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2, y, w, h);
}

export function drawAbyssSky(
  ctx: CanvasRenderingContext2D,
  camY: number,
  time: number,
  floorY: number,
) {
  const depth = 1 - Math.min(1, camY / (floorY - VIEW_H));
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, `rgb(${Math.round(30 + depth * 80)},${Math.round(120 + depth * 60)},${Math.round(180 + depth * 40)})`);
  grad.addColorStop(0.35, `rgb(${Math.round(8 + depth * 20)},${Math.round(50 + depth * 30)},${Math.round(90 + depth * 40)})`);
  grad.addColorStop(1, `rgb(2,18,42)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (camY < floorY * 0.25) {
    const sunGlow = Math.min(1, (floorY * 0.25 - camY) / 400);
    ctx.fillStyle = `rgba(255,240,180,${sunGlow * 0.35})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H * 0.35);
  }

  for (let i = 0; i < 12; i++) {
    const bx = (i * 137 + Math.floor(camY * 0.05)) % VIEW_W;
    const by = (i * 89 + Math.floor(time / 40 + i * 20)) % VIEW_H;
    ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
    px(ctx, bx, by, 2, 2, ctx.fillStyle as string);
  }
}

export function drawAbyssDeepBackground(
  ctx: CanvasRenderingContext2D,
  camY: number,
  time: number,
) {
  for (let i = 0; i < 8; i++) {
    const wx = (i * 210 + camY * 0.08) % (VIEW_W + 100) - 50;
    const wy = camY + VIEW_H * 0.3 + i * 90 + Math.sin(time / 800 + i) * 12;
    ctx.fillStyle = "rgba(0,30,55,0.35)";
    ctx.beginPath();
    ctx.ellipse(wx, wy - camY, 60 + i * 8, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawAbyssFloor(ctx: CanvasRenderingContext2D, floorY: number, camY: number) {
  const sy = floorY - camY;
  if (sy > VIEW_H + 40) return;
  px(ctx, 0, sy - 8, VIEW_W, 24, "#1a2838");
  px(ctx, 0, sy + 8, VIEW_W, 60, "#0a1018");
  for (let x = 0; x < VIEW_W; x += 48) {
    px(ctx, x, sy + 4, 32, 6, "#243040");
  }
}

export function drawAbyssPlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camY: number,
) {
  const sy = y - camY;
  px(ctx, x, sy, w, h, "#3a4858");
  px(ctx, x + 2, sy + 2, w - 4, h - 6, "#556677");
  px(ctx, x, sy + h - 4, w, 4, "#222830");
}

export function drawAbyssLurkGlow(
  ctx: CanvasRenderingContext2D,
  time: number,
  playerDepth: number,
  revealStartDepth: number,
) {
  const progress = Math.min(1, Math.max(0, (playerDepth - (revealStartDepth - 100)) / 200));
  const pulse = 0.22 + Math.sin(time / 420) * 0.1 + progress * 0.28;
  const grad = ctx.createLinearGradient(VIEW_W, 0, VIEW_W * 0.42, 0);
  grad.addColorStop(0, `rgba(200,40,50,${pulse * 0.5})`);
  grad.addColorStop(0.45, `rgba(120,20,30,${pulse * 0.22})`);
  grad.addColorStop(1, "rgba(20,8,12,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(VIEW_W * 0.38, 0, VIEW_W * 0.62, VIEW_H);

  if (progress < 0.85) {
    ctx.fillStyle = `rgba(255,80,60,${pulse * 0.65})`;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      progress > 0.15 ? "SOMETHING STIRS TO STARBOARD…" : "DESCEND FURTHER…",
      VIEW_W - 24,
      VIEW_H - 28,
    );
    ctx.textAlign = "left";
  }
}

export function drawAbyssWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camY: number,
) {
  const sy = y - camY;
  px(ctx, x, sy, w, h, "#2a3545");
  px(ctx, x + 3, sy + 3, w - 6, h - 6, "#3d4a5c");
  for (let row = 0; row < h; row += 14) {
    px(ctx, x, sy + row, w, 2, "#1e2630");
  }
}

function resolveTentacleSegments(
  layout: AbyssTentacleLayout,
  time: number,
): { x: number; y: number }[] {
  if (layout.segments?.length) return layout.segments;
  return computeHorizontalTentaclePath(
    layout.baseX,
    layout.baseY,
    layout.reachUp,
    layout.sweep,
    time,
    layout.side,
  ).segments;
}

function drawTentacleTip(
  ctx: CanvasRenderingContext2D,
  layout: AbyssTentacleLayout,
  x: number,
  y: number,
  flash: boolean,
  time: number,
) {
  const lunging = layout.lunging;
  const role = layout.role;

  if (role === "gunner") {
    px(ctx, x - 14, y - 6, 28, 12, flash ? "#ffee88" : "#556677");
    px(ctx, x - 22, y - 4, 10, 8, flash ? "#ffffcc" : "#8899aa");
    ctx.fillStyle = flash ? "#ffffaa" : `rgba(80,220,255,${0.55 + Math.sin(time / 80) * 0.35})`;
    ctx.beginPath();
    ctx.arc(x - 24, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (!flash) {
      ctx.strokeStyle = `rgba(120,240,255,${0.35 + Math.sin(time / 60) * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 28, y);
      ctx.lineTo(x - 38, y);
      ctx.stroke();
    }
    return;
  }

  if (role === "lasher") {
    const clawColor = lunging || flash ? "#ff4422" : "#aa5533";
    const glow = lunging ? 0.55 + Math.sin(time / 30) * 0.35 : 0;
    if (glow > 0) {
      ctx.fillStyle = `rgba(255,80,40,${glow})`;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    px(ctx, x - 12, y - 10, 24, 18, clawColor);
    px(ctx, x - 16, y - 6, 8, 12, lunging ? "#ff6644" : "#884422");
    px(ctx, x - 4, y - 6, 8, 12, lunging ? "#ff6644" : "#884422");
    ctx.fillStyle = lunging ? "#ffaa66" : "#cc6644";
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  px(ctx, x - 10, y - 8, 20, 14, flash ? "#ffee66" : "#cc4422");
  ctx.fillStyle = flash ? "#ffffaa" : "#ff6644";
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTentacleArm(
  ctx: CanvasRenderingContext2D,
  layout: AbyssTentacleLayout,
  time: number,
  camY: number,
  showHpBar: boolean,
) {
  const shakeX = layout.dying ? Math.sin(layout.shakePhase) * (8 + layout.deathTimer / 80) : 0;
  const shakeY = layout.dying ? Math.cos(layout.shakePhase * 1.3) * 4 : 0;
  const flash = layout.hitFlash || (layout.dying && Math.sin(time / 40) > 0);
  const lunging = layout.lunging;
  const segments = resolveTentacleSegments(layout, time);
  if (segments.length < 2) return;

  if (lunging && !layout.dying) {
    const warn = 0.25 + Math.sin(time / 45) * 0.15;
    ctx.strokeStyle = `rgba(255,60,30,${warn})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    for (let s = 0; s < segments.length; s++) {
      const p = segments[s];
      const sx = p.x + shakeX;
      const sy = p.y - camY + shakeY;
      if (s === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let s = 0; s < segments.length - 1; s++) {
    const p0 = segments[s];
    const p1 = segments[s + 1];
    const x = p0.x + shakeX;
    const y = p0.y - camY + shakeY;
    const nx = p1.x + shakeX;
    const ny = p1.y - camY + shakeY;
    const thick = 18 - s * 2.5;

    ctx.strokeStyle = flash
      ? `rgba(255,${140 + s * 25},${40 + s * 10},0.98)`
      : lunging
        ? s % 2 === 0
          ? "#6a3028"
          : "#552018"
        : s % 2 === 0
          ? "#4a3840"
          : "#3a2830";
    ctx.lineWidth = thick;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    ctx.fillStyle = flash ? "#dd6644" : lunging ? "#884433" : "#5a4038";
    ctx.beginPath();
    ctx.ellipse(nx, ny, 10 - s * 0.8, 8 - s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (s > 0 && s < segments.length - 2) {
      const suckerColor = flash ? "#ffcc88" : lunging ? "#cc6644" : "#7a5048";
      ctx.fillStyle = suckerColor;
      ctx.beginPath();
      ctx.ellipse((x + nx) / 2, (y + ny) / 2, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,10,8,0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const last = segments[segments.length - 1];
  const tipX = last.x + shakeX;
  const tipY = last.y - camY + shakeY;

  if (flash) {
    const pulse = 0.65 + Math.sin(time / 35) * 0.35;
    ctx.fillStyle = `rgba(255,255,180,${pulse})`;
    ctx.beginPath();
    ctx.arc(tipX, tipY, ABYSS_TENTACLE_TIP_HIT_R + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,240,120,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tipX, tipY, ABYSS_TENTACLE_TIP_HIT_R + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawTentacleTip(ctx, layout, tipX, tipY, flash, time);

  if (showHpBar) {
    drawMiniHpBar(ctx, tipX, tipY - 14, layout.hp, layout.maxHp, flash);
  }
}

export function drawMechanicalSquid(
  ctx: CanvasRenderingContext2D,
  boss: AbyssBossController,
  camY: number,
  time: number,
  arenaMode: boolean,
) {
  const st = boss.getState();
  const scale = st.squidScale;
  const cx = st.squidX;
  const cy = st.squidY - camY;
  const flash = st.hitFlash;
  const reveal = st.revealProgress;
  const engageBlend = st.engageBlend ?? (st.engaged ? 1 : 0);
  const showCombat = st.engaged;
  const layouts = boss.getTentacleLayouts(time);

  ctx.save();
  if (!showCombat) {
    ctx.globalAlpha = 0.55 + reveal * 0.45;
  } else if (engageBlend < 1) {
    ctx.globalAlpha = 0.62 + engageBlend * 0.38;
  }

  for (const layout of layouts) {
    drawTentacleArm(ctx, layout, time, camY, showCombat);
  }

  const bodyAlpha = showCombat ? 1 : Math.max(0, Math.min(1, (reveal - 0.42) / 0.58));
  if (bodyAlpha <= 0.02) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha = showCombat ? 1 : (0.55 + reveal * 0.45) * bodyAlpha;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const bodyW = 168;
  const bodyH = 118;
  const bodyVulnerable = st.bodyVulnerable;
  const mantleColor = flash ? "#8a9098" : bodyVulnerable ? "#5a6068" : "#3a4555";
  const brass = "#8a7030";
  const eldritch = "#2a3848";

  // Wing fins — Cthulhu silhouette
  for (const wing of [-1, 1]) {
    const flap = Math.sin(time / 520 + wing) * 8;
    ctx.fillStyle = flash ? "#667788" : "#445566";
    ctx.beginPath();
    ctx.moveTo(-bodyW + 40, -bodyH * 0.15);
    ctx.lineTo(-bodyW - 90 + flap, -bodyH * 0.55 + wing * 20);
    ctx.lineTo(-bodyW - 70 + flap, bodyH * 0.35 + wing * 12);
    ctx.lineTo(-bodyW + 20, bodyH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = brass;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Mantle / head mass
  px(ctx, -bodyW, -bodyH, bodyW, bodyH, mantleColor);
  px(ctx, -bodyW + 8, -bodyH + 8, bodyW - 16, bodyH - 20, "#4a5568");
  px(ctx, -bodyW + 4, -bodyH + 4, bodyW - 8, 12, "#5a6578");

  // Eldritch rune bands
  for (let band = 0; band < 3; band++) {
    px(ctx, -bodyW + 12 + band * 28, -bodyH + 22 + band * 18, 22, 4, brass);
  }

  if (!bodyVulnerable) {
    px(ctx, -bodyW - 4, -bodyH - 4, bodyW + 8, bodyH + 12, eldritch);
    ctx.fillStyle = "rgba(60,80,100,0.5)";
    ctx.fillRect(-bodyW, -bodyH, bodyW, bodyH);
    // Armored rivets
    for (let r = 0; r < 8; r++) {
      px(ctx, -bodyW + 16 + (r % 4) * 36, -bodyH + 18 + Math.floor(r / 4) * 40, 6, 6, "#667788");
    }
  }

  // Crown of horns
  px(ctx, -bodyW + 10, -bodyH - 24, 116, 32, "#5a6578");
  px(ctx, -bodyW + 24, -bodyH - 38, 88, 16, "#6a7588");
  for (let h = 0; h < 5; h++) {
    const hx = -bodyW + 28 + h * 22;
    const hornH = 28 + (h % 2) * 10;
    px(ctx, hx, -bodyH - 38 - hornH, 10, hornH, brass);
    px(ctx, hx + 2, -bodyH - 38 - hornH - 6, 6, 8, "#ccb866");
  }

  const eyeGlow = bodyVulnerable
    ? 0.85 + Math.sin(time / 120) * 0.15
    : 0.25 + Math.sin(time / 300) * 0.08;
  px(ctx, -bodyW + 36, -bodyH + 16, 52, 36, "#0a0808");
  px(ctx, -bodyW + 40, -bodyH + 20, 44, 28, "#1a1010");
  ctx.fillStyle = `rgba(${Math.round(220 * eyeGlow)},40,40,${eyeGlow})`;
  ctx.beginPath();
  ctx.ellipse(-bodyW + 62, -bodyH + 34, 22, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = brass;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (bodyVulnerable) {
    ctx.fillStyle = `rgba(255,120,80,${eyeGlow * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(-bodyW + 62, -bodyH + 34, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    drawMiniHpBar(ctx, -bodyW + 62, -bodyH + 8, st.hp, st.maxHp, flash);
  }

  // Mandible tusks
  px(ctx, -bodyW + 20, -bodyH + 44, 28, 18, brass);
  px(ctx, -bodyW + 120, -bodyH + 44, 28, 18, brass);
  px(ctx, -bodyW + 26, -bodyH + 58, 8, 14, "#ccb866");
  px(ctx, -bodyW + 134, -bodyH + 58, 8, 14, "#ccb866");

  const spin = (time / 80) % (Math.PI * 2);
  for (let p = 0; p < 2; p++) {
    const px0 = p === 0 ? -bodyW + 36 : -bodyW + 104;
    ctx.save();
    ctx.translate(px0, -bodyH + 54);
    ctx.rotate(spin * (p === 0 ? 1 : -1));
    px(ctx, -10, -10, 20, 20, "#667788");
    px(ctx, -3, -12, 6, 24, "#99aabb");
    ctx.restore();
  }

  px(ctx, -bodyW + 76, -bodyH - 56, 28, 24, "#778899");
  px(ctx, -bodyW + 66, -bodyH - 50, 48, 10, "#556677");
  px(ctx, -bodyW + 80, -bodyH - 62, 20, 8, brass);

  const remainingBodyTentacles = layouts.filter((l) => !l.dying).length;
  for (let i = 0; i < Math.min(6, remainingBodyTentacles + 1); i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const tx = -bodyW + 58 + i * 10;
    const wave = Math.sin(time / 300 + i * 1.2) * 16;
    px(ctx, tx - 10, -24 + side * wave * 0.2, 20, 96 + wave, "#3a4555");
    px(ctx, tx - 7, 56 + wave, 14, 28, "#2a3540");
    if (i % 2 === 0) {
      px(ctx, tx - 4, 70 + wave, 8, 6, "#7a5048");
    }
  }

  if (st.collapsing) {
    ctx.globalAlpha = Math.max(0.2, 1 - boss.collapseHold / 4200);
  }

  ctx.restore();
  ctx.restore();

  if (st.sonarPulse > 0.1) {
    ctx.strokeStyle = `rgba(100,200,255,${st.sonarPulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy - 40, 40 + (1 - st.sonarPulse) * 160, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const cloud of st.inkClouds) {
    const sy = cloud.y - camY;
    ctx.fillStyle = "rgba(10,10,20,0.55)";
    ctx.beginPath();
    ctx.ellipse(cloud.x, sy, cloud.r, cloud.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawAbyssTentacleHazards(
  ctx: CanvasRenderingContext2D,
  rects: { x: number; y: number; w: number; h: number }[],
  camY: number,
  _arenaMode: boolean,
  time: number,
) {
  for (const r of rects) {
    const sy = r.y - camY;
    if (sy + r.h < -20 || sy > VIEW_H + 20) continue;
    const pulse = 0.65 + Math.sin(time / 180 + r.x) * 0.2;
    ctx.fillStyle = `rgba(255,60,30,${pulse * 0.28})`;
    ctx.fillRect(r.x, sy, r.w, r.h);
    ctx.strokeStyle = `rgba(255,120,60,${pulse * 0.45})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, sy + 1, r.w - 2, r.h - 2);
  }
}

export function drawAbyssVictoryEpilogue(
  ctx: CanvasRenderingContext2D,
  holdMs: number,
  defeatLabel: string,
  missionBanner: string,
) {
  const t1 = Math.min(1, holdMs / 800);
  const t2 = Math.min(1, Math.max(0, holdMs - 1200) / 900);
  const t3 = Math.min(1, Math.max(0, holdMs - 2200) / 900);

  ctx.fillStyle = `rgba(0,0,0,${0.55 * t1})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = "center";
  if (t1 > 0) {
    ctx.fillStyle = `rgba(255,80,60,${t1})`;
    ctx.font = "bold 32px monospace";
    ctx.fillText(defeatLabel, VIEW_W / 2, VIEW_H * 0.32);
  }
  if (t2 > 0) {
    ctx.fillStyle = `rgba(255,220,100,${t2})`;
    ctx.font = "bold 24px monospace";
    ctx.fillText(missionBanner, VIEW_W / 2, VIEW_H * 0.42);
  }
  if (t3 > 0) {
    ctx.fillStyle = `rgba(180,200,220,${t3 * 0.9})`;
    ctx.font = "14px monospace";
    ctx.fillText("NEW BRANCH UNLOCKED · Skywatch", VIEW_W / 2, VIEW_H * 0.5);
  }
  ctx.textAlign = "left";
}

export function drawAbyssArenaPlatform(
  ctx: CanvasRenderingContext2D,
  config: LevelConfig,
  camY: number,
  _time: number,
) {
  const plat = { x: VIEW_W / 2 - 220, y: ABYSS_ARENA_Y, w: 440, h: 24 };
  drawAbyssPlatform(ctx, plat.x, plat.y, plat.w, plat.h, camY);

  ctx.fillStyle = "rgba(0,40,80,0.5)";
  ctx.fillRect(0, ABYSS_ARENA_Y + 24 - camY, VIEW_W, VIEW_H);

  px(ctx, VIEW_W / 2 - 8, ABYSS_ARENA_Y - 60 - camY, 16, 60, "#445566");
  px(ctx, VIEW_W / 2 - 40, ABYSS_ARENA_Y - 68 - camY, 80, 10, "#667788");
}

export function drawAbyssExtractionMarker(
  ctx: CanvasRenderingContext2D,
  y: number,
  camY: number,
  time: number,
) {
  const sy = y - camY;
  if (sy < -40 || sy > VIEW_H + 40) return;
  const pulse = 0.5 + Math.sin(time / 200) * 0.3;
  ctx.fillStyle = `rgba(100,220,255,${pulse})`;
  ctx.fillRect(VIEW_W / 2 - 60, sy - 8, 120, 4);
  ctx.font = "12px monospace";
  ctx.fillStyle = `rgba(180,240,255,${pulse})`;
  ctx.textAlign = "center";
  ctx.fillText("▲ ASCEND", VIEW_W / 2, sy - 16);
  ctx.textAlign = "left";
}
