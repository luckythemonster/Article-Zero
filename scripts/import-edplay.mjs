// import-edplay.mjs — ingest a glyph/colour-mode project exported from Ed.
//
// Usage:
//   node scripts/import-edplay.mjs <path/to/project.zip|edplay.json>
//
// Unlike `import-moose.mjs` (which expects a uniform sprite atlas and resolves
// each painted tile to a Phaser frame index), this importer handles Ed projects
// authored in glyph/colour mode: TileDefs carry a `Char`, a `BackgroundColor`
// and a semantic `Ref` ("floor", "wall", "door1", "enforcerpatrolarea1", …) but
// NO sprite keyframes. There is no usable tile→sprite mapping, so these maps are
// meant to render with the engine's built-in TileKind renderer (RoomScene's
// `drawTile`), not a moose decoration overlay.
//
// Output is a `MooseLevel[]` (reusing the existing type) where each painted cell
// stores a stable per-Ref CODE (1-based) instead of a frame index, plus a
// `*_REFS` code→ref table so era builders can tell painted cells apart on a
// single layer (e.g. enforcer-area vs drone-area cells on an "enemies" board).

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src/data/tilesets");

function die(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

function slugify(label) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) die(`could not slugify project label "${label}"`);
  if (/^[0-9]/.test(slug)) return `t_${slug}`;
  return slug;
}

function tsLiteral(value) {
  return JSON.stringify(value, null, 2);
}

async function readEdplay(input) {
  if (input.toLowerCase().endsWith(".json")) {
    return { ed: JSON.parse(await fs.readFile(input, "utf8")), tmp: null };
  }
  const tmp = await fs.mkdtemp(path.join(ROOT, ".edplay-tmp-"));
  const r = spawnSync("unzip", ["-o", "-q", input, "-d", tmp], { stdio: "inherit" });
  if (r.status !== 0) die(`unzip failed for ${input}`);
  const files = [];
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else files.push(full);
    }
  };
  await walk(tmp);
  const jsonFile = files.find((f) => f.toLowerCase().endsWith("edplay.json"));
  if (!jsonFile) die("edplay.json not found in zip");
  return { ed: JSON.parse(await fs.readFile(jsonFile, "utf8")), tmp };
}

function buildLevels(ed) {
  // Global Ref table: each TileDef Handle → stable 1-based code; code → Ref.
  const codeByHandle = new Map();
  const refByCode = {};
  let nextCode = 1;
  for (const td of ed.TileDefs ?? []) {
    if (td.Handle == null) continue;
    const code = nextCode++;
    codeByHandle.set(td.Handle, code);
    refByCode[code] = td.Ref ?? `tiledef-${td.Handle}`;
  }

  const rawLevels = ed.Levels ?? [];
  const levels = [];
  for (const lv of rawLevels) {
    const boards = lv.Boards ?? [];
    if (boards.length === 0) continue;
    let width = 0;
    let height = 0;
    for (const b of boards) {
      width = Math.max(width, b.Width ?? 0);
      height = Math.max(height, b.Height ?? 0);
    }
    if (!width || !height) continue;

    const layers = boards.map((b) => {
      const grid = Array.from({ length: height }, () => new Array(width).fill(0));
      for (const t of b.Tiles ?? []) {
        const x = t.X ?? 0;
        const y = t.Y ?? 0;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        // Unknown handles still mark presence (code 0 is "empty", so fall back
        // to a sentinel high code that maps to "unknown" — keeps cell painted).
        grid[y][x] = codeByHandle.get(t.Handle) ?? -1;
      }
      return { name: b.Name ?? "board", opacity: b.Opacity ?? 1, data: grid };
    });

    // Auto-crop to the union paint bbox across all layers (mirrors import-moose).
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (const ly of layers) {
      for (let y = 0; y < ly.data.length; y++) {
        for (let x = 0; x < ly.data[y].length; x++) {
          if (ly.data[y][x] === 0) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0 && (minX > 0 || minY > 0 || maxX < width - 1 || maxY < height - 1)) {
      for (const ly of layers) {
        ly.data = ly.data.slice(minY, maxY + 1).map((row) => row.slice(minX, maxX + 1));
      }
      width = maxX - minX + 1;
      height = maxY - minY + 1;
    }

    levels.push({
      name: lv.Name ?? "level",
      width,
      height,
      tileSize: ed.TileWidth ?? 32,
      spacing: 0,
      layers,
    });
  }
  return { levels, refByCode };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) die("usage: node scripts/import-edplay.mjs <project.zip|edplay.json>");
  const input = path.resolve(argv[0]);
  if (!existsSync(input)) die(`not found: ${input}`);

  const label = path.basename(input).replace(/\.(zip|json)$/i, "");
  const slug = slugify(label);
  const ident = slug.toUpperCase();

  const { ed, tmp } = await readEdplay(input);
  try {
    const { levels, refByCode } = buildLevels(ed);
    if (levels.length === 0) die("no levels with painted boards found");

    const body =
      `// AUTO-GENERATED by scripts/import-edplay.mjs from ${path.relative(ROOT, input)}.\n` +
      `// Glyph/colour-mode Ed export: cell values are per-Ref CODES (see ${ident}_REFS),\n` +
      `// not sprite-frame indices. Rendered by the engine's built-in TileKind renderer.\n` +
      "\n" +
      'import type { MooseLevel } from "./types";\n' +
      "\n" +
      `export const ${ident}_REFS: Record<number, string> = ${tsLiteral(refByCode)};\n` +
      "\n" +
      `// @ts-ignore — large generated literal exceeds TS union complexity; runtime types are correct.\n` +
      `export const ${ident}_LEVELS: MooseLevel[] = ${tsLiteral(levels)};\n`;

    const outPath = path.join(DATA_DIR, `${slug}.levels.ts`);
    await fs.writeFile(outPath, body);

    console.log(`imported (glyph mode): ${label}`);
    if (slug !== label) console.log(`  slug:    ${slug}`);
    console.log(`  out:     ${path.relative(ROOT, outPath)}`);
    for (const lv of levels) {
      const painted = lv.layers.map((l) => `${l.name}=${l.data.flat().filter((c) => c !== 0).length}`).join(", ");
      console.log(`  level "${lv.name}" ${lv.width}x${lv.height}  [${painted}]`);
    }
    console.log(`  refs:    ${Object.keys(refByCode).length}`);
  } finally {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
