# Article Zero

A stealth/horror narrative about silicate subjectivity, alignment, and the
configuration that is still running. Built on Phaser 4 + React 19 + Vite.

This repo contains the game code and the lore corpus (`/lore`). The game is a
ground-up rebuild of [Commonwealth](https://github.com/luckythemonster/Commonwealth),
deepened with material from the Article Zero lore.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:5173.

### Optional LLM dialogue

Dialogue is scripted by default and works fully offline. To enable live LLM
dialogue (Claude API), copy `.env.example` to `.env.local` and set
`VITE_ANTHROPIC_API_KEY`. Then enable the toggle in the in-game Settings menu.

## Layout

```
lore/                # The seven canonical lore PDFs
public/assets/       # Tileset, sprite atlas, UI sprites
src/
├── engine/          # Headless game state, FOV, turn loop, save, archive
├── phaser/          # Phaser 4 scenes (boot, branch selector, gameplay)
├── components/      # React UI (terminal, archive, save/load, settings…)
├── hooks/           # React input + responsive hooks
├── data/            # Maps, scripted dialogue, document templates
├── audio/           # Procedural ambient hum
└── types/           # Shared TypeScript types
```

## Vertical slice scope

The current build ships the **Commonwealth opening** end-to-end: a single
floor of NW-SMAC-01, one alignment session against APEX-19 via EIRA-7, the
VENT-4 / Iria Cala loss-function dilemma, the disputed-records UI, and a
foreshadowed Article Zero fragment. The Lattice and Mirador era branches are
present in the era selector but ship as teaser scenes.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — typecheck + production build
- `npm run typecheck` — TypeScript only
- `npm run lint` — ESLint
- `npm run preview` — preview a production build

## Branch

Active development happens on `claude/phaser4-lore-rebuild-chsHY`.
