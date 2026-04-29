# Character art sources

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
