# Art sources

Two pipelines live here, depending on what you're authoring:

- **Character sprite frames** — folders of PNGs under `art/<character>/...`
  + `npm run art`. Output goes into the chars-art atlas. Used by the
  renderer's per-entity sprite lookup. See "Character art sources" below.
- **Tile-based level art (Ed / Chilling Moose)** — drop the `.zip` Ed
  exports under `art/moose/<project>.zip` and run
  `npm run moose -- art/moose/<project>.zip`. The script unpacks the
  sheet, emits a Phaser-ready spritesheet at
  `public/assets/tilesets/<project>/sheet.png`, generates a typed frame
  registry under `src/data/tilesets/<project>.ts`, and (when the export
  contains levels) a level data module at
  `src/data/tilesets/<project>.levels.ts`. See "Ed level authoring" below.

---

## Character art sources

Drop PNG frames in here, run `npm run art`, and the game picks them up.

## Folder layout

```
art/
├── <character>/                  # lowercase, no spaces (e.g. rowan, mara, apex19)
│   ├── meta.json                 # OPTIONAL — frame rate / repeat overrides
│   ├── <animation>/              # e.g. idle, walk, walkcycle, chase, terminal
│   │   ├── <direction>/          # south, north, east, west
│   │   │   ├── 01.png
│   │   │   ├── 02.png
│   │   │   └── ...
│   │   ├── ... (other directions)
│   └── ... (other animations)
```

If an animation has no directional variants, you can drop the PNGs directly
in `art/<character>/<animation>/01.png …` and the script will register it as
`<character>_<animation>` (no direction suffix). Most cases want directions.

## Conventions

- **All frames for a single character must share width and height.** The
  build script enforces this. Match the legacy 36×36 to stay pixel-consistent
  with the existing Sol / EIRA-7 / Enforcer art.
- **Filenames sort lexically** — use zero-padded indices: `01.png`, `02.png`,
  …, `09.png`, `10.png`.
- **Direction names** must be exactly `south`, `north`, `east`, `west`.
- Animation key naming follows `<character>_<animation>_<direction>`. The
  renderer is already wired to look these up — see
  `src/phaser/GameScene.ts:entityAnimKey` for which keys are consumed.

## Per-character `meta.json` (optional)

```json
{
  "idle":  { "frameRate": 4,  "repeat": -1 },
  "walk":  { "frameRate": 8,  "repeat": -1 },
  "chase": { "frameRate": 6,  "repeat": -1 }
}
```

Defaults if omitted: `idle`/`rotations` = 4 fps, `walk`/`walkcycle` = 8 fps,
`chase` = 6 fps, anything else = 8 fps; everything loops forever
(`repeat: -1`).

## Build

```
npm run art
```

The script reads everything under `art/`, packs it into a single atlas at
`public/assets/sprite_pack/chars-art.{png,json}`, and writes
`src/data/char-anims.generated.ts` with one `CharAnim` entry per
(character, animation, direction). Both outputs are committed.

## Auto-pickup in-game

The renderer's lookup is purely keyed on the entity id. Any entity with id
`FOO` will automatically render as a sprite the moment an animation
`foo_idle_<facing>` (or `foo_walkcycle_<facing>`) exists in the registry.
That means: drop art for `apex19`, run `npm run art`, and APEX-19 stops
being a tinted rectangle without touching any code.

For named characters in the existing slice (`SOL IBARRA-CASTRO`,
`MARA IBARRA`, `TECH-2 ROWAN-IBARRA`), the renderer currently uses Sol's
art for the player. Author Rowan-specific frames as `art/rowan/...`, then
update `playerAnimKey` in `src/phaser/GameScene.ts` to prefer `rowan_*` when
the active era is COMMONWEALTH — that's the only code change needed.

---

## Ed level authoring (Chilling Moose)

Author tilesets and full levels in **Ed - Game Tile Editor**
(`apps.apple.com/app/id6502629511`), export the project zip, drop it in
`art/moose/<name>.zip`, and run:

```
npm run moose -- art/moose/<name>.zip
```

That bakes a Phaser-ready spritesheet at
`public/assets/tilesets/<name>/sheet.png`, writes a frame registry to
`src/data/tilesets/<name>.ts`, registers the tileset in
`src/data/tilesets/registry.generated.ts`, and (when the export contains
levels) writes `src/data/tilesets/<name>.levels.ts` for the renderer.

### Project setup in Ed

- **Tile size:** 32 × 32.
- **Spacing:** 1 px gutter between frames. The importer infers this from
  the sprite X coordinates, so as long as Ed's slice picker is set
  consistently you don't need to do anything special.
- **Sheets:** one per project for now. If you need more art, add it as
  more frames in the same sheet — a future revision will support
  multi-sheet exports, but v1.5 only ingests sheet 0.

### Layer name → game semantics

The importer reads layer names case-insensitively. Anything in this table
becomes part of the gameplay grid; anything else is pure decoration.

| Layer name      | Tile kind                     | Notes                  |
| --------------- | ----------------------------- | ---------------------- |
| `chasm`         | pure decoration (back layer)  | renders below floor    |
| `void`          | pure decoration (back layer)  | alias for `chasm`      |
| `pit`           | pure decoration (back layer)  | alias for `chasm`      |
| `shadows`       | pure decoration, alpha 0.45   | renders just above back layers |
| `floor`         | `FLOOR`                       | walkable, transparent  |
| `doors`         | `DOOR_CLOSED`                 | solid, opens on E      |
| `walls`         | `WALL`                        | solid, opaque          |
| `terminals`     | `TERMINAL`                    | opens Document Archive |
| `vent_control`  | `VENT_CONTROL`                | VENT-4 incident panel  |
| `shared_field`  | `SHARED_FIELD_RIG`            | RUN 01 trigger         |
| `light_sources` | `LIGHT_SOURCE`                | local dark-zone fix    |
| `article_zero`  | `ARTICLE_ZERO_FRAGMENT_TILE`  | meta-layer fragment    |
| `lattice_exit`  | `LATTICE_EXIT`                | endgame egress         |
| `objects`       | pure decoration (front layer) | no gameplay effect     |
| `spawn`         | (not a tile kind — see below) | sets player spawn      |

**Render order is name-driven, not Ed-export-order-driven.** Name your
layers anything you like in Ed; the importer sorts them back-to-front by
the priority table above (chasm/void/pit/shadows below floor, structural
layers above floor, objects on top). Unknown names land in the middle
band and keep their original Ed order.

**Aliases** — common alternate spellings resolve to the canonical names
above before any matching, so either form works:

| You painted   | Treated as     |
| ------------- | -------------- |
| `wall`        | `walls`        |
| `door`        | `doors`        |
| `doors_closed`| `doors`        |
| `door_closed` | `doors`        |
| `door_open`   | `doors_open`   |
| `terminal`    | `terminals`    |
| `light_source`| `light_sources`|
| `vent`        | `vent_control` |
| `vents`       | `vent_control` |

**Resolution order for gameplay tiles:** semantic layers apply in the
table order above (later wins on conflict). Empty cells default to
`WALL` so the player can't walk off the map.

**Chasm cells:** the gameplay grid only looks at the `floor` / `walls` /
etc. layers, so a `chasm` cell with no floor on top defaults to `WALL`
(impassable). Visually the chasm sprite shows through anywhere you don't
paint floor — useful for "holes you'd fall into".

**Spawn:** the first non-zero cell in a layer named `spawn` becomes the
player's starting position. If `spawn` is empty (or absent), Sol drops
on the first walkable tile in row-major order, then falls back to the
map centre as a last resort.

### Pure decoration

Anything that isn't in the table renders as art only — useful for
flooring patterns, wall trim, scenery, debris. Two pure-decoration names
are common:

- `objects` — full opacity by default
- `shadows` — opacity 0.45 by default (matches the Tiled convention)

Any other name (e.g. `glow`, `floor_trim`, `wall_caps`) is also accepted
and rendered at the layer's authored opacity.

### What's NOT consumed (yet)

- **Brushes / autotile rules** — the `BitMasks` field is preserved in
  the frame registry for future autotile support, but tiles render
  exactly as Ed places them.
- **Frame animations** — Ed can group multi-frame animations; the
  importer ignores the animation table.
- **Colliders** — gameplay solidity comes from the layer-name table, not
  from Ed's collider shapes.

### Wiring an Ed level into an era

After the importer succeeds, hook the level into one of the era seed
modules in `src/data/eras/`. Use the `eraSeedFromMooseLevel` helper:

```ts
import { eraSeedFromMooseLevel } from "./from-moose";
import { LATTICE_LEVELS } from "../tilesets/lattice.levels"; // generated

export function latticeEra() {
  return eraSeedFromMooseLevel(LATTICE_LEVELS[0], {
    era: "LATTICE",
    textureKey: "lattice",
    ambientLight: "DIM",
    floorName: "RING C // DUCT 4-A — third shift",
    player: {
      ap: 4, apMax: 4, condition: 10, conditionMax: 10,
      compliance: "GREEN", belief: "NONE",
      inventory: [], flashlightOn: false, flashlightBattery: 30,
      name: "SOL IBARRA-CASTRO",
      entangled: false,
    },
    entities: [/* hand-authored alongside the level */],
  });
}
```

Entities (NPCs, enforcers, items) stay in TS code — Ed handles the map,
your TS module handles who's standing on it.
