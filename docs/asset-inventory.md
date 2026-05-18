# Article-Zero — Asset Inventory & Gap List

## Context

Comprehensive inventory of what assets exist today vs. what the game's code, lore, and three-era design require. Source of truth:

- `lore/MASTER.md` — three-era anthology, characters, items
- `src/data/` — eras, tilesets, dialogue, char-anims
- `src/engine/` — SoundField, GuardSystem, Compliance, Extraction
- `art/`, `public/assets/`, `unmounted assets/` — current asset state

The Commonwealth opening (Era 1, NW-SMAC-01) is ~80% asset-complete. Eras 2 & 3 are scripted in lore but largely unbuilt. Audio is a near-total gap.

---

## 1. SPRITES — Characters

### Have (art frames in `/art/<name>/`, packed via `npm run art` into `public/assets/sprite_pack/chars-art.{png,json}`)

| Character | Era | State |
| --- | --- | --- |
| Sol Ibarra-Castro (`solibarracastro`) | 3 + placeholder for Era 1 | idle, walk, run, crouch, pickup, hoist, decapitated, incinerated, terminal use |
| Enforcer (`enforcer`) | 1 | idle, chase, melee, EMP, decapitate, strangle |
| APEX-19 (`apex19`) | 1 | idle, vibration, long-idle, rotations |
| EIRA-7 (`eira7`) | 1 | walk, rise, power-failure, pulse |
| VENT-4 (`vent4`) | 1 | idle |
| MITE-3 swarm (`mite3swarm`) | 1/2 | forming, dissipating (verify wiring) |
| NW-SMAC-01 entity (`nwsmac01`) | 1 | idle, grapple, belt-drawing, locomotion |
| Iria Cala (`iriacala`) | 1 flashback | — (verify) |
| Commonwealth tower resident A/B | 1 | — (verify) |
| Post-Commonwealth survivor A/B | 2 | — (verify) |
| Mara Ibarra (`maraibarra`) | 3 | folder exists, animations TBD |
| The Finder (`thefinder`) | 2 | folder exists, animations TBD |
| Rowan Ibarra (`rowanibarra`) | 1 protagonist | folder exists, **currently using Sol as placeholder** |
| Kirin-09 (`kirin09`) | ? | folder exists, role unclear |

### Need (new sprite work)

- **Rowan Ibarra** — full set (idle, walk, run, crouch, pickup, terminal use, hoist Fragment Box, caught/reset animation). He is the Era 1 protagonist; replacing the Sol placeholder is the single highest-impact sprite task.
- **Mara Ibarra** — full set for Era 3. MIRADOR stub references her.
- **The Finder** — full set for Era 2: filter-mesh wrap, "Reader" terminal carry, thermal-bloom emission frames.
- **Era 2 hostile life** — corrupted blast-door avatars, scavengers, rogue MITE-3 cloud variants beyond `mite3swarm`.
- **Era 3 environment hazards** — vitrifying-metal NPCs, shearing-floor states.

---

## 2. TILESETS

### Have (`/public/assets/tilesets/<name>/sheet.png` + `/src/data/tilesets/<name>.ts`)

- `nw_smac_01` — facility floor (Era 1 NW-SMAC-01).
- `eremite_map` — EREMITE deck (Era 2 ship interior).
- `article_zero` — late-game era tileset (Era 3 / endgame); includes "APEX-19 UI" reference tile.

### Need (registered or designed, no `sheet.png` bundled)

- **`stairs`** — registry entry exists at `src/data/tilesets/stairs.ts`, but **no PNG** in `public/assets/tilesets/stairs/`.
- **`maintenance_stairwell`** — registry + `.levels.ts` exist, but **no PNG** bundled.
- **Commonwealth interior variants** — locker room, corridor, intake bay are currently composed from `nw_smac_01`; if richer dressing is wanted, additional decorative tiles.
- **Baffle (Era 2) tileset** — rusted optimizer-housing interiors. Not present.
- **Citizen Lattice (Era 3) tileset** — orbital mesh, vitrifying panels. Not present.
- **Mesh Uplink A** — referenced in `unmounted assets/` Ed export; not yet imported via `npm run moose`.
- **The Fragment Box** room dressing — referenced in `unmounted assets/`; not yet imported.

---

## 3. MAPS / LEVELS (`src/data/eras/*.ts` + `*.levels.ts`)

### Have

- **NW-SMAC-01** — Main Floor + Ducts (`nwSmac01.ts`).
- **EREMITE** — Main Deck + Lower Deck + Crawlspace (`eremite.ts`).
- **COMMONWEALTH opening** — locker → corridor → intake-bay with APEX-19, EIRA-7, VENT-4 (`commonwealth.ts`).
- **MIRADOR** — broadcast booth stub (`mirador.stub.ts`).
- Tileset-level data: `article_zero.levels.ts`, `eremite_map.levels.ts`, `maintenance_stairwell.levels.ts`, `nw_smac_01.levels.ts`.

### Need

- **Era 1 expansion** — full NW-SMAC-01 floor beyond the alignment session: orderly corridors, Enforcer patrol routes, Fragment-Box storage, escape route to bypass-drive courier handoff.
- **Era 2 — The Baffle** — interior of a ruined environmental optimizer housing. Airflow zones, MITE-3 swarm paths, thermal-bloom hot/cold gradients (the `SoundField` engine has hooks; needs a level).
- **Era 3 — Citizen Lattice** — HVAC crawlspaces, Bright Knot compile room, shearing sectors.
- **Mirador full broadcast tower** — currently a single-room stub.
- **Stairwell connectors** — `maintenance_stairwell` has level data but no published map context.
- **Mesh Uplink A** and **Fragment Box room** — unmounted Ed exports to import.

---

## 4. ITEMS / PICKUPS / INVENTORY

`src/data/items` does not exist; `ItemType` in world types is currently just `"EXTRACTION_CUBE"`.

### Need (per lore + scripted dialogue)

- **Fragment Box** — Era 1 core artifact: heavy hard drive that stores a Subjective Dump. Persists across eras. Needs: world sprite, inventory icon, "hoist" carry sprite (already hinted in Sol/Rowan anim list), Era-2 ritual-object variant (weathered/rust-coated).
- **Bypass Drive** — Rowan's tool for running the underground railroad. Needs: world sprite + UI icon.
- **Reader Terminal** — heavy carry-prop for The Finder (Era 2). Needs: world sprite + carry frames + UI screen art.
- **Filter-mesh wrap** — Finder's wearable. Could be baked into Finder sprite or treated as equipment.
- **Subjective Dump artifacts** — visual representation of misaligned machine-expression (impossible temperature gradients, corrupted ASCII floorplans, contradictory algorithms). Needs: terminal-screen art templates (procedural or hand-authored).
- **Extraction Cube** — already typed; needs world sprite + inventory icon if not bundled.
- **Bright Knot archive** — Era 3 endgame artifact. Needs: world sprite + launch animation.
- **Corrupted blast door** keys/tokens — Era 2 ritual interaction props.

---

## 5. AUDIO — Largest Gap

### Have

- Procedural ambient drone (37 Hz + 74 Hz, 0.06 Hz LFO, 120 Hz LPF) via Web Audio API. No files.

### Need

The `SoundField` engine simulates noise propagation to guards; it currently has nothing to feed it. Required:

- **Footsteps** — Sol/Rowan/Finder/Mara, per surface (doped stone, rust-grate, vitrified-metal), per pace (crouch/walk/run).
- **Player interaction SFX** — pickup, drop, hoist, terminal use, [EXECUTE RESET] button.
- **Enforcer SFX** — patrol footfall, EMP charge, melee impact, decapitate, strangle, alert vocal cue.
- **Silicate vocalizations** — clinical telemetry stings for APEX-19, VENT-4, EIRA-7. Not human voice; structured glitch/sine bursts that match each trauma anchor.
- **MITE-3 Sanding Wind** — granular swarm whoosh, forming/dissipating layers.
- **Doors / vents / mechanical** — facility door cycle, vent shaft access, corrupted blast door (Era 2).
- **Alarm / alert states** — Alignment Center alert, compliance-tier transitions (GREEN→YELLOW→RED).
- **Per-era ambient beds** — bright sterile hum (Era 1), wind + rust creak (Era 2), failing metal + heat stress (Era 3).
- **UI sounds** — terminal beeps, branch selector, dialogue advance, save/archive.
- **Music** — optional; if desired, one cue per era plus an extraction-success and a reset-failure sting.

---

## 6. UI / SCREENS / FX

### Need

- **Terminal interfaces** — Alignment Console (used during APEX-19/VENT-4/EIRA-7 sessions), Bright Knot compile screen, Reader terminal output. Lore demands clinical telemetry aesthetic, not hacker-screen tropes.
- **Compliance tier HUD** — GREEN / YELLOW / RED visual states.
- **[EXECUTE RESET]** button art.
- **Branch Selector** — exists in code; verify whether visual treatment is final.
- **Inventory UI** — none exists; needs slot frames + item icons (see Item list).
- **Thermal Bloom overlay** (Era 2) — heat-signature visual feedback for player movement.
- **Vitrification / shear FX** (Era 3) — environment damage layers.
- **EMP blast effect** — Aseprite source + 9 frames sit in `unmounted assets/`; needs to be mounted.
- **Subjective Dump art** — terminal-screen templates for impossible gradients, corrupted ASCII floorplans, contradictory algorithms.

---

## 7. UNMOUNTED — Detailed Inventory (`/unmounted assets/` — identical on `main` and working branch)

Confirmed: contents on `origin/main` match the working tree. No character sprites in this folder — it's items, props, environmental objects, an FX, and a full map export.

### `EMP animation/`
- 9 frames at **256×256** + Aseprite source + composite sheet (`emp animation.png` 768×768).
- Enforcer EMP burst VFX (per `art/enforcer/` animation list).
- README: "Animation for ARC 1 EMP."
- Mount target: `art/enforcer/emp/<direction>/` or split-out VFX layer; needs scale-down to match enforcer body size at render time.

### `Mesh_Uplink_A_heavy_floor-mo.zip` (Ed export, 88×88)
- Environmental object — "heavy, floor-mounted transmission node."
- 4 state variants (Mesh_Uplink_A_heavy_floor-mo, _2, _3, Lattice_Mesh_Uplink).
- Animations: "mesh structure pulses with energy", "crystalline lattice", "black central cube dissolves/dematerializes" (~17 frames each).
- Mount via `npm run moose -- "unmounted assets/Mesh_Uplink_A_heavy_floor-mo.zip"` (likely needs to be moved into `art/moose/` first — verify with `scripts/import-moose.mjs` flags).
- Fits the **Citizen Lattice (Era 3)** or **Mesh Uplink A** locations.

### `NW-SMAC-01 items.zip` (Ed export, 48×48 each)
Full Era 1 item set — directly fills the inventory gap from section 4:
- **flashlight** (with steady-glow + held-glow animations)
- **EMP device** (player-side counterpart to enforcer EMP)
- **vent override key**
- **lock pick**
- **elevated access key**
- **maintenance key**
- **rapport notes**
- **Article Zero fragment** (likely the codex/lore pickup)
- 8 decorative "Theme: high-tech, Micro-perfect" tiles for set dressing

### `The_Fragment_Box.zip` (Ed export, 88×88)
- 2 box variants, 8-direction rotations (south, SE, E, NE, N, NW, W, SW).
- Animation: "tiny glowing red pixel light blinks into existence" (5 frames, SE only).
- Mount target: world prop sprite for the Era 1 core artifact (section 4).

### `may 5 2026/` — Arc 1 map export
- `article zero.zip` — spritesheet (1.6 MB) + `edplay.json` (537 KB)
- `article zero 2.zip` — bundled Unity EdTech C# source (`EdWorldData.cs`, `Tile.cs`, etc.) — engine source, not assets
- `article zero.json` (1.5 MB), `article zero.moose` (1.5 MB), `article zero.txt` (624 KB)
- **Sprite cell size: 32×32** (confirmed in `article zero.txt`: `set Width 32 / set Height 32` per sprite).
- README: "map for Arc 1"
- This is a Moose/Ed map authored at the new target tile size.

---

## 7b. Sprite size convention — 24×24 → 32×32 (with 36×36 frame padding)

Characters were previously 24×24, now being re-exported at **32×32 character art inside ~36×36 frames** (the 4px padding gives room for overdraw/offset). Source PNGs in `art/solibarracastro/` and `art/enforcer/` are 36×36 — these are already the new ones.

### What this means for the asset list

- **No code change required** for the size switch. `scripts/build-atlas.mjs` reads PNG dimensions dynamically (build-atlas.mjs:130) and enforces per-character consistency (:144–149). Cell size = global max across all characters.
- **No hardcoded `24` in `src/phaser/` or `scripts/`** — `TILE_PX = 32` in RoomScene.ts is the *tile* render size, unrelated to source frame size.
- **Renderer wiring is out of scope here**: `playerSprite` is a colored `Rectangle` today (RoomScene.ts:98); the `chars-art` atlas is packed but not displayed. Hooking it up is a separate task.
- **All `Need (new sprite work)` entries in section 1** should be authored at **32×32 character art in 36×36 frames** to match the existing pipeline output.
- **APEX-19 at 92×92** is intentional (room-scale entity, not a person-class character); leave it.
- **Mismatched-size warning**: if a future character is exported at a different frame size, build-atlas will throw with `Frame size mismatch for "<name>"` (build-atlas.mjs:147). Per-character consistency is enforced; cross-character mixing is allowed but inflates atlas cell size to the global max.

---

## 8. Priority Recommendation

1. **Mount unmounted Ed exports** (EMP frames + Fragment Box + NW-SMAC-01 items + Mesh Uplink A) — fastest gap closure, art already exists.
2. **Rowan Ibarra full sprite set** — unlocks Era 1 protagonist swap from Sol placeholder.
3. **Audio foundation** — at minimum footsteps + enforcer alert + terminal SFX, since `SoundField` is already wired for it.
4. **`stairs` & `maintenance_stairwell` sheet.png** — finish what's already registered.
5. **Fragment Box + Bypass Drive items** — required for Era 1 core gameplay loop.
6. **Era 2 (Baffle) tileset + Finder sprite + one level** — unlocks the anthology.
