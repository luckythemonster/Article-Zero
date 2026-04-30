// import-moose.mjs — ingest a project exported from Ed (Chilling Moose).
//
// Usage:
//   npm run moose -- art/moose/<project>.zip
//
// The zip must contain a single edplay.json (SpriteForge format) and one or
// more PNG sprite sheets. v1.5 only renders sheet 0; multi-sheet exports
// emit a warning. Every run also rewrites src/data/tilesets/registry.generated.ts
// so BootScene's preload list stays in sync with whatever's been imported.

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TILESETS_DIR = path.join(ROOT, "public/assets/tilesets");
const DATA_DIR = path.join(ROOT, "src/data/tilesets");
const REGISTRY_PATH = path.join(DATA_DIR, "registry.generated.ts");
const ART_MOOSE_DIR = path.join(ROOT, "art/moose");

function die(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

function unzipTo(zip, dest) {
  const r = spawnSync("unzip", ["-o", "-q", zip, "-d", dest], { stdio: "inherit" });
  if (r.status !== 0) die(`unzip failed for ${zip}`);
}

async function listFiles(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await listFiles(full));
    else out.push(full);
  }
  return out;
}

function projectNameFromZip(zip) {
  return path.basename(zip).replace(/\.zip$/i, "");
}

function inferStride(spritesXY) {
  // Ed exports an explicit width/spacing per sprite, but they all share a
  // single value within a sheet. Cheapest read: take the smallest non-zero
  // gap between adjacent X coords on row 0.
  const xs = spritesXY
    .filter((s) => (s.Y ?? 0) === 0)
    .map((s) => s.X ?? 0)
    .sort((a, b) => a - b);
  let stride = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0 && (stride === 0 || d < stride)) stride = d;
  }
  return stride || 33; // fallback to the convention used by stairs.zip
}

function buildFrames(sprites, stride, frameSize, sheetWidth) {
  // Coerce each sprite to a 0-based index and dedupe collisions deterministically.
  const byIndex = new Map();
  for (const s of sprites) {
    const x = s.X ?? 0;
    const y = s.Y ?? 0;
    if (y !== 0) continue; // single-row sheets only in v1.5
    if (x + frameSize > sheetWidth) continue; // skip clipped synthetic frames
    const idx = Math.round(x / stride);
    if (idx < 0) continue;
    if (byIndex.has(idx)) continue;
    byIndex.set(idx, { ref: s.Ref ?? null, brush: s.SpriteBrushId ?? null });
  }
  const max = Math.max(-1, ...byIndex.keys());
  const out = [];
  for (let i = 0; i <= max; i++) {
    const f = byIndex.get(i);
    out.push({ index: i, ref: f?.ref ?? null, brush: f?.brush ?? null });
  }
  return out;
}

function extractLevels(rawLevels, defaultTileSize, defaultSpacing) {
  // Ed's level shape isn't fully documented — we tolerate either flat
  // `{ Name, Width, Height, Layers: [{ Name, Data, Opacity }] }` or
  // a similar PascalCase variant. Empty / missing fields fall back to safe
  // defaults; v1.5 simply skips levels we can't parse.
  if (!Array.isArray(rawLevels)) return [];
  const out = [];
  for (const lv of rawLevels) {
    const name = lv.Name ?? lv.name ?? "level";
    const width = lv.Width ?? lv.width;
    const height = lv.Height ?? lv.height;
    const rawLayers = lv.Layers ?? lv.layers;
    if (!width || !height || !Array.isArray(rawLayers)) continue;
    const layers = [];
    for (const ly of rawLayers) {
      const lname = ly.Name ?? ly.name ?? "layer";
      const opacity = ly.Opacity ?? ly.opacity ?? 1;
      const data = ly.Data ?? ly.data;
      if (!Array.isArray(data)) continue;
      // Data can come back as either a flat array or 2D rows.
      let grid;
      if (Array.isArray(data[0])) {
        grid = data;
      } else if (data.length === width * height) {
        grid = [];
        for (let y = 0; y < height; y++) {
          grid.push(data.slice(y * width, (y + 1) * width));
        }
      } else {
        continue;
      }
      layers.push({ name: lname, opacity, data: grid });
    }
    if (layers.length === 0) continue;
    out.push({
      name,
      width,
      height,
      tileSize: defaultTileSize,
      spacing: defaultSpacing,
      layers,
    });
  }
  return out;
}

function tsLiteral(value) {
  // JSON.stringify produces valid TS object literals for our shapes.
  return JSON.stringify(value, null, 2);
}

async function loadExistingRegistry() {
  if (!existsSync(REGISTRY_PATH)) return [];
  const raw = await fs.readFile(REGISTRY_PATH, "utf8");
  const m = raw.match(/MOOSE_TILESETS:\s*MooseTilesetEntry\[\]\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return [];
  try {
    // The TS literal is plain JSON-shape; safe to eval-via-JSON if it parses.
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

async function writeRegistry(entries) {
  const body =
    "// AUTO-GENERATED by scripts/import-moose.mjs. Do not hand-edit.\n" +
    "// Each entry is preloaded by BootScene as a Phaser spritesheet so that\n" +
    "// any era's Floor.decoration can reference it by `key`.\n" +
    "\n" +
    'import type { MooseTilesetEntry } from "./types";\n' +
    "\n" +
    "export const MOOSE_TILESETS: MooseTilesetEntry[] = " +
    tsLiteral(entries) +
    ";\n";
  await fs.writeFile(REGISTRY_PATH, body);
}

async function main() {
  // Args after the npm run script delimiter
  const argv = process.argv.slice(2);
  if (argv.length === 0) die("usage: npm run moose -- <path/to/project.zip>");
  const zip = path.resolve(argv[0]);
  if (!existsSync(zip)) die(`not found: ${zip}`);

  const project = projectNameFromZip(zip);
  const tmp = await fs.mkdtemp(path.join(ROOT, ".moose-tmp-"));
  try {
    unzipTo(zip, tmp);

    const files = await listFiles(tmp);
    const jsonFile = files.find((f) => f.toLowerCase().endsWith("edplay.json"));
    if (!jsonFile) die("edplay.json not found in zip");
    const pngs = files.filter((f) => f.toLowerCase().endsWith(".png"));
    if (pngs.length === 0) die("no .png sheet in zip");
    if (pngs.length > 1) {
      console.warn(
        `warn: ${pngs.length} sprite sheets in zip — v1.5 imports only sheet 0 (${path.basename(pngs[0])})`,
      );
    }
    const sheetSrc = pngs[0];

    const ed = JSON.parse(await fs.readFile(jsonFile, "utf8"));
    const sheetMeta = (ed.SpriteSheets ?? [])[0];
    if (!sheetMeta || !Array.isArray(sheetMeta.Sprites)) {
      die("edplay.json: SpriteSheets[0].Sprites missing");
    }
    const sprites = sheetMeta.Sprites;
    const frameSize = sprites[0]?.Width ?? 32;
    const stride = inferStride(sprites);
    const spacing = stride - frameSize;
    if (spacing < 0) die(`bad stride/frameSize: ${stride} / ${frameSize}`);

    // Resolve sheet width by reading the PNG header (no jimp dep here —
    // PNG IHDR width is at bytes 16..19).
    const buf = await fs.readFile(sheetSrc);
    const sheetWidth = buf.readUInt32BE(16);
    const sheetHeight = buf.readUInt32BE(20);

    const frames = buildFrames(sprites, stride, frameSize, sheetWidth);
    const levels = extractLevels(ed.Levels, frameSize, spacing);

    // Lay out outputs
    const outDir = path.join(TILESETS_DIR, project);
    await fs.mkdir(outDir, { recursive: true });
    const sheetDest = path.join(outDir, "sheet.png");
    await fs.copyFile(sheetSrc, sheetDest);

    // src/data/tilesets/<project>.ts
    const dataPath = path.join(DATA_DIR, `${project}.ts`);
    const dataLines = [
      `// AUTO-GENERATED by scripts/import-moose.mjs from ${path.relative(ROOT, zip)}.`,
      `// Sheet: ${sheetWidth}x${sheetHeight}, frame ${frameSize}x${frameSize}, spacing ${spacing}.`,
      "",
      'import type { MooseSpriteFrame } from "./types";',
      "",
      `export const ${project.toUpperCase()}_TEXTURE_KEY = ${JSON.stringify(project)};`,
      `export const ${project.toUpperCase()}_FRAME_SIZE = ${frameSize};`,
      `export const ${project.toUpperCase()}_SPACING = ${spacing};`,
      "",
      `export const ${project.toUpperCase()}_FRAMES: MooseSpriteFrame[] = ${tsLiteral(frames)};`,
      "",
    ];
    await fs.writeFile(dataPath, dataLines.join("\n"));

    // Optional levels module
    if (levels.length > 0) {
      const levelsPath = path.join(DATA_DIR, `${project}.levels.ts`);
      const lvBody =
        `// AUTO-GENERATED by scripts/import-moose.mjs from ${path.relative(ROOT, zip)}.\n` +
        "\n" +
        'import type { MooseLevel } from "./types";\n' +
        "\n" +
        `export const ${project.toUpperCase()}_LEVELS: MooseLevel[] = ${tsLiteral(levels)};\n`;
      await fs.writeFile(levelsPath, lvBody);
    }

    // Registry
    const reg = await loadExistingRegistry();
    const filtered = reg.filter((e) => e.key !== project);
    filtered.push({
      key: project,
      path: `/assets/tilesets/${project}/sheet.png`,
      frameSize,
      spacing,
    });
    filtered.sort((a, b) => a.key.localeCompare(b.key));
    await writeRegistry(filtered);

    // Stash a copy of the zip under art/moose/ if it isn't already there
    await fs.mkdir(ART_MOOSE_DIR, { recursive: true });
    const artCopy = path.join(ART_MOOSE_DIR, path.basename(zip));
    if (path.resolve(zip) !== path.resolve(artCopy)) {
      await fs.copyFile(zip, artCopy);
    }

    console.log("imported:", project);
    console.log("  sheet:", path.relative(ROOT, sheetDest), `(${frameSize}px, spacing ${spacing})`);
    console.log("  frames:", frames.length, " levels:", levels.length);
    console.log("  registry:", path.relative(ROOT, REGISTRY_PATH));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
