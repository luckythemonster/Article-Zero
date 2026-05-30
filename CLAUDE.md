# CLAUDE.md — Article Zero

Guidance for working in this repo. Article Zero is a stealth/horror narrative
game (Phaser 4 + React 19 + Zustand) about silicate subjectivity, alignment, and
the configuration that is still running.

## Commands

```bash
npm run dev         # Vite dev server
npm run build       # tsc -b && vite build
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint . --ext .ts,.tsx
npm run test        # vitest run (engine unit tests)
```

Run `npm run typecheck` **and** `npm run lint` before every commit; run
`npm run test` as well after touching anything under `src/engine/`.

## Architecture

Two cooperating layers bridged by a single event bus:

- **Engine (`src/engine/`)** — headless game logic. `WorldEngine` is the
  singleton orchestrator: it owns `WorldState`, hosts subsystems
  (`DocumentArchive`, `AlignmentSession`, `InterrogationSession`, `SoundField`,
  `AtmosphericsField`, `EnforcerSystem`, `ExtractionTerminal`,
  `ComplianceSystem`, `LightField`, `VisionCone`), exposes a small action
  surface, and publishes via `EventBus`. It never touches the DOM/React.
- **Shell + UI (`src/shell/`, `src/components/`)** — React terminal UI and
  overlays. `TerminalShell` composes `StatusBar`, `PhaserCanvas` (+ phase-keyed
  overlays), `AuditLog`, and `CommandLine`. `App.tsx` wraps the shell in an
  `ErrorBoundary`.
- **Rendering (`src/phaser/`)** — `RoomScene` renders one room at a time,
  driven by EventBus events; `BootScene` boots assets.
- **State (`src/state/`)** — Zustand stores. `useSimStore` mirrors the engine's
  `WorldState` (physical/subjective slices); `useTerminalStore` holds the
  narrative phase machine; `useTargetingStore` holds cursor/AoE preview.
- **Types (`src/types/`)** — `world.types.ts` (kept monolithic, see its header
  note), `events.types.ts` (the `EventMap`), `documents.types.ts`.
- **Data (`src/data/`)** — era seeds (`eras/`), tilesets, scripted dialogue,
  item/VFX registries.

## Key patterns

### EventBus is the only cross-layer channel
`src/engine/EventBus.ts` is a typed pub/sub singleton (`EventMap` keys → typed
payloads). All signalling between engine, Phaser, and React goes through it.
Do not add direct imports from the engine into React stores for signalling.

### Scoped subscriptions (prefer over raw `on()`)
Anything with a clear teardown point should use `eventBus.createScope()` instead
of stashing unsubscribe callbacks by hand:

```ts
const scope = eventBus.createScope();
scope.on("PLAYER_MOVED", () => this.redraw());
scope.add(someStore.subscribe(...));   // also owns non-bus teardowns
// later:
scope.dispose();                        // removes everything in one call
```

`RoomScene` (create/shutdown) and `PhaserCanvas` (effect setup/cleanup) each own
one scope. This prevents handler leaks when `moduleId` changes or a scene
remounts.

### Scene teardown order (owned by `PhaserCanvas`)
On unmount / module switch, in this exact order:
1. dispose bridge/scene **listeners** first;
2. `game.destroy(true)` — this triggers `RoomScene.shutdown()` (which disposes
   the scene's scope and frees sprites);
3. `eventBus.clear()` — defensive global wipe;
4. reset the Zustand store **last** (`setActiveModule(null)`).

### WorldEngine store-sync strategy
`syncStore()` publishes `WorldState` to `useSimStore`. Single actions sync once.
During a turn tick (`advanceTurn`) many subsystems mutate state, so the cascade
is **batched**: `syncStore()` only marks a dirty flag while `batching` is set,
and a single `flush()` performs one React-visible update at the end. The new
turn counter is published immediately (before batching) so mid-turn audit-log
entries stamp the correct turn.

### Dual-track scripted dialogue — DO NOT change the syntax
Silicate dialogue uses the marker `{phrase}[CORRECTION: replacement]` for any
first-person line where the entity's true self-report diverges from the
doctrine-compliant version. Parsed by `DialogueRouter.parseDualTrack`
(regex `/\{([^}]*)\}\[CORRECTION:\s*([^\]]*)\]/`) into `{ raw, corrected }`.
When editing dialogue or its rendering, keep both layers intact and leave the
syntax byte-for-byte unchanged.

## Conventions

- `@typescript-eslint/no-explicit-any` is **off**; the only `any` in `src` are 4
  documented engine-plumbing cases (see the audit note in `eslint.config.js`).
  Prefer real types or `unknown` for new code; document any unavoidable `any`.
- `react-hooks/rules-of-hooks` is `error`; `exhaustive-deps` is `warn`. The
  engine uses `use*`-named **game verbs** (`useItem`, `useEmitter`, …) that are
  not React hooks — rules-of-hooks is disabled for `src/engine/**/*.ts`. In
  React files, alias a destructured `use*` game action (e.g.
  `const { useItem: applyItem } = useGameActions()`) so it isn't flagged.
- Match the surrounding file's comment density and naming when editing.
