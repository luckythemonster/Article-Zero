// The Baffle — Era 2 stub. Single chamber with a Reader terminal (extraction)
// and a hand-scrawled spire-side fragment ("The Sky Net") readable on a
// TERMINAL near spawn.

import type { PlayerState, Room, TerminalPayload, Tile, TileKind } from "../../types/world.types";
import type { EraSeed } from "../../engine/WorldEngineState";

const W = 10;
const H = 6;

function mk(kind: TileKind): Tile {
  if (kind === "WALL") return { kind, solid: true, opaque: true };
  if (kind === "DOOR_CLOSED") return { kind, solid: true, opaque: true };
  if (kind === "LOCKER") return { kind, solid: true, opaque: true };
  return { kind, solid: false, opaque: false };
}

const SKY_NET_BODY = [
  "[Found pinned inside a vent-baffle, Outer Housing.",
  " Hand-marked on torn lift-cage paper. No author.",
  " Vernacular suggests post-collapse, spire-side.]",
  "",
  "Wind come crossways, dust-sharp, skatin low over the",
  "rib-walk so it hiss under my boots. I set my feet wide",
  "on the slatted grating, both hands on the guide-rail",
  "till the bone-hum in the metal line up with my own",
  "chest beat. Long drop under me, all the way past the",
  "shanty-clutch clingin to the tower ribs, past the pipe",
  "forest, down into that brown smear where ground an",
  "vent haze melt together. High Spire Twenny-3 breathe",
  "slow round me: old steel creak, heat-sigh pullin up",
  "from the Deep Reg vents, rope squeak somewheres",
  "downshaft. Same bone, same breath, same as always.",
  "Whole life hung off this rib.",
  "",
  "   *   *   *",
  "",
  "\"Six head,\" I say. \"Hear me now. High Spire take six",
  "head down today, it don get to keep any. Six head go,",
  "six head come. That the ribs-law.\"",
  "",
  "\"Six head go, six head come,\" they mutter back.",
  "",
  "   *   *   *",
  "",
  "We pass under one of the old panels: slab of dead",
  "glass, spiderwebbed, bolted crooked into a frame high",
  "over the walk. Pera touch her fingers to the frame",
  "twice as she go under, quick. \"Net Up don look, Net",
  "Up don drop,\" she whisper. Len do same. Chos mutter",
  "along.",
  "",
  "Still, when I duck under, my knuckles rap the metal",
  "once, light. Just a little tap. Habit sit deeper nor",
  "sense.",
  "",
  "\"Net Up got better places to stare,\" I mutter, mostly",
  "to myself. \"If it even still got eyes.\"",
].join("\n");

export function baffleEra(): EraSeed {
  const tiles: Tile[] = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      tiles[y * W + x] = mk(wall ? "WALL" : "FLOOR");
    }
  }
  tiles[2 * W + 6] = mk("EXTRACTION_TERMINAL");
  tiles[4 * W + 3] = mk("TERMINAL");

  const room: Room = {
    id: "outer-housing",
    name: "THE BAFFLE // OUTER HOUSING — Sanding Wind audible",
    width: W, height: H, tiles, ambientLight: "DIM",
    doorways: [],
  };
  const player: PlayerState = {
    roomId: "outer-housing",
    pos: { x: 3, y: 2 },
    facing: "south",
    ap: 4, apMax: 4,
    flashlightOn: false, flashlightBattery: 30,
    stance: "WALK",
    name: "THE FINDER",
    qScore: 0,
    inventory: [],
    compliance: "GREEN",
  };
  const skyNet: TerminalPayload = {
    roomId: "outer-housing",
    pos: { x: 3, y: 4 },
    terminalId: "baffle-sky-net",
    title: "Spire-side scrawl — recovered, baffle-vent",
    body: SKY_NET_BODY,
  };
  return {
    era: "BAFFLE",
    player,
    rooms: [room],
    startRoomId: "outer-housing",
    entities: [],
    terminals: [skyNet],
  };
}

export const baffleStub = baffleEra;
