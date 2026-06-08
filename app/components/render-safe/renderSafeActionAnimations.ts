export type RenderSafeActionAnimationType =
  | "chemlight_toss"
  | "trip_wire_secure"
  | "rope_disarm"
  | "bridge_remote_pull"
  | "target_assault"
  | "avalanche_evac"
  | "detonation";

export const ACTION_ANIMATION_DURATION_MS = 1900;
export const DETONATION_ANIMATION_DURATION_MS = 1500;
export const BRIDGE_PULL_ANIMATION_DURATION_MS = 5200;
export const TARGET_ASSAULT_ANIMATION_DURATION_MS = 4500;
export const AVALANCHE_ANIMATION_DURATION_MS = 6200;

export function getActionAnimationDuration(type: RenderSafeActionAnimationType): number {
  if (type === "detonation") return DETONATION_ANIMATION_DURATION_MS;
  if (type === "bridge_remote_pull") return BRIDGE_PULL_ANIMATION_DURATION_MS;
  if (type === "target_assault") return TARGET_ASSAULT_ANIMATION_DURATION_MS;
  if (type === "avalanche_evac") return AVALANCHE_ANIMATION_DURATION_MS;
  return ACTION_ANIMATION_DURATION_MS;
}

export function getActionAnimationSize(type: RenderSafeActionAnimationType): { width: number; height: number } {
  if (type === "bridge_remote_pull") return { width: 320, height: 200 };
  if (type === "target_assault") return { width: 340, height: 220 };
  if (type === "avalanche_evac") return { width: 340, height: 220 };
  return { width: 280, height: 168 };
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function drawOperatorSideProfile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  armAngle: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#3d4a2a";
  ctx.fillRect(-8, -2, 16, 14);
  ctx.fillStyle = "#4a5530";
  ctx.fillRect(-7, 0, 14, 10);
  ctx.fillStyle = "#2f3418";
  ctx.fillRect(-7, 12, 5, 8);
  ctx.fillRect(2, 12, 5, 8);

  ctx.fillStyle = "#3d4a2a";
  ctx.beginPath();
  ctx.ellipse(0, -8, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(-3, -10, 6, 2);

  ctx.save();
  ctx.translate(6, 2);
  ctx.rotate(armAngle);
  ctx.fillStyle = "#3d4a2a";
  ctx.fillRect(0, -2, 12, 4);
  ctx.fillRect(10, -3, 4, 6);
  ctx.restore();

  ctx.restore();
}

function drawChemlight(ctx: CanvasRenderingContext2D, x: number, y: number, glow: number) {
  const r = 6 + glow * 4;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(255,200,120,${0.5 + glow * 0.35})`);
  grad.addColorStop(0.5, `rgba(249,115,22,${0.25 + glow * 0.2})`);
  grad.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f97316";
  ctx.fillRect(x - 3, y - 2, 6, 4);
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(x - 1, y - 1, 2, 2);
}

export function drawChemlightTossAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const groundY = height * 0.72;
  ctx.fillStyle = "#0a120a";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1a2418";
  ctx.fillRect(0, groundY, width, height - groundY);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, groundY, width, 2);

  const p = clamp01(progress);
  const tossStart = 0.15;
  const tossEnd = 0.62;
  const armAngle =
    p < tossStart ? -0.4 - p * 0.8 : p < tossEnd ? -1.2 + ((p - tossStart) / (tossEnd - tossStart)) * 1.4 : -0.3;

  drawOperatorSideProfile(ctx, width * 0.28, groundY - 4, 1.4, armAngle);

  let clX = width * 0.42;
  let clY = groundY - 28;
  let glow = 0.2;

  if (p >= tossStart && p < tossEnd) {
    const t = (p - tossStart) / (tossEnd - tossStart);
    const arc = Math.sin(t * Math.PI);
    clX = width * 0.42 + t * width * 0.22;
    clY = groundY - 28 - arc * 42;
    glow = 0.35 + arc * 0.25;
  } else if (p >= tossEnd) {
    clX = width * 0.64;
    clY = groundY - 3;
    glow = 0.55 + Math.sin(p * 14) * 0.15;
  }

  if (p >= tossStart * 0.8) {
    drawChemlight(ctx, clX, clY, glow);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(249,115,22,0.85)";
  ctx.font = "bold 11px monospace";
  ctx.fillText("MARK & BYPASS", width / 2, height * 0.14);
}

export function drawTripWireSecureAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const p = clamp01(progress);
  ctx.fillStyle = "#080c08";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(249,115,22,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  const cx = width / 2;
  const cy = height * 0.48;
  const wireY = cy + 8;

  ctx.fillStyle = "#2a2018";
  ctx.fillRect(cx - 50, wireY + 6, 28, 18);
  ctx.fillStyle = "#3a3028";
  ctx.fillRect(cx + 28, wireY - 14, 22, 16);
  ctx.fillStyle = "#555";
  ctx.fillRect(cx + 32, wireY - 10, 4, 8);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 60, wireY);
  ctx.lineTo(cx + 60, wireY - 2);
  ctx.stroke();

  const cutPhase = p > 0.35 && p < 0.55;
  const secured = p >= 0.72;

  if (p >= 0.25) {
    const cutterX = cx - 8 + easeOutCubic(clamp01((p - 0.25) / 0.2)) * 16;
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cutterX - 10, wireY - 14);
    ctx.lineTo(cutterX + 2, wireY + 2);
    ctx.moveTo(cutterX + 10, wireY - 14);
    ctx.lineTo(cutterX - 2, wireY + 2);
    ctx.stroke();
  }

  if (cutPhase) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 4, wireY - 6);
    ctx.lineTo(cx + 4, wireY + 6);
    ctx.stroke();
  }

  if (p >= 0.38) {
    ctx.strokeStyle = p >= 0.52 ? "rgba(100,100,100,0.5)" : "#1a1a1a";
    ctx.setLineDash(p >= 0.52 ? [3, 4] : []);
    ctx.beginPath();
    ctx.moveTo(cx - 60, wireY);
    ctx.lineTo(cx - 6, wireY + 1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx + 8, wireY);
    ctx.lineTo(cx + 60, wireY - 2);
    ctx.stroke();
  }

  if (p >= 0.58) {
    const handT = easeOutCubic(clamp01((p - 0.58) / 0.18));
    ctx.fillStyle = "#3d4a2a";
    ctx.fillRect(cx + 30 + handT * 4, wireY - 22, 14, 10);
    ctx.fillStyle = secured ? "#22c55e" : "#f97316";
    ctx.fillRect(cx + 34, wireY - 18, 6, 4);
  }

  if (secured) {
    ctx.fillStyle = "rgba(34,197,94,0.2)";
    ctx.fillRect(10, 10, width - 20, height - 20);
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PIN SECURED", cx, height * 0.86);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(249,115,22,0.85)";
  ctx.font = "bold 11px monospace";
  ctx.fillText("CUT & SECURE", width / 2, height * 0.12);
}

export function drawRopeDisarmAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const p = clamp01(progress);
  ctx.fillStyle = "#0a100a";
  ctx.fillRect(0, 0, width, height);

  const groundY = height * 0.68;
  ctx.fillStyle = "#1a2218";
  ctx.fillRect(0, groundY, width, height - groundY);

  const deviceX = width * 0.52;
  const deviceY = groundY - 8;
  const pull = easeOutCubic(clamp01(p / 0.55));
  const deviceShift = pull * 18;
  const tilt = pull * 0.35;

  ctx.save();
  ctx.translate(deviceX + deviceShift, deviceY);
  ctx.rotate(tilt);

  ctx.fillStyle = "#2a2820";
  ctx.fillRect(-14, -10, 28, 16);
  ctx.fillStyle = "#1a1814";
  ctx.fillRect(-10, -6, 20, 8);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(-3, -4, 6, 6);
  if (p >= 0.75) {
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(-3, -4, 6, 6);
  }

  ctx.strokeStyle = "#6a5030";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(-14 - pull * 40, -2 - pull * 8);
  ctx.stroke();
  ctx.restore();

  const ropeEndX = width * 0.08;
  const ropeY = groundY - 20 - pull * 6;
  ctx.strokeStyle = "#8a7048";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ropeEndX, ropeY);
  ctx.lineTo(deviceX - 14 - deviceShift + pull * 10, deviceY - 2);
  ctx.stroke();

  if (p >= 0.2) {
    ctx.fillStyle = "#3d4a2a";
    ctx.fillRect(ropeEndX - 6, ropeY - 8, 10, 16);
    ctx.fillStyle = "#4a5530";
    ctx.fillRect(ropeEndX - 18 - pull * 6, ropeY - 4, 14, 8);
  }

  if (p >= 0.78) {
    const flash = clamp01((p - 0.78) / 0.22);
    ctx.fillStyle = `rgba(34,197,94,${flash * 0.25})`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText("ALL CLEAR", width / 2, height * 0.18);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(249,115,22,0.85)";
  ctx.font = "bold 11px monospace";
  ctx.fillText("RENDER SAFE", width / 2, height * 0.88);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string | string[],
  alpha: number,
  tailTowardX: number,
) {
  if (alpha <= 0) return;
  const lines = Array.isArray(text) ? text : [text];
  ctx.save();
  ctx.globalAlpha = alpha;

  const r = 8;
  ctx.fillStyle = "rgba(240,248,240,0.95)";
  ctx.strokeStyle = "rgba(34,197,94,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  const tailMid = x + w * 0.25;
  ctx.lineTo(tailMid + 10, y + h);
  ctx.lineTo(tailTowardX, y + h + 14);
  ctx.lineTo(tailMid - 4, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1a2a1a";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = 13;
  const textBlockTop = y + h / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, textBlockTop + i * lineHeight);
  });

  ctx.restore();
}

function drawCoverTree(
  ctx: CanvasRenderingContext2D,
  treeX: number,
  groundY: number,
  layer: "back" | "front",
) {
  if (layer === "back") {
    ctx.fillStyle = "#1a2e18";
    ctx.beginPath();
    ctx.ellipse(treeX + 34, groundY - 92, 28, 18, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#243820";
    ctx.beginPath();
    ctx.ellipse(treeX + 22, groundY - 84, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.fillStyle = "#1a1810";
  ctx.fillRect(treeX + 10, groundY - 78, 26, 78);
  ctx.fillStyle = "#2a2418";
  ctx.fillRect(treeX + 14, groundY - 70, 6, 62);
  ctx.fillStyle = "#1a2e18";
  ctx.beginPath();
  ctx.ellipse(treeX + 28, groundY - 88, 22, 14, 0.35, 0, Math.PI * 2);
  ctx.fill();
}

/** Operator crouched behind cover — only a shoulder peek and reaching arm stay visible. */
function drawCoverPullOperator(
  ctx: CanvasRenderingContext2D,
  treeX: number,
  groundY: number,
  pull: number,
  progress: number,
): { handX: number; handY: number } {
  const strain = Math.sin(progress * 28) * pull * 0.5;
  const trunkX = treeX + 10;
  const trunkW = 26;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(trunkX + trunkW / 2, groundY + 2, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3d4a2a";
  ctx.beginPath();
  ctx.ellipse(trunkX + 6, groundY - 34, 6, 5, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a3018";
  ctx.fillRect(trunkX + 2, groundY - 38, 9, 4);

  ctx.fillStyle = "#3d4a2a";
  ctx.fillRect(trunkX + 4, groundY - 28, 10, 14);

  const armBaseX = trunkX + trunkW - 4;
  const armBaseY = groundY - 24;
  const handX = armBaseX + 12 + pull * 16 + strain;
  const handY = armBaseY - 4 - pull * 5;

  ctx.strokeStyle = "#3d4a2a";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(armBaseX, armBaseY);
  ctx.quadraticCurveTo(armBaseX + 8, armBaseY - 8 - pull * 4, handX, handY);
  ctx.stroke();

  ctx.fillStyle = "#2f3418";
  ctx.fillRect(handX - 3, handY - 3, 7, 6);

  return { handX, handY };
}

/** Action plays in the first ~68% of wall time; final frame holds so the radio call is readable. */
function bridgeSceneProgress(progress: number): number {
  const actionPortion = 0.68;
  if (progress >= actionPortion) return 1;
  return clamp01(progress / actionPortion);
}

export function drawBridgeRemotePullAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const p = bridgeSceneProgress(progress);
  const groundY = height * 0.78;

  ctx.fillStyle = "#070b08";
  ctx.fillRect(0, 0, width, height);

  const moon = ctx.createLinearGradient(0, 0, width * 0.4, height * 0.35);
  moon.addColorStop(0, "rgba(140,170,190,0.12)");
  moon.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#142030";
  ctx.fillRect(0, groundY - 28, width, 32);
  ctx.fillStyle = "rgba(100,160,220,0.2)";
  for (let i = 0; i < 4; i++) {
    const wave = Math.sin(p * 6 + i * 1.2) * 1.5;
    ctx.fillRect(20 + i * 70, groundY - 12 + wave, 50, 2);
  }

  ctx.fillStyle = "#3d3024";
  ctx.fillRect(width * 0.52, groundY - 20, width * 0.42, 8);
  ctx.fillStyle = "#5a4838";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(width * 0.54 + i * 14, groundY - 18, 10, 5);
  }

  const treeX = 18;
  drawCoverTree(ctx, treeX, groundY, "back");

  const pullStart = 0.12;
  const pullEnd = 0.54;
  const pull =
    p < pullStart ? 0 : easeOutCubic(clamp01((p - pullStart) / (pullEnd - pullStart)));

  const deviceX = width * 0.74;
  const deviceY = groundY - 22;
  const { handX, handY } = drawCoverPullOperator(ctx, treeX, groundY, pull, p);

  drawCoverTree(ctx, treeX, groundY, "front");

  ctx.strokeStyle = "#6a5030";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(handX + 4, handY);
  ctx.quadraticCurveTo(width * 0.38, groundY - 38 - pull * 10, deviceX - 14, deviceY);
  ctx.stroke();

  const deviceShift = pull * 10;
  ctx.save();
  ctx.translate(deviceX + deviceShift, deviceY);
  ctx.fillStyle = "#2a2820";
  ctx.fillRect(-14, -9, 28, 15);
  ctx.fillStyle = "#1a1814";
  ctx.fillRect(-10, -5, 20, 7);

  const safe = p >= 0.54;
  ctx.fillStyle = safe ? "#22c55e" : "#ef4444";
  ctx.fillRect(-3, -3, 6, 6);

  if (safe) {
    const pulse = clamp01((p - 0.54) / 0.12);
    ctx.fillStyle = `rgba(34,197,94,${pulse * 0.22})`;
    ctx.beginPath();
    ctx.arc(0, 0, 6 + pulse * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (p >= 0.54 && p < 0.66) {
    const click = clamp01((p - 0.54) / 0.08);
    ctx.fillStyle = `rgba(34,197,94,${click * 0.12 * (1 - clamp01((p - 0.62) / 0.06))})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (p >= 0.58) {
    const bubbleA = easeOutCubic(clamp01((p - 0.58) / 0.14));
    drawSpeechBubble(
      ctx,
      width * 0.2,
      height * 0.05,
      width * 0.6,
      46,
      ["All clear —", "we can keep moving."],
      bubbleA,
      handX,
    );
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(249,115,22,0.85)";
  ctx.font = "bold 11px monospace";
  ctx.fillText("BRIDGE — REMOTE PULL", width / 2, height * 0.92);
}

function drawMiniOperator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  leader = false,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const body = leader ? "#3d4a2a" : "#4a5568";
  const head = leader ? "#4a5530" : "#718096";
  ctx.fillStyle = body;
  ctx.fillRect(x - 4, y - 4, 8, 9);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(x, y - 7, 4, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (leader) {
    ctx.fillStyle = "#2a3018";
    ctx.fillRect(x - 2, y - 3, 4, 3);
  }
  ctx.fillStyle = "#2f3418";
  ctx.fillRect(x - 4, y + 4, 3, 4);
  ctx.fillRect(x + 1, y + 4, 3, 4);
  ctx.restore();
}

function drawVictoryHouse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  doorOpen: number,
) {
  ctx.fillStyle = "#181820";
  ctx.fillRect(cx - 52, groundY - 72, 104, 72);
  ctx.fillStyle = "#222228";
  ctx.fillRect(cx - 48, groundY - 68, 96, 64);

  ctx.fillStyle = "#2a2a32";
  ctx.beginPath();
  ctx.moveTo(cx - 54, groundY - 68);
  ctx.lineTo(cx, groundY - 94);
  ctx.lineTo(cx + 54, groundY - 68);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2a2a32";
  ctx.fillRect(cx - 38, groundY - 52, 14, 12);
  ctx.fillRect(cx + 24, groundY - 52, 14, 12);
  ctx.fillStyle = "rgba(255,180,80,0.45)";
  ctx.fillRect(cx - 36, groundY - 50, 10, 8);
  ctx.fillRect(cx + 26, groundY - 50, 10, 8);

  const doorW = 20 + doorOpen * 10;
  ctx.fillStyle = "#121218";
  ctx.fillRect(cx - 10, groundY - 30, doorW, 30);
  ctx.fillStyle = "rgba(255,180,80,0.25)";
  ctx.fillRect(cx - 8, groundY - 28, Math.max(4, doorW - 6), 26);
}

function drawMissionCongratsPanel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const px = 14;
  const py = height * 0.04;
  const pw = width - 28;
  const ph = height * 0.34;

  ctx.fillStyle = "rgba(8,14,10,0.92)";
  ctx.strokeStyle = "rgba(249,115,22,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#f97316";
  ctx.font = "bold 12px monospace";
  ctx.fillText("CONGRATS", width / 2, py + 22);

  ctx.fillStyle = "#e8ece8";
  ctx.font = "10px monospace";
  const lines = [
    "You got the assault force safely to target",
    "and killed/captured the High Value Individual.",
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, py + 44 + i * 16);
  });

  ctx.restore();
}

export function drawTargetAssaultAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const p = clamp01(progress);
  const groundY = height * 0.82;
  const houseX = width / 2;

  ctx.fillStyle = "#070b08";
  ctx.fillRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, width * 0.5, height * 0.4);
  sky.addColorStop(0, "rgba(140,170,190,0.1)");
  sky.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1a2418";
  ctx.fillRect(0, groundY, width, height - groundY);

  const doorOpen = clamp01((p - 0.42) / 0.35);
  drawVictoryHouse(ctx, houseX, groundY, doorOpen);

  const stackX = houseX - 26;
  const stackY = groundY - 6;
  const starts = [
    { x: houseX - 70, y: groundY - 4, leader: true },
    { x: houseX - 88, y: groundY - 2, leader: false },
    { x: houseX - 58, y: groundY - 2, leader: false },
    { x: houseX - 76, y: groundY, leader: false },
  ];

  const approach = easeOutCubic(clamp01(p / 0.28));
  const stack = easeOutCubic(clamp01((p - 0.22) / 0.18));

  starts.forEach((op, i) => {
    const stackOffsetY = i * 5;
    const sx = op.x + (stackX - op.x) * stack;
    const sy = op.y + (stackY - stackOffsetY - op.y) * stack;

    const enterStart = 0.4 + i * 0.09;
    const enter = clamp01((p - enterStart) / 0.12);

    let x = sx + (houseX - 4 - sx) * easeOutCubic(enter);
    let y = sy + (groundY - 18 - sy) * easeOutCubic(enter) * 0.5;
    const alpha = 1 - enter * 0.85;

    if (p < enterStart) {
      x = sx;
      y = sy;
    }

    drawMiniOperator(ctx, x, y, alpha, op.leader);
  });

  if (p >= 0.55) {
    const panelA = easeOutCubic(clamp01((p - 0.55) / 0.2));
    drawMissionCongratsPanel(ctx, width, height, panelA);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(249,115,22,0.75)";
  ctx.font = "bold 10px monospace";
  ctx.fillText("TARGET BUILDING — ASSAULT IN", width / 2, height * 0.94);
}

export function drawAvalancheEvacAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const p = clamp01(progress);
  const groundY = height * 0.78;
  const buildingX = width * 0.62;

  ctx.fillStyle = "#070b08";
  ctx.fillRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, width * 0.5, height * 0.35);
  sky.addColorStop(0, "rgba(140,170,190,0.1)");
  sky.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1a2418";
  ctx.fillRect(0, groundY, width, height - groundY);

  // Building exterior
  ctx.fillStyle = "#181820";
  ctx.fillRect(buildingX - 48, groundY - 88, 96, 88);
  ctx.fillStyle = "#222228";
  ctx.fillRect(buildingX - 44, groundY - 84, 88, 80);
  ctx.fillStyle = "#2a2a32";
  ctx.fillRect(buildingX - 12, groundY - 36, 24, 32);

  const evacStart = 0.08;
  const evacEnd = 0.42;
  const evacT = easeOutCubic(clamp01((p - evacStart) / (evacEnd - evacStart)));

  const teamStartX = buildingX - 8;
  const teamEndX = width * 0.18;
  for (let i = 0; i < 4; i++) {
    const lag = i * 0.06;
    const t = easeOutCubic(clamp01((p - evacStart - lag) / (evacEnd - evacStart)));
    const x = teamStartX + (teamEndX - teamStartX) * t;
    const y = groundY - 6 - i * 3;
    drawMiniOperator(ctx, x, y, 1 - t * 0.15, i === 0);
  }

  // Countdown timer (top)
  const timerSeconds = Math.max(0, Math.ceil(60 * (1 - p * 1.1)));
  const flash = Math.sin(p * 40) > 0 ? 1 : 0.55;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(239,68,68,${flash})`;
  ctx.font = "bold 16px monospace";
  ctx.fillText(`0:${timerSeconds.toString().padStart(2, "0")}`, width / 2, height * 0.1);
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = `rgba(239,68,68,${flash * 0.8})`;
  ctx.fillText("THREAT CONFIRMED", width / 2, height * 0.16);

  // Red alarm lights during evac
  if (p >= evacStart && p < 0.55) {
    const alarm = Math.sin(p * 50) > 0;
    ctx.fillStyle = alarm ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.04)";
    ctx.fillRect(0, 0, width, height);
  }

  // Building detonation
  const blastStart = 0.48;
  if (p >= blastStart) {
    const blastT = clamp01((p - blastStart) / 0.35);
    const cx = buildingX;
    const cy = groundY - 44;
    const blastR = 8 + blastT * 72;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, blastR);
    core.addColorStop(0, `rgba(255,240,200,${(1 - blastT) * 0.95})`);
    core.addColorStop(0.25, `rgba(255,120,40,${(1 - blastT) * 0.75})`);
    core.addColorStop(0.55, `rgba(220,40,20,${(1 - blastT) * 0.45})`);
    core.addColorStop(1, "rgba(80,20,10,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, blastR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(60,55,50,${blastT * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy - blastT * 20, 20 + blastT * 40, 12 + blastT * 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p >= 0.72) {
    const panelA = easeOutCubic(clamp01((p - 0.72) / 0.2));
    ctx.save();
    ctx.globalAlpha = panelA;
    ctx.fillStyle = "rgba(8,14,10,0.92)";
    ctx.strokeStyle = "rgba(34,197,94,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(14, height * 0.04, width - 28, height * 0.22, 10);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 12px monospace";
    ctx.fillText("MISSION SUCCESS", width / 2, height * 0.12);
    ctx.fillStyle = "#e8ece8";
    ctx.font = "10px monospace";
    ctx.fillText("Good call. Everyone got out safely.", width / 2, height * 0.19);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(249,115,22,0.75)";
  ctx.font = "bold 10px monospace";
  ctx.fillText("CALL AVALANCHE — EVACUATING", width / 2, height * 0.94);
}

export function drawDetonationAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const p = clamp01(progress);
  const cx = width / 2;
  const cy = height * 0.52;
  const blastT = clamp01(p / 0.35);
  const fadeT = clamp01((p - 0.4) / 0.6);

  ctx.fillStyle = "#120808";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1a1410";
  ctx.fillRect(0, height * 0.62, width, height * 0.38);

  ctx.fillStyle = "#2a2018";
  ctx.fillRect(cx - 10, cy + 6, 20, 8);

  const blastR = 8 + blastT * 58;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, blastR);
  core.addColorStop(0, `rgba(255,240,200,${(1 - fadeT) * 0.95})`);
  core.addColorStop(0.25, `rgba(255,120,40,${(1 - fadeT) * 0.75})`);
  core.addColorStop(0.55, `rgba(220,40,20,${(1 - fadeT) * 0.45})`);
  core.addColorStop(1, "rgba(80,20,10,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, blastR, 0, Math.PI * 2);
  ctx.fill();

  if (p >= 0.08) {
    const debrisT = clamp01((p - 0.08) / 0.55);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + 0.2;
      const dist = debrisT * (18 + (i % 3) * 12);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - debrisT * debrisT * 8;
      ctx.fillStyle = i % 2 === 0 ? "#3a3028" : "#5a4030";
      ctx.fillRect(cx + dx - 2, cy + dy - 2, 3 + (i % 2), 3);
    }
  }

  if (p >= 0.2) {
    const smokeT = clamp01((p - 0.2) / 0.65);
    ctx.fillStyle = `rgba(60,55,50,${smokeT * 0.35 * (1 - fadeT)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy - smokeT * 12, 16 + smokeT * 28, 10 + smokeT * 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p >= 0.12) {
    ctx.fillStyle = `rgba(255,80,40,${(1 - fadeT) * 0.18})`;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(239,68,68,${0.5 + (1 - fadeT) * 0.5})`;
  ctx.font = "bold 12px monospace";
  ctx.fillText("DETONATION", cx, height * 0.16);
}

export function drawActionAnimation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  type: RenderSafeActionAnimationType,
  progress: number,
) {
  switch (type) {
    case "chemlight_toss":
      drawChemlightTossAnimation(ctx, width, height, progress);
      break;
    case "trip_wire_secure":
      drawTripWireSecureAnimation(ctx, width, height, progress);
      break;
    case "rope_disarm":
      drawRopeDisarmAnimation(ctx, width, height, progress);
      break;
    case "bridge_remote_pull":
      drawBridgeRemotePullAnimation(ctx, width, height, progress);
      break;
    case "target_assault":
      drawTargetAssaultAnimation(ctx, width, height, progress);
      break;
    case "avalanche_evac":
      drawAvalancheEvacAnimation(ctx, width, height, progress);
      break;
    case "detonation":
      drawDetonationAnimation(ctx, width, height, progress);
      break;
  }
}
