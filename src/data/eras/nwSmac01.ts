// NW-SMAC-01 — The Ibarra Uploads (The Vacuum Trap).
// Seven Ed levels stacked vertically:
//   main 1 ↔ duct 1 (crawlspace)
//   main2  ↔ duct 2 (crawlspace)
//   main 3 ↔ duct 3 (crawlspace)
//   main 1 → main2 → main 3 → roof  (vertical stair traversal)
//
// Doorways are derived from painted markers at era-build time rather than
// hand-listed: vents on each main floor pair 1:1 with ladders in the duct
// at the same coordinates, and stair cells in adjacent mains pair 1:1 with
// stair cells in the floor above. Stair-kind cross-room transitions reuse
// the LADDER doorway mechanic (interior, single-cell teleport) — the
// MooseDoorwayMeta union doesn't have a "stairs" kind.

import { mooseToEraSeed } from "./from-moose";
import type { MooseDoorwayMeta, MooseEraMeta } from "./from-moose";
import {
  NW_SMAC_01_FRAME_HEIGHT,
  NW_SMAC_01_FRAME_WIDTH,
  NW_SMAC_01_SPACING,
  NW_SMAC_01_TEXTURE_KEY,
} from "../tilesets/nw_smac_01";
import { NW_SMAC_01_LEVELS } from "../tilesets/nw_smac_01.levels";
import type { MooseLevel } from "../tilesets/types";
import type { Entity, Vec2 } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

/** Find every painted cell on a layer whose base-name (after stripping the
 *  Ed " N" board suffix and lowercasing) equals `baseName`. Layers can be
 *  named e.g. "vents", "vents 0", "Vents" — all match base "vents". */
function paintedCells(level: MooseLevel | undefined, baseName: string): Vec2[] {
  if (!level) return [];
  const target = baseName.toLowerCase();
  const out: Vec2[] = [];
  for (const layer of level.layers) {
    const base = layer.name.trim().toLowerCase().replace(/\s+\d+$/, "");
    if (base !== target) continue;
    for (let y = 0; y < layer.data.length; y++) {
      const row = layer.data[y];
      for (let x = 0; x < row.length; x++) {
        if ((row[x] ?? 0) !== 0) out.push({ x, y });
      }
    }
  }
  return out;
}

function chebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Pair each `from` cell with the nearest `to` cell whose Chebyshev
 *  distance is ≤ maxDist. Ties on Chebyshev break by lower Manhattan
 *  (favours an axis-aligned neighbour over a diagonal one, which matches
 *  the author's likely intent when two stair cells abut a stairwell from
 *  opposite directions). Each `to` cell is consumed at most once so two
 *  `from` cells can't both route to the same landing. */
function pairNearest(
  from: Vec2[], to: Vec2[], maxDist: number,
): Array<{ from: Vec2; to: Vec2 }> {
  const remaining = [...to];
  const out: Array<{ from: Vec2; to: Vec2 }> = [];
  for (const f of from) {
    let bestIdx = -1;
    let bestCheb = maxDist + 1;
    let bestManh = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = chebyshev(f, remaining[i]);
      if (c > maxDist) continue;
      const m = manhattan(f, remaining[i]);
      if (c < bestCheb || (c === bestCheb && m < bestManh)) {
        bestCheb = c; bestManh = m; bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      out.push({ from: f, to: remaining[bestIdx] });
      remaining.splice(bestIdx, 1);
    }
  }
  return out;
}

function findLevel(name: string): MooseLevel | undefined {
  return NW_SMAC_01_LEVELS.find((lv) => lv.name === name);
}

export function nwSmac01Era(): EraSeed {
  // Level handles — must match the names emitted by the Ed export verbatim.
  // Note the "main2" typo (no space) is intentional: that's how the author
  // named the board in Ed.
  const lvMain1 = findLevel("main 1");
  const lvMain2 = findLevel("main2");
  const lvMain3 = findLevel("main 3");
  const lvDuct1 = findLevel("duct 1");
  const lvDuct2 = findLevel("duct 2");
  const lvDuct3 = findLevel("duct 3");
  const lvRoof = findLevel("roof");

  const doorways: MooseDoorwayMeta[] = [];

  // Vent ⟷ duct pairs. Each painted vent on a main floor that also has a
  // painted ladder cell in the matching duct yields a bidirectional pair:
  // main→duct as "vent" (crouch/drop), duct→main as "ladder" (climb up).
  const ventDuctPairs: Array<[string, MooseLevel | undefined, string, MooseLevel | undefined]> = [
    ["main_1", lvMain1, "duct_1", lvDuct1],
    ["main_2", lvMain2, "duct_2", lvDuct2],
    ["main_3", lvMain3, "duct_3", lvDuct3],
  ];
  for (const [mainId, mainLv, ductId, ductLv] of ventDuctPairs) {
    const pairs = pairNearest(
      paintedCells(mainLv, "vents"),
      paintedCells(ductLv, "ladders"),
      2,
    );
    // Only declare the main→duct direction; emitDoorways() auto-creates
    // the mirror at landingPos so re-entering the cell in `duct` crosses
    // back. Both directions share kind "vent" (same crouch+AP rules).
    for (const { from: ventCell, to: ladderCell } of pairs) {
      doorways.push({
        from: mainId, to: ductId, side: "N",
        localPos: ventCell, landingPos: ladderCell, kind: "vent",
      });
    }
  }

  // Stair ⟷ stair between adjacent main floors. Stair-kind doorways
  // don't exist in MooseDoorwayMeta — repurpose "ladder" (interior,
  // single-cell teleport) so the climb is at least traversable.
  const stairPairs: Array<[string, MooseLevel | undefined, string, MooseLevel | undefined]> = [
    ["main_1", lvMain1, "main_2", lvMain2],
    ["main_2", lvMain2, "main_3", lvMain3],
    ["main_3", lvMain3, "roof", lvRoof],
  ];
  for (const [lowerId, lowerLv, upperId, upperLv] of stairPairs) {
    const pairs = pairNearest(
      paintedCells(lowerLv, "stairs"),
      paintedCells(upperLv, "stairs"),
      2,
    );
    if (pairs.length === 0) {
      console.warn(
        `nwSmac01Era: no nearby stair cells between "${lowerId}" and "${upperId}" — ` +
        `cross-floor traversal disabled for this pair. Hand-pick a doorway if needed.`,
      );
      continue;
    }
    // emitDoorways() auto-creates the mirror; only declare lower→upper.
    for (const { from: lowCell, to: upCell } of pairs) {
      doorways.push({
        from: lowerId, to: upperId, side: "N",
        localPos: lowCell, landingPos: upCell, kind: "ladder",
      });
    }
  }

  const meta: MooseEraMeta = {
    era: "NW_SMAC_01",
    tilesetKey: NW_SMAC_01_TEXTURE_KEY,
    frameWidth: NW_SMAC_01_FRAME_WIDTH,
    frameHeight: NW_SMAC_01_FRAME_HEIGHT,
    spacing: NW_SMAC_01_SPACING,
    rooms: [
      { levelName: "main 1", id: "main_1", displayName: "NW-SMAC-01 // MAIN 1",  ambient: "DIM" },
      { levelName: "duct 1", id: "duct_1", displayName: "NW-SMAC-01 // DUCT 1",  ambient: "DARK", crawlspace: true },
      { levelName: "main2",  id: "main_2", displayName: "NW-SMAC-01 // MAIN 2",  ambient: "DIM" },
      { levelName: "duct 2", id: "duct_2", displayName: "NW-SMAC-01 // DUCT 2",  ambient: "DARK", crawlspace: true },
      { levelName: "main 3", id: "main_3", displayName: "NW-SMAC-01 // MAIN 3",  ambient: "DIM" },
      { levelName: "duct 3", id: "duct_3", displayName: "NW-SMAC-01 // DUCT 3",  ambient: "DARK", crawlspace: true },
      { levelName: "roof",   id: "roof",   displayName: "NW-SMAC-01 // ROOF",    ambient: "LIT" },
    ],
    startRoomId: "main_1",
    player: {
      // main 1 now paints a real `spawn` marker, so the importer's marker
      // path supplies the start position — no startPos override needed.
      name: "TECH-2 ROWAN-IBARRA",
    },
    doorways,
    entities: [],
    terminals: [
      // Kept from the prior era stub for narrative continuity; the
      // BYPASS_DRIVE requirement was dropped per request, so any player
      // can interact with the bypass console.
      {
        roomId: "main_1",
        pos: { x: 15, y: 8 },
        terminalId: "bypass-system",
        title: "SYSTEM CHECK // BYPASS_DRIVE ATTACHED",
        body:
          "Heavy-gauge patch cable seated. Bypass drive accepts the system " +
          "check and returns a valid auth string the facility never asked " +
          "for. The drive's toggle switches are noticeably warm.",
        setsRunFlag: "bypassed",
      },
    ],
  };
  const seed = mooseToEraSeed(NW_SMAC_01_LEVELS, meta);

  // Seed one of each tactical item into starting inventory so the player
  // can immediately verify the overlay and each item's mechanics.
  seed.player.inventory.push({ id: "phantom-emitter-1", itemType: "PHANTOM_EMITTER" });
  seed.player.inventory.push({ id: "spoof-badge-1",      itemType: "Q0_SPOOF_BADGE" });
  seed.player.inventory.push({ id: "dump-fragment-1",   itemType: "DUMP_FRAGMENT" });
  seed.player.inventory.push({ id: "thermal-baffle-1",  itemType: "THERMAL_BAFFLE" });
  seed.player.inventory.push({ id: "override-key-1",    itemType: "OVERRIDE_KEY" });

  // Enforcers — Lucky paints guard positions on an `enforcers` tile layer
  // (not entity:<id> markers), so seed them directly onto the EraSeed. Each
  // painted cell becomes a stationary GUARD that reuses the existing
  // vision/alert AI (homeRoomId + alert are stamped at world-seed time).
  const enforcerRooms: Array<[string, MooseLevel | undefined]> = [
    ["main_1", lvMain1],
    ["main_2", lvMain2],
    ["main_3", lvMain3],
    ["roof", lvRoof],
  ];
  for (const [roomId, lv] of enforcerRooms) {
    paintedCells(lv, "enforcers").forEach((pos, i) => {
      const tag = `${roomId.toUpperCase()}-${i + 1}`;
      const guard: Entity = {
        id: `ENFORCER-${tag}`,
        kind: "GUARD",
        name: `ENFORCER ${tag}`,
        roomId,
        pos,
        z: 0,
        facing: "south",
        status: "ACTIVE",
        stepsPerTurn: 1,
      };
      seed.entities.push(guard);
    });
  }

  // Footstep surfaces: every duct crawlspace floor is sheet-metal lining;
  // mains/roof inherit the default surface.
  for (const id of ["duct_1", "duct_2", "duct_3"]) {
    const r = seed.rooms.find((rm) => rm.id === id);
    if (r) r.floorSurface = "metalv2";
  }

  return seed;
}
