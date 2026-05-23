// EREMITE — the first Archivist module. A decommissioned isolation
// facility, painted in Ed/Chilling Moose. One Ed level backs three Rooms:
//
//   main        — un-prefixed boards (`floor 0`, `walls 0`, `doors 0`,
//                  `terminal 0`, `vents 0`, `light_source 0`, `chasm`,
//                  `ladders 0`)
//   lower       — `level -1 *` boards, visible through the main-deck
//                  chasms; reached via two ladders
//   crawlspace  — `vent *` boards (vent walls, vent shaft, vent light
//                  source); reached only from SNEAK at the painted vent
//                  cells on main
//
// The painted DOOR_CLOSED cells on main are NOT yet paired in meta — the
// loader emits no doorway for them, so they render as closed but cannot
// be crossed. Authoring pass after first dev-run will assign pairings.

import { mooseToEraSeed } from "./from-moose";
import type { MooseEraMeta } from "./from-moose";
import {
  EREMITE_MAP_FRAME_HEIGHT,
  EREMITE_MAP_FRAME_WIDTH,
  EREMITE_MAP_SPACING,
  EREMITE_MAP_TEXTURE_KEY,
} from "../tilesets/eremite_map";
import { EREMITE_MAP_LEVELS } from "../tilesets/eremite_map.levels";
import type { EraSeed } from "../../engine/WorldEngineState";
import type { Facing, Vec2 } from "../../types/world.types";

export function eremiteEra(): EraSeed {
  const meta: MooseEraMeta = {
    era: "EREMITE",
    tilesetKey: EREMITE_MAP_TEXTURE_KEY,
    frameWidth: EREMITE_MAP_FRAME_WIDTH,
    frameHeight: EREMITE_MAP_FRAME_HEIGHT,
    spacing: EREMITE_MAP_SPACING,
    rooms: [
      {
        levelName: "Level 1",
        id: "main",
        displayName: "EREMITE // MAIN DECK",
        ambient: "DIM",
      },
      {
        levelName: "Level 1",
        id: "lower",
        displayName: "EREMITE // LOWER DECK",
        ambient: "DARK",
        boardPrefix: "level -1 ",
      },
      {
        levelName: "Level 1",
        id: "crawlspace",
        displayName: "EREMITE // VENT NETWORK",
        ambient: "DARK",
        boardPrefix: "vent ",
        crawlspace: true,
      },
    ],
    startRoomId: "main",
    player: { name: "FIELD-TECH SOLEN-4" },
    doorways: [
      // Two ladders on main → lower at the painted LADDER cells (9,20)
      // and (42,20). Rooms share coordinate origin via the cropped Ed
      // level, so the same (x,y) means the same cell in both rooms.
      // Internal-kind doorways: the mirror lives at the landing cell;
      // re-entering the cell crosses back.
      {
        from: "main",
        to: "lower",
        side: "N",
        localPos: { x: 9, y: 20 },
        landingPos: { x: 9, y: 20 },
        kind: "ladder",
      },
      {
        from: "main",
        to: "lower",
        side: "N",
        localPos: { x: 42, y: 20 },
        landingPos: { x: 42, y: 20 },
        kind: "ladder",
      },
      // One vent on main → crawlspace at painted VENT cell (40,20),
      // landing on the navigable shaft cell (42,21). The painted vent
      // at (9,20) is shadowed by a ladder there (same cell) — the
      // ladder doorway wins doorwayAt lookup, so a second vent doorway
      // would be dead code. Single vent path is enough for v1.
      // SNEAK stance + VENT_AP_COST enforced by WorldEngineActions.
      {
        from: "main",
        to: "crawlspace",
        side: "N",
        localPos: { x: 40, y: 20 },
        landingPos: { x: 42, y: 21 },
        kind: "vent",
      },
      // TODO: 4 painted DOOR_CLOSED cells on main deck need pairing.
      // Render closed; cannot be crossed until declared here.
    ],
    entities: [],
    terminals: [
      // 3 painted TERMINAL cells along y=48 on main (raw Ed coords).
      // After crop bbox starts at x=24, y=29 the room-local x is raw-24.
      {
        roomId: "main",
        pos: { x: 17, y: 19 },
        terminalId: "eremite-term-1",
        title: "TERMINAL",
        body: "[placeholder]",
      },
      {
        roomId: "main",
        pos: { x: 24, y: 19 },
        terminalId: "eremite-term-2",
        title: "TERMINAL",
        body: "[placeholder]",
      },
      {
        roomId: "main",
        pos: { x: 31, y: 19 },
        terminalId: "eremite-term-3",
        title: "TERMINAL",
        body: "[placeholder]",
      },
    ],
  };
  const seed = mooseToEraSeed(EREMITE_MAP_LEVELS, meta);
  seedDuctHazard(seed);
  return seed;
}

/** The vent landing cell the main→crawlspace doorway drops the player onto. */
const VENT_LANDING: Vec2 = { x: 42, y: 21 };

/** Augment the EREMITE crawlspace with the duct-suffocation hazard: a
 *  surveillance drone that seals the vents on sight, a vent-control terminal
 *  to cancel the lockdown, and an EMP in the player's kit to kill the drone.
 *  Placement is computed from the actual shaft geometry (BFS from the vent
 *  landing) so it stays valid if the board art is re-authored. */
function seedDuctHazard(seed: EraSeed): void {
  // Give the player the drone's hard counter regardless of crawlspace layout.
  seed.player.inventory.push({ id: "emp-1", itemType: "EMP" });

  const crawl = seed.rooms.find((r) => r.id === "crawlspace");
  if (!crawl) return;
  const W = crawl.width;
  const at = (x: number, y: number) => crawl.tiles[y * W + x];
  const passable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= crawl.height) return false;
    const t = at(x, y);
    return !!t && !t.solid;
  };

  // Root the BFS at the nearest passable cell to the vent landing.
  let root: Vec2 | null = null;
  let bestD = Infinity;
  for (let y = 0; y < crawl.height; y++) {
    for (let x = 0; x < W; x++) {
      if (!passable(x, y)) continue;
      const d = Math.abs(x - VENT_LANDING.x) + Math.abs(y - VENT_LANDING.y);
      if (d < bestD) { bestD = d; root = { x, y }; }
    }
  }
  if (!root) return;

  const dist = new Map<string, number>();
  const queue: Vec2[] = [root];
  dist.set(`${root.x},${root.y}`, 0);
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    const d = dist.get(`${x},${y}`)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (passable(nx, ny) && !dist.has(k)) {
        dist.set(k, d + 1);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  const reachable = [...dist.entries()]
    .map(([k, d]) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y, d };
    })
    .sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);

  // Drone sits ~2 tiles in, facing the landing so it spots the player on entry.
  const drone = reachable.find((c) => c.d >= 2) ?? reachable[reachable.length - 1] ?? root;
  // Terminal sits one step from the landing on a different cell, reachable
  // even while the duct is sealed.
  const term =
    reachable.find((c) => c.d >= 1 && !(c.x === drone.x && c.y === drone.y)) ??
    reachable[0] ?? root;

  const dx = root.x - drone.x;
  const dy = root.y - drone.y;
  const facing: Facing =
    Math.abs(dx) >= Math.abs(dy)
      ? (dx >= 0 ? "east" : "west")
      : (dy >= 0 ? "south" : "north");

  seed.entities.push({
    id: "DRONE-1",
    kind: "SURVEILLANCE_DRONE",
    name: "SURVEILLANCE DRONE",
    roomId: "crawlspace",
    homeRoomId: "crawlspace",
    pos: { x: drone.x, y: drone.y },
    z: 0,
    facing,
    status: "ACTIVE",
    stepsPerTurn: 1,
  });

  // Repaint the terminal cell to TERMINAL but keep it non-solid so a 1-wide
  // shaft stays passable; the player stands adjacent and faces it.
  const tt = at(term.x, term.y);
  if (tt) tt.kind = "TERMINAL";
  (seed.terminals ??= []).push({
    roomId: "crawlspace",
    pos: { x: term.x, y: term.y },
    terminalId: "eremite-vent-ctrl",
    title: "VENT CONTROL",
    body: "Atmospheric override. Re-opens the duct seals and cancels the active lockdown.",
    clearsLockdown: true,
  });
}
