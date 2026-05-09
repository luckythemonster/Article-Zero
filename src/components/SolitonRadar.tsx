// SolitonRadar — small canvas in the HUD that shows enforcer/camera positions
// and cone facing on the player's current floor. Tints with the floor-wide
// alert level (green/yellow/red); fuzzes with sparse static at ALERT.

import { useEffect, useRef, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import type {
  AlertLevel,
  Facing,
  WorldState,
} from "../types/world.types";

const SIZE_PX = 96;
const VIEW_RADIUS = 9; // tiles visible on the radar around the player

const FACING_VEC: Record<Facing, { x: number; y: number }> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

function alertColor(level: AlertLevel): string {
  switch (level) {
    case "ALERT": return "#ff5566";
    case "EVASION": return "#ffaa44";
    case "CAUTION": return "#ffd23a";
    case "NORMAL": return "#6ad0a4";
  }
}

function drawWedge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  facing: Facing,
  radiusPx: number,
  halfAngleDeg: number,
  fill: string,
): void {
  const f = FACING_VEC[facing];
  const baseAngle = Math.atan2(f.y, f.x);
  const half = (halfAngleDeg * Math.PI) / 180;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radiusPx, baseAngle - half, baseAngle + half);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawRadar(canvas: HTMLCanvasElement, state: WorldState): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const floor = state.floors.get(state.player.pos.z);
  if (!floor) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Backplate.
  ctx.fillStyle = "#06120e";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1c5a3e";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  const tilePx = W / (VIEW_RADIUS * 2 + 1);
  const ox = state.player.pos.x;
  const oy = state.player.pos.y;
  const toScreen = (tx: number, ty: number) => ({
    x: (tx - ox + VIEW_RADIUS) * tilePx + tilePx / 2,
    y: (ty - oy + VIEW_RADIUS) * tilePx + tilePx / 2,
  });

  // Floor tile silhouettes — walls + closed doors stand out vs floor.
  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const tx = ox + dx;
      const ty = oy + dy;
      if (tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height) continue;
      const tile = floor.tiles[ty * floor.width + tx];
      if (!tile) continue;
      const { x, y } = toScreen(tx, ty);
      const isWall = tile.kind === "WALL" || tile.kind === "DOOR_CLOSED";
      ctx.fillStyle = isWall ? "#143b2a" : "#0a1f17";
      ctx.fillRect(
        Math.floor(x - tilePx / 2),
        Math.floor(y - tilePx / 2),
        Math.ceil(tilePx),
        Math.ceil(tilePx),
      );
    }
  }

  // Active noises — pulsing ring at the noise origin.
  for (const n of state.activeNoises) {
    if (n.pos.z !== state.player.pos.z) continue;
    const { x, y } = toScreen(n.pos.x, n.pos.y);
    ctx.strokeStyle = "rgba(255, 240, 180, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, n.radius * tilePx * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Enforcers + cameras with their cones and alert-tinted dots.
  for (const e of state.entities.values()) {
    if (e.status !== "ACTIVE") continue;
    if (e.kind !== "ENFORCER" && e.kind !== "CAMERA") continue;
    if (e.pos.z !== state.player.pos.z) continue;
    const dx = e.pos.x - ox;
    const dy = e.pos.y - oy;
    if (Math.abs(dx) > VIEW_RADIUS || Math.abs(dy) > VIEW_RADIUS) continue;
    const { x, y } = toScreen(e.pos.x, e.pos.y);
    const level = e.alert?.level ?? "NORMAL";
    const tint = alertColor(level);
    const halfAngle = e.kind === "CAMERA" ? 28 : 45;
    const coneTiles = e.coneRange ?? (e.kind === "CAMERA" ? 6 : 5);
    drawWedge(ctx, x, y, e.facing, coneTiles * tilePx, halfAngle, `${tint}33`);
    ctx.fillStyle = tint;
    const dotR = e.kind === "CAMERA" ? 2 : 3;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player dot.
  const player = toScreen(ox, oy);
  ctx.fillStyle = state.concealedEntityId ? "#7fdcff" : "#ffffff";
  ctx.beginPath();
  ctx.arc(player.x, player.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Jam screen on full ALERT.
  if (state.alertLevel === "ALERT") {
    const ix = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i += 17) {
      const off = i * 4;
      ix.data[off] = 200;
      ix.data[off + 1] = 60;
      ix.data[off + 2] = 60;
      ix.data[off + 3] = 200;
    }
    ctx.putImageData(ix, 0, 0);
  }
}

export default function SolitonRadar() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    const offs = [
      eventBus.on("PLAYER_MOVED", refresh),
      eventBus.on("ENTITY_MOVED", refresh),
      eventBus.on("TURN_START", refresh),
      eventBus.on("TURN_END", refresh),
      eventBus.on("ALERT_LEVEL_CHANGED", refresh),
      eventBus.on("NOISE_EMITTED", refresh),
      eventBus.on("PLAYER_CONCEALED", refresh),
      eventBus.on("PLAYER_REVEALED", refresh),
      eventBus.on("DOOR_TOGGLED", refresh),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    if (!worldEngine.hasState()) return;
    drawRadar(ref.current, worldEngine.getState());
  });

  if (!worldEngine.hasState()) return null;

  return (
    <canvas
      ref={ref}
      width={SIZE_PX}
      height={SIZE_PX}
      className="az-soliton-radar"
      aria-label="Soliton radar"
      style={{
        width: SIZE_PX,
        height: SIZE_PX,
        imageRendering: "pixelated",
      }}
    />
  );
}
