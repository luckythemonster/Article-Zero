# Article Zero — Claude Agent Instructions

## Identity
- **Game**: Sci-fi tactical stealth/bureaucratic horror (turn-based)
- **Engine**: Phaser 4 + React 19 + TypeScript (Node 20+)
- **Build**: Vite with source maps enabled
- **State**: Zustand + headless game engine

## Code Requirements

### TypeScript Strictness
```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"noUncheckedSideEffectImports": true
```

**Conventions:**
- Disable `@typescript-eslint/no-explicit-any` only when absolutely necessary (document why)
- Use `argsIgnorePattern: "^_"` for intentionally unused parameters
- Import order: deps → types → local modules

### React + Phaser Patterns
- **React**: UI layer only (terminal, archive, settings, dialogs)
- **Phaser**: Rendering, input, scene management
- **State**: Zustand for shared mutable state
- **Hooks**: Prefer `useCallback`, `useMemo` for expensive operations
- **No direct DOM manipulation** in Phaser scenes

## Project Structure

```
src/
├── engine/              # Headless game state, FOV, turn loop, save/archive
├── phaser/              # Phaser 4 scenes (boot, branch selector, gameplay)
├── components/          # React UI layers
├── hooks/               # React input + responsive hooks
├── data/                # Maps, dialogue, document templates, entity definitions
├── audio/               # Sound systems
├── types/               # Shared TypeScript interfaces
└── main.tsx             # Vite entry point

public/assets/
├── tilesets/            # Ed/Moose imports → spritesheet + frame registry
└── sprite_pack/         # Character art atlases (generated from art/)

art/
├── <character>/         # Sprite frames (PNGs in subdirs by animation/direction)
└── moose/               # Ed - Game Tile Editor exports (.zip)

lore/                    # Reference documents (PDFs + MASTER.md index)
```

## Asset Pipelines

### Character Art
**Input:** `art/<character>/<animation>/<direction>/NN.png`  
**Command:** `npm run art`  
**Output:** 
- `public/assets/sprite_pack/chars-art.{png,json}`
- `src/data/char-anims.generated.ts`

Constraints:
- All frames for a character must share width/height (36×36 standard)
- Filenames: zero-padded indices (`01.png`, `02.png`, …)
- Directions: exactly `south`, `north`, `east`, `west`
- Animation keys: `<character>_<animation>_<direction>`

Optional `art/<character>/meta.json` for per-animation frame rates/repeat.

### Tile-Based Levels (Ed)
**Input:** Ed - Game Tile Editor exports (.zip)  
**Command:** `npm run moose -- art/moose/<name>.zip`  
**Output:**
- `public/assets/tilesets/<name>/sheet.png`
- `src/data/tilesets/<name>.ts` (typed frame registry)
- `src/data/tilesets/<name>.levels.ts` (level data, if included)

Tile size: 32×32 with 1px gutter.

**Layer names** map to gameplay semantics:
- `floor`, `walls`, `doors` → collision/walkability
- `terminals`, `vent_control`, `shared_field` → interactive objects
- `light_sources`, `article_zero`, `lattice_exit` → mechanic triggers
- `shadows`, `objects` → decoration (no gameplay effect)
- `spawn` → player start position (first non-zero cell)

Order: Render priority is **name-driven**, not Ed-export-order-driven.

### Dialogue & Data
Scripts live in `src/data/` as TypeScript modules. Structure for:
- Entity definitions (NPCs, enforcers, items)
- Dialogue trees (scripted by default)
- Level seeds and era initialization
- Document templates for the Archive

## Development Workflow

```bash
nvm use                   # Pin Node 20
npm install
npm run dev               # Start Vite on http://localhost:5173
npm run typecheck         # TS without emit
npm run lint              # ESLint
npm run build             # tsc -b + vite build (production)
npm run preview           # Preview build locally
```

### Optional: Live LLM Dialogue
Copy `.env.example` → `.env.local`, set `VITE_ANTHROPIC_API_KEY`.  
Toggle in-game in Settings menu to enable Claude API calls for NPC responses.

## Common Tasks

### Adding a New NPC
1. Create sprite frames: `art/<npc-id>/<animation>/<direction>/NN.png`
2. Run `npm run art` to generate animation registry
3. Author NPC data in `src/data/entities/` or relevant era module
4. Wire into scene spawn or dialogue scripts
5. Renderer auto-picks up `<npc-id>_idle_<facing>` if it exists

### Adding an Interactive Object
1. Define in tile layer (e.g., `terminals`, `doors`)
2. Handle in engine's turn loop or input system
3. Wire UI response (Archive for terminals, state change for doors)

### Debugging State Issues
- Game state is **immutable**; mutations must go through engine functions
- Check Zustand store in browser DevTools
- FOV and turn loop live in `/engine`; trace there for logic bugs
- Phaser scene logs: check browser console for sprite/input errors

## Performance & Constraints

- **Sprite atlas**: Single atlas per character; don't bloat with unnecessary animations
- **Immutability**: Engine state must never mutate; use spread operators
- **Turn loop**: Headless, independent of Phaser render loop
- **Save/Load**: Serialized via `/engine/archive`; test round-trip integrity

## Reference

- **Lore documents**: `/lore/MASTER.md` indexes the canon PDFs
- **Art docs**: `/art/README.md` (character frames + Ed level conventions)
- **Config**: Node 20+ required; see `.nvmrc` and `.devcontainer/`
- **Build**: Vite 6, TypeScript 5.7, React 19, Phaser 4

## Quick Links

| Task | Command |
|------|---------|
| Start dev | `npm run dev` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Repack art | `npm run art` |
| Import Ed level | `npm run moose -- art/moose/<name>.zip` |
| Production build | `npm run build` |

---

**When extending the codebase:**
1. Maintain TypeScript strictness
2. Keep engine headless (no Phaser dependencies in `/engine`)
3. React UI is UI-only; game state lives in Zustand + engine
4. Check ESLint before commit
5. Consult `/lore/MASTER.md` for context (don't guess lore details)
