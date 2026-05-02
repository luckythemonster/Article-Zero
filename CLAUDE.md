# CLAUDE.md

Guidance for AI assistants working in this repository. For human
onboarding (install, scripts, layout) see `README.md` — this file
focuses on what an assistant needs in order to make changes safely.

## Project snapshot

Article Zero is a stealth/horror narrative game about silicate
subjectivity, alignment, and configuration — a ground-up Phaser 4
rebuild of the earlier Commonwealth project. The current build ships
the Commonwealth opening as an end-to-end vertical slice (NW-SMAC-01
floor 1) with Lattice and Mirador as teaser branches.

Stack: **Phaser 4** (renderer) + **React 19** (UI overlay) + **Vite 6**
(build) + **TypeScript 5.7 strict**. Node **20+** required (Vite 6
needs `globalThis.crypto.getRandomValues`). ES modules throughout
(`"type": "module"`).

## Commands

```bash
npm run dev         # Vite dev server on http://localhost:5173
npm run build       # tsc -b && vite build → dist/
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint . --ext .ts,.tsx
npm run preview     # vite preview --host 0.0.0.0
npm run art         # repack character sprites from art/ → atlas + generated TS
npm run moose -- art/moose/<name>.zip   # import an Ed level export
```

There is **no test suite**. Validation is: `npm run typecheck`,
`npm run lint`, and play-testing (`npm run dev`).

## Architecture (read this first)

Three layers, one bus:

1. **`src/engine/`** — headless game state and subsystems. Pure logic;
   never touches the DOM, React, or Phaser.
2. **`src/phaser/`** — Phaser 4 scenes. Pure renderers. Read
   `WorldEngine` state, subscribe to events, draw. Never own gameplay
   logic.
3. **`src/components/`** — React UI overlay (HUD, modals, menus).
   Subscribes to events, dispatches `WorldEngine` actions. Never
   mutates engine state directly.

The bridge between all three is the typed **EventBus**
(`src/engine/EventBus.ts`, event shapes in
`src/types/events.types.ts`). It is the *only* legal channel between
engine, Phaser, and React.

Key invariants:

- `WorldEngine` (`src/engine/WorldEngine.ts`) is a singleton and the
  sole source of truth for `WorldState`.
- Inputs flow: keyboard/touch → React hook → `worldEngine.move()` /
  `interact()` / `endTurn()` → state mutation → `eventBus.emit(...)` →
  Phaser redraws + React re-renders.
- To add a new cross-layer signal, extend `EventMap` in
  `src/types/events.types.ts` first; the bus's typing will then
  enforce correctness at every emit/subscribe site.

Subsystems live alongside `WorldEngine` and are reset on era init:
`DocumentArchive`, `AlignmentSession`, `StitcherTimer`, `EnforcerAI`,
`fov`, `SaveSystem`, `ArticleZeroMeta`, `MiradorPersona`,
`VentOptimizer`, `InsomniaSystem`, `TutorialDirector`,
`DialogueRouter`.

## Where things live

| Path | Purpose |
|---|---|
| `src/main.tsx` | React entry; mounts `<App />` at `#root`. |
| `src/App.tsx` | Composition root. Mounts Phaser into `#phaser-host` once, wires bus → modals. |
| `src/engine/WorldEngine.ts` | Singleton orchestrator + action API. |
| `src/engine/EventBus.ts` | Typed pub/sub. |
| `src/types/events.types.ts` | `EventMap` — extend here for new events. |
| `src/types/world.types.ts` | `WorldState`, `Entity`, `Tile`, `Vec3`, `SRP`. |
| `src/phaser/BootScene.ts` | Texture preload + animation registration. |
| `src/phaser/GameScene.ts` | Tile/glyph/FOV renderer. |
| `src/phaser/BranchSelectorScene.ts` | Era picker. |
| `src/components/` | React HUD/modals: `HUD`, `SidePanel`, `InterrogationTerminal`, `DocumentArchiveUI`, `SaveLoadMenu`, `SettingsMenu`, `Vent4Modal`, `TouchControls`, etc. |
| `src/hooks/` | `useInput`, `useGameActions`, `useMobile`. |
| `src/data/eras/` | Era seed functions (`commonwealth.ts`, `lattice.ts`, `mirador.stub.ts`, `from-moose.ts`). |
| `src/data/tilesets/` | Generated Moose tileset registries (do not hand-edit `*.generated.ts`). |
| `src/data/scripted-dialogue/registry.ts` | Alignment-session scripts (dual-track syntax). |
| `src/data/char-anims.ts` | Hand-authored character animation metadata. |
| `src/audio/AmbientHum.ts` | Procedural ambient sound. |
| `public/assets/` | Static assets served at `/assets/...`. Generated atlas/tileset PNGs live here. |
| `art/` | Source PNG frames per character + Ed `.zip` exports under `art/moose/`. See `art/README.md`. |
| `lore/` | Seven canonical PDFs (reference material; not embedded at runtime). |
| `scripts/build-atlas.mjs` | Char-art packer (`npm run art`). |
| `scripts/import-moose.mjs` | Ed level importer (`npm run moose`). |
| `.devcontainer/devcontainer.json` | Codespaces / dev container (Node 20, port 5173). |

## Asset pipelines (do not hand-edit generated files)

Two pipelines produce committed artifacts. The generated files have
`.generated.ts` suffix or live under `public/assets/`. Always
regenerate via the script and commit the output rather than editing by
hand.

**Character sprites** — `npm run art`
- Reads `art/<character>/<animation>/<direction>/NN.png`.
- Writes `public/assets/sprite_pack/chars-art.{png,json}` and
  `src/data/char-anims.generated.ts`.
- Convention: `<character>` lowercase alphanumeric, `<direction>` is
  `south|north|east|west` (or omitted for flat anims), `NN.png` is
  zero-padded frame index. Optional `meta.json` per character for
  `frameRate`/`repeat` overrides. See `art/README.md`.

**Ed tilesets / levels** — `npm run moose -- art/moose/<name>.zip`
- Unpacks an Ed (Chilling Moose) export.
- Writes `public/assets/tilesets/<name>/sheet.png`,
  `src/data/tilesets/<name>.ts`, optional `<name>.levels.ts`, and
  updates `src/data/tilesets/registry.generated.ts`.
- Layer names carry gameplay semantics (`floor`, `walls`, `doors`,
  `terminals`, `spawn`, `vent_control`, …). Other layers
  (`shadows`, `objects`, …) render as pure decoration. Full table in
  `art/README.md`.

## Era / map authoring

Two parallel paths:

1. **Hand-written compact char grammar** — see
   `src/data/eras/commonwealth.ts`. 20×14 grid; `.` floor, `#` wall,
   `d` door, `T` terminal, etc.
2. **Ed-imported tilemap** — author in *Ed - Game Tile Editor* (32×32
   tiles, 1 px gutter), drop the export at `art/moose/<name>.zip`,
   run `npm run moose -- art/moose/<name>.zip`, then wire the
   resulting seed into `src/data/eras/`.

## Dialogue

Default is **scripted and offline-playable**, in
`src/data/scripted-dialogue/registry.ts`. The dual-track syntax
`{raw}[CORRECTION: doctrine]` renders both versions side-by-side in
`InterrogationTerminal` — `raw` is the entity's authentic
self-report, `CORRECTION` is the alignment-compliant euphemism.

Optional **live LLM dialogue** is gated on `VITE_ANTHROPIC_API_KEY`
(build-time, exposed via the `VITE_` prefix) plus a Settings toggle.
Without the key, the Settings toggle stays disabled and the game uses
scripted dialogue only.

## TypeScript & lint conventions

- Strict mode, plus `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`. Prefix
  intentionally unused names with `_` to satisfy
  `@typescript-eslint/no-unused-vars`.
- `@typescript-eslint/no-explicit-any` is **off**. Pragmatic `any` is
  tolerated; prefer a real type when one is cheap.
- `react-hooks/rules-of-hooks` is `error`,
  `react-hooks/exhaustive-deps` is `warn`.
- ES modules; bundler module resolution; **no path aliases** —
  imports are relative.
- File naming:
  - React components: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Engine modules: `PascalCase.ts`
  - Type files: `*.types.ts`
  - Generated files: `*.generated.ts` (do not edit by hand)
- ESLint ignores `dist`, `node_modules`, and `vite.config.ts`.

## Environment

- `.env.example` documents the only env var:
  `VITE_ANTHROPIC_API_KEY` (optional, build-time). Copy to
  `.env.local` to enable LLM dialogue.
- Vite serves on `0.0.0.0:5173`, builds with `target: "es2022"` and
  `sourcemap: true`.
- `.devcontainer/` provides Node 20 + GitHub CLI + auto-`npm install`
  + port-5173 forwarding for Codespaces.
- `.nvmrc` pins Node 20.

## Branch policy

Per `README.md`, active feature work happens on
`claude/phaser4-lore-rebuild-chsHY`. Documentation work for this
session is on `claude/add-claude-documentation-zkjDZ`. Never push to
`main` without explicit instruction. Do not open PRs unless asked.

## Common task playbook

- **Add a new character animation** — drop frames into
  `art/<character>/<animation>/<direction>/NN.png`, run `npm run art`,
  commit the regenerated atlas + `char-anims.generated.ts`.
- **Add a new tile-based level** — Ed-export to
  `art/moose/<name>.zip`, run `npm run moose -- art/moose/<name>.zip`,
  commit the generated tileset + level files, then add an era seed in
  `src/data/eras/` (or extend an existing one) that references them.
- **Add a new alignment-session script** — edit
  `src/data/scripted-dialogue/registry.ts` using the
  `{raw}[CORRECTION: doctrine]` dual-track syntax.
- **Add a new game event** — extend `EventMap` in
  `src/types/events.types.ts`, emit from `WorldEngine` (or the owning
  subsystem), then subscribe in `App.tsx` / the relevant Phaser scene
  / a React component as needed.
- **Add a new modal or HUD piece** — new component in
  `src/components/`, subscribe to the bus for its trigger event,
  dispatch state changes via `WorldEngine` actions (not direct
  mutation).
- **Add a new subsystem** — colocate in `src/engine/`, expose a
  singleton, register it in `WorldEngine.resetSubsystems()`, and
  publish state changes through the bus rather than exporting setters
  for React to call directly.
