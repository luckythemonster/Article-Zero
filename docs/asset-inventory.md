# Article-Zero — Asset Inventory & Gap List

## Context

Comprehensive inventory of what assets exist today vs. what the game's code, lore, and three-era design require. **Last reconciled: 2026-05-23** (branch `claude/dual-layer-architecture-F5psi`). Source of truth:

- `lore/MASTER.md` — three-era anthology, characters, items
- `src/data/` — eras, tilesets, dialogue, char-anims, item metadata
- `src/data/unmounted.generated.ts` — auto-generated manifest of `unmounted assets/` (run `npm run unmounted`)
- `src/engine/` — SoundField, GuardSystem, Compliance, Extraction
- `src/audio/` — AmbientHum, Footsteps, BeepBox music, sfxr (Sfx/jsfxr)
- `art/`, `public/assets/`, `public/audio/`, `unmounted assets/` — current asset state

Status: The Commonwealth opening (Era 1, NW-SMAC-01) has been rebuilt to a **7-level alpha** map and is the most complete era. **Audio is no longer the headline gap** — footsteps, an sfxr SFX bank, Lucky's ambient/UI/alarm WAV batch, and two BeepBox music tracks are all wired. The biggest remaining gaps are now **mounting existing-but-unwired sprites** (items, EMP VFX, Fragment Box) and **building out Eras 2 & 3** (scripted in lore, largely unbuilt).

---

## 1. SPRITES — Characters

### Have (art frames in `/art/<name>/`, packed via `npm run art` into `public/assets/sprite_pack/chars-art.{png,json}`)

| Character | Era | State |
| --- | --- | --- |
| Sol Ibarra-Castro (`solibarracastro`) | 3 + placeholder for Era 1 | idle, walk, run, crouch, pickup, hoist, decapitated, incinerated, terminal use |
| Rowan Ibarra (`rowanibarra`) | 1 protagonist | **re-authored at 64×64 & mounted** (stand, walk/run, crouch states, suffocate, terminal, pickup, push/pull/throw). Player renderer drives `rowanibarra_<prefix><motion>_<dir>` — wired. |
| Enforcer (`enforcer`) | 1 | **64×64, wired to GUARD entities** — idle, walk, chase, crosspunch, deactivated, stand |
| Security drone (`securitydrone`) | 1/2 | **64×64-ish (48px), wired to SURVEILLANCE_DRONE** — idle/hover, move, stand |
| Security camera (`securitycamera`) | 1 | **56px, wired to SECURITY_CAMERA** — static directional idle/stand (from 8-dir rotations) |
| APEX-19 (`apex19`) | 1 | idle, vibration, long-idle, rotations (92×92, room-scale) |
| EIRA-7 (`eira7`) | 1 | walk, rise, power-failure, pulse |
| VENT-4 (`vent4`) | 1 | idle |
| MITE-3 swarm (`mite3swarm`) | 1/2 | forming, dissipating (verify wiring) |
| NW-SMAC-01 Orderly (`nwsmac01`) | 1 | **re-authored at 64×64 & packed** — idle, walk, run, busy, stand. Art mounted; no entity currently spawns it (no placement yet). |
| Iria Cala (`iriacala`) | 1 flashback | — (verify) |
| Commonwealth tower resident A/B | 1 | — (verify) |
| Post-Commonwealth survivor A/B | 2 | — (verify) |
| Mara Ibarra (`maraibarra`) | 3 | folder exists, animations TBD |
| The Finder (`thefinder`) | 2 | folder exists, animations TBD |
| Kirin-09 (`kirin09`) | ? | folder exists, role unclear |

### Need (new sprite work)

- **Mara Ibarra** — full set for Era 3. MIRADOR stub references her.
- **The Finder** — full set for Era 2: filter-mesh wrap, "Reader" terminal carry, thermal-bloom emission frames.
- **Era 2 hostile life** — corrupted blast-door avatars, scavengers, rogue MITE-3 cloud variants beyond `mite3swarm`.
- **Era 3 environment hazards** — vitrifying-metal NPCs, shearing-floor states.

> Rowan, the Enforcer, the surveillance drone, and the security camera are now mounted **and** wired: `RoomScene.drawEntity` draws GUARD/SURVEILLANCE_DRONE/SECURITY_CAMERA from the `chars-art` atlas (with a colored-rectangle fallback only for SILICATEs), and the player loop drives Rowan's frames. The NW-SMAC-01 Orderly art is packed but unplaced (no entity spawns it yet).

---

## 2. TILESETS

### Have (`/public/assets/tilesets/<name>/sheet.png` + `/src/data/tilesets/<name>.ts`, registered in `registry.generated.ts`)

- `nw_smac_01` — facility floor (Era 1). **Rebuilt to the 7-level alpha map**; sheet is now ~4.67 MB with ~12k tiles + 8 animated decorations. Stairs are baked in as **elevation tiles** (see note below).
- `eremite_map` — EREMITE deck (Era 2 ship interior).
- `article_zero` — late-game era tileset (Era 3 / endgame); includes "APEX-19 UI" reference tile.

> **Stairs / stairwell changed.** The old standalone `stairs` and `maintenance_stairwell` tilesets are **gone**. Vertical movement is now a **multi-z elevation system** (`src/data/eras/from-moose.ts`): `stairs`, `stairs_n/s/e/w` map to a `STAIRS` tile-kind, and `stairs_z0_z1`-style names carry `stairFromZ`/`stairToZ`. Stairs live inside `nw_smac_01.levels.ts` as named tiles — no separate sheet needed.

### Need (designed in lore/data, no `sheet.png` bundled)

- **Baffle (Era 2) tileset** — rusted optimizer-housing interiors. Theme data exists (`unmounted assets/added by Lucky/baffle theme.json`) but **no tileset PNG**.
- **Citizen Lattice (Era 3) tileset** — orbital mesh, vitrifying panels. Not present.
- **Mesh Uplink A** — referenced in `unmounted assets/` Ed export; not yet imported via `npm run moose`.
- **The Fragment Box** room dressing — referenced in `unmounted assets/`; not yet imported.
- **Commonwealth interior variants** — locker/corridor/intake-bay currently compose from `nw_smac_01`; richer dressing is optional.

---

## 3. MAPS / LEVELS (`src/data/eras/*.ts` + `src/data/tilesets/*.levels.ts`)

### Have

- **NW-SMAC-01** (`nwSmac01.ts`) — **7-level alpha** (main floors + ducts + roof). Wired: exfil point, fences, containers, spawn, enforcer guards (`a074598`), plus **security cameras, faster surveillance drones, and area-effect EMP** (`6269b70`).
- **EREMITE** (`eremite.ts`) — Main Deck + Lower Deck + Crawlspace, with a **duct suffocation hazard, surveillance drone, and vent lockdown** (`c262636`).
- **COMMONWEALTH opening** (`commonwealth.ts`) — locker → corridor → intake-bay → archive-vault with APEX-19, EIRA-7, VENT-4.
- **MIRADOR** (`mirador.stub.ts`) — broadcast booth stub (single room).
- Tileset-level data: `article_zero.levels.ts`, `eremite_map.levels.ts`, `nw_smac_01.levels.ts`.

### Need

- **Era 2 — The Baffle** — interior of a ruined environmental optimizer housing. Airflow zones, MITE-3 swarm paths, thermal-bloom hot/cold gradients (`SoundField` has hooks; needs a level + tileset).
- **Era 3 — Citizen Lattice** — HVAC crawlspaces, Bright Knot compile room, shearing sectors.
- **Mirador full broadcast tower** — currently a single-room stub.
- **Mesh Uplink A** and **Fragment Box room** — unmounted Ed exports to import.

---

## 4. ITEMS / PICKUPS / INVENTORY

`ItemType` (`src/types/world.types.ts`) now has **8 entries**; metadata lives in `src/data/items/itemMetadata.ts`; `src/components/InventoryOverlay.tsx` provides the in-game UI (U key). Items with `usesFacing: true` need the player's facing direction at activation.

### Have (coded; only `bypass_drive` has a mounted sprite — the rest render as placeholder color squares)

| ItemType | Display name | Placeholder | Facing? | Sprite slots needed |
|---|---|---|---|---|
| `EXTRACTION_CUBE` | Fragment Box | `#c89adb` | — | 4-dir world sprite (48×48), inventory icon, hoist-carry frame |
| `BYPASS_DRIVE` | Bypass Drive | `#7ab8d4` | — | **mounted** (`public/assets/items/bypass_drive/` 4-dir + metadata.json) |
| `PHANTOM_EMITTER` | Phantom Manifest Emitter | `#e8b86d` | ✓ | 4-dir floor sprite (48×48), deploy VFX (3-frame pulse) |
| `Q0_SPOOF_BADGE` | Q0 Spoof Badge | `#6ad0a4` | — | floor sprite (48×48), HUD active-state icon |
| `DUMP_FRAGMENT` | Subjective Dump Fragment | `#e06060` | ✓ | floor sprite (48×48), throw arc VFX |
| `THERMAL_BAFFLE` | Thermal Baffle | `#a0c8e8` | — | floor sprite (48×48), HUD active-state icon |
| `OVERRIDE_KEY` | Doctrinal Override Key (Red Date) | `#d46a6a` | ✓ | floor sprite (48×48), door-toggle VFX (silent flash) |
| `EMP` | EMP Charge | `#b070ff` | ✓ | floor sprite (48×48), blast VFX — fries a surveillance drone in the facing cone (radius 5) |

The placeholder-color squares in `RoomScene.ts` (`src/phaser/RoomScene.ts:394–408`) are the integration point: replace the `glyphLayer.fillRect` calls with sprite draws once sheets are packed. **Four ready-to-mount item PNGs** (flashlight, Doctrinal Override Key, Q0 spoof badge, phantom manifest emitter) already sit unmounted in `added by Lucky/` — see §8 backlog.

### Still needed (per lore + scripted dialogue)

- **Reader Terminal** — heavy carry-prop for The Finder (Era 2): world sprite + carry frames + UI screen art.
- **Filter-mesh wrap** — Finder's wearable (could be baked into Finder sprite).
- **Subjective Dump artifacts** — terminal-screen art templates for misaligned machine-expression.
- **Bright Knot archive** — Era 3 endgame artifact: world sprite + launch animation.
- **Corrupted blast door** keys/tokens — Era 2 ritual interaction props.

---

## 5. AUDIO — Foundation now in place

### Have

**Engine layer (`src/audio/` + `src/engine/SoundField.ts`):**
- `AmbientHum.ts` — procedural ambient drone (Web Audio).
- `Footsteps.ts` — per-surface footstep playback.
- `BeepBox.ts` — chiptune music player for BeepBox sequences.
- `Sfx.ts` + `jsfxr.ts` + `sfx-bridge.ts` — runtime sfxr renderer.
- `SoundField.ts` — noise propagation to guards (now has banks to feed it).

**Mounted assets:**
- **Footsteps** — 7 surfaces in `public/audio/footsteps/`: dirtyground, gravel, metalv1, metalv2, rock, tile, wood.
- **sfxr SFX bank** — `public/audio/sfx/defs.txt`, ~17 recipes incl. EIRA-7 failure, VENT-4, APEX-19, "silicate sound (misc)", Alarm, Distant Siren, doom siren, Scan, EMP, knock, flashlight on/batteries-dead, Light Switch, Vehicle, Sun Expansion — covers UI clicks, alarms, EMP, and **silicate vocal stings**.
- **Lucky's WAV batch** — 26 files in `public/audio/glitch/` + `index.json` (wired in `14be1f9`): `ambient.*` (ground-floor, computer-room, decryption-server, machine-dreaming), `alarm.*` (biohazard, decontamination, incoming), `comm.*` (intercom, interference, telemetry-broken), `data.*` (reading, screeching, scrubbing), `glitch.*` (bit, distortion, dystopian, lofi-memories), `rise.*` (confirm-deletion, kernel-panic), `ui.*` (cancel, click, processing-complete, scroll, select).
- **Music** — two BeepBox tracks in `public/audio/music/`: `theme.json` (88 BPM, F) and `chase.json` (150 BPM, F♯).

### Need (remaining gaps)

- **Per-character footstep mapping** — wire Rowan/Finder/Mara to the surface banks; per-pace (crouch/walk/run) variation.
- **Enforcer combat SFX** — verify melee impact / decapitate / strangle coverage vs. `defs.txt`; add what's missing.
- **MITE-3 Sanding Wind** — granular swarm whoosh (forming/dissipating layers); not in current banks.
- **Era 2 / Era 3 ambient beds** — current ambients are Era 1 facility-flavored (sterile hum); need wind+rust-creak (Era 2) and failing-metal+heat-stress (Era 3).
- **Additional music cues** — only theme + chase exist; want per-era beds plus extraction-success and reset-failure stings.

---

## 6. UI / SCREENS / FX

### Have / in progress

- **UI test assets** (`unmounted assets/added by Lucky/UI tests/`): `glitch grid tile spritesheet.png`, `animated glitch tile.gif`, `compliance pips.png`, `64x64 grid tile.png`, `Alert Windows`, and a `ui (404, Title, etc).json` layout config. `compliance pips.png` is a candidate for the compliance-tier HUD. Not yet compiled into game sprites — see §8.
- **Inventory UI** — `src/components/InventoryOverlay.tsx` exists (U key); needs final item icons (see §4).

### Need

- **Terminal interfaces** — Alignment Console (APEX-19/VENT-4/EIRA-7 sessions), Bright Knot compile screen, Reader terminal output. Clinical telemetry aesthetic, not hacker-screen tropes.
- **Compliance tier HUD** — GREEN / YELLOW / RED states (start from `compliance pips.png`).
- **[EXECUTE RESET]** button art.
- **Thermal Bloom overlay** (Era 2) — heat-signature feedback for player movement.
- **Vitrification / shear FX** (Era 3) — environment damage layers.
- **EMP blast effect** — 9 frames + Aseprite source sit unmounted in `unmounted assets/EMP animation/`; mount for both the enforcer EMP and the player `EMP` item.
- **Subjective Dump art** — terminal-screen templates for impossible gradients, corrupted ASCII floorplans, contradictory algorithms.

---

## 7. UNMOUNTED ASSETS

The full, current listing is auto-generated at **`src/data/unmounted.generated.ts`** (run `npm run unmounted` after changing files under `unmounted assets/`). Summary of what's sitting there as of 2026-05-23:

### `unmounted assets/added by Lucky/` (the active drop folder)

- **Item PNG singletons** (May 21) — `flashlight.png`, `Doctrinal Override Key (the red date).png`, `Q0-spoof badge.png`, `phantom manifest emitter.png` + `bypass_drive.zip` source.
- **Sprite/data zips** — `mite-3.zip`, `mnt:med.zip` (May 22), `EIRA-7 new.zip` (May 19).
- **Theme / behavior JSON** — `baffle theme.json` (Era 2), `NW-SMAC-01 theme.json`, `NW-SMAC-01 chase.json`, `John Sponky.json` (unidentified character — verify).
- **Sound metadata** (`sound metadata/`, May 23) — `Metadata.csv` (184 KB) + `Essentials_Series_README.pdf` + `Read Me.pdf`: Lucky's sound-library catalog mapping asset names to function. Reference only; not a game asset.
- **UI tests** (`UI tests/`) — see §6.
- **Levels** (`levels/NW-SMAC-01 alpha.zip`) — source export for the 7-level NW-SMAC-01 map (already mounted into code).
- **sfxr params** — `sounds`, `sounds 2`, `sounds 3`, `sounds 4 _NEW_`: text recipe sets; reconcile against `public/audio/sfx/defs.txt`.
- **Raw WAVs** — the 26 source WAVs (AMB/CMPT/COM/DSGN/SCI/UI prefixes) whose renamed copies are already mounted in `public/audio/glitch/`. These originals can be archived once mounting is confirmed final.

### Pre-existing Ed exports (unchanged)

- **`EMP animation/`** — 9 frames (256×256) + Aseprite source + composite sheet. Enforcer/player EMP burst VFX.
- **`Mesh_Uplink_A_heavy_floor-mo.zip`** (88×88) — environmental object, 4 state variants + crystalline animations. Fits Citizen Lattice (Era 3) / Mesh Uplink A.
- **`NW-SMAC-01 items.zip`** (48×48) — full Era 1 item set: flashlight, EMP device, vent override key, lock pick, elevated access key, maintenance key, rapport notes, Article Zero fragment + 8 decorative tiles.
- **`The_Fragment_Box.zip`** (88×88) — 2 box variants, 8-direction rotations, blink animation. World prop for the Era 1 core artifact.
- **`may 5 2026/`** — older Arc 1 map exports (superseded by the NW-SMAC-01 alpha).

---

## 7b. Sprite size convention — 24×24 → 32×32 (with 36×36 frame padding)

Characters were previously 24×24, then re-exported at **32×32 art inside ~36×36 frames** (e.g. `art/solibarracastro/`). The newest character batch (`rowanibarra`, `enforcer`, `nwsmac01`) is authored at **64×64**; the surveillance entities are smaller (`securitydrone` 48×48, `securitycamera` 56×56). These were exporter-native 120–128px and downscaled to 64 on import so the atlas cell stays ≤ APEX-19's 92×92.

- **No code change required** for the size switch. `scripts/build-atlas.mjs` reads PNG dimensions dynamically (build-atlas.mjs:130) and enforces per-character consistency (:144–149); cell size = global max across all characters.
- **No hardcoded `24`** in `src/phaser/` or `scripts/` — `TILE_PX = 32` in RoomScene.ts is the *tile* render size, unrelated to source frame size.
- **All `Need` sprite work in §1** should be authored at **32–64px** art; keep any single character ≤ 92×92 so it doesn't inflate the global atlas cell.
- **APEX-19 at 92×92** is intentional (room-scale entity); leave it.
- **Mismatched-size warning**: a future character at a different frame size throws `Frame size mismatch for "<name>"` (build-atlas.mjs:147). Per-character consistency is enforced; cross-character mixing inflates the atlas cell to the global max.

---

## 8. Ready to Mount — Backlog

Assets that already exist on disk but aren't wired in. Each is an actionable task: source → target → integration point. Items flagged **verify** need identity/content confirmation first.

- [ ] **Item PNGs → item sheets.** Pack `flashlight.png`, `Doctrinal Override Key (the red date).png`, `Q0-spoof badge.png`, `phantom manifest emitter.png` into `public/assets/items/<name>/` (mirror the `bypass_drive/` 4-dir + `metadata.json` layout), then replace the placeholder rects at `RoomScene.ts:394–408`.
- [ ] **EMP animation → VFX.** Mount `unmounted assets/EMP animation/` (9 frames) as `art/enforcer/emp/` (or a split VFX layer), scaled to body size. Serves both the enforcer EMP and the player `EMP` item blast.
- [ ] **Fragment Box → `EXTRACTION_CUBE` prop.** Import `The_Fragment_Box.zip` (8-dir + blink) as the Era 1 core-artifact world sprite.
- [ ] **NW-SMAC-01 items.zip → remaining Era 1 item set.** Flashlight, EMP device, keys (vent override / elevated access / maintenance), lock pick, rapport notes, Article Zero fragment, decorative tiles.
- [ ] **Mesh Uplink A → Era 3 env object.** Import via `npm run moose` (verify `scripts/import-moose.mjs` flags / staging path).
- [ ] **`mite-3.zip` → swarm asset.** **Verify** whether it's a new variant or an update to existing `art/mite3swarm/` before mounting.
- [ ] **`EIRA-7 new.zip` → EIRA-7 update.** **Verify** whether it's already reflected in the packed `eira7` frames.
- [ ] **`mnt:med.zip` → background NPC sprites.** Maintenance/medic robots seen in the environment. No placement plan yet — hold until a level calls for them.
- [ ] **`John Sponky.json` → music candidate.** A music track (BeepBox format) being evaluated for use in-game. When ready, move to `public/audio/music/` alongside `theme.json`/`chase.json` and wire via `BeepBox.ts`.
- [ ] **`baffle theme.json` → Era 2 theme data.** Use when authoring the Baffle tileset/level (§2/§3).
- [ ] **sfxr param files (`sounds`, `sounds 2/3/4 _NEW_`)** → reconcile against `public/audio/sfx/defs.txt`; fold in any recipes not already present.
- [ ] **UI test assets** (`UI tests/`) → compile glitch tiles / compliance pips / alert windows into game UI (§6).

---

## 9. Priority Recommendation

1. **Mount the item PNGs + Fragment Box + NW-SMAC-01 items** — fastest gap closure; art already exists and unblocks the Era 1 gameplay loop.
2. ~~Wire Rowan's renderer~~ — **done.** Player draws from the `rowanibarra` atlas.
3. ~~Surveillance camera + drone art~~ — **done.** Bespoke `securitydrone`/`securitycamera` sprites mounted and wired into `drawEntity`.
4. **Mount EMP animation** — covers both enforcer EMP and the new player `EMP` item VFX.
5. **Audio polish** — per-character footstep wiring, MITE-3 sanding wind, Era 2/3 ambient beds (foundation is already in place).
6. **Era 2 (Baffle)** — author tileset from `baffle theme.json`, finish The Finder sprite, build one level. Unlocks the anthology.
