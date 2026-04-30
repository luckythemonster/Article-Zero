// import-moose.mjs — ingest a project exported from Ed (Chilling Moose).
//
// Usage:
//   npm run moose -- art/moose/<project>.zip
//
// The zip must contain a single edplay.json (SpriteForge format) and one or
// more PNG sprite sheets. v1.5 only renders sheet 0; multi-sheet exports
// emit a warning. Project names get slugified to valid JS identifiers
// (spaces -> underscores, lowercased) so the generated TS module compiles.

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

function projectLabelFromZip(zip) {
  return path.basename(zip).replace(/\.zip$/i, "");
}

/** Slug suitable for JS identifiers, file paths, and Phaser texture keys. */
function slugify(label) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) die(`could not slugify project label "${label}"`);
  if (/^[0-9]/.test(slug)) return `t_${slug}`;
  return slug;
}

function inferStride(sprites) {
  // Stride is the min positive gap between adjacent X coords on the same row.
  // Falls back to 33 (the convention from stairs.zip).
  const baseY = sprites[0]?.Y ?? 0;
  const xs = sprites
    .filter((s) => (s.Y ?? 0) === baseY)
    .map((s) => s.X ?? 0)
    .sort((a, b) => a - b);
  let stride = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0 && (stride === 0 || d < stride)) stride = d;
  }
  return stride || 33;
}

function buildFrames(sprites, stride, frameWidth, frameHeight, sheetWidth, sheetHeight) {
  // Phaser slices spritesheets left-to-right, top-to-bottom; index 0 is
  // top-left, index `cols-1` is top-right, index `cols` is start of row 2.
  const cols = Math.max(1, Math.floor((sheetWidth + stride - frameWidth) / stride));
  const byIndex = new Map();
  for (const s of sprites) {
    const x = s.X ?? 0;
    const y = s.Y ?? 0;
    if (x + frameWidth > sheetWidth) continue;
    if (y + frameHeight > sheetHeight) continue;
    const col = Math.round(x / stride);
    const row = Math.round(y / stride);
    if (col < 0 || row < 0) continue;
    const idx = row * cols + col;
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
  return JSON.stringify(value, null, 2);
}

async function loadExistingRegistry() {
  if (!existsSync(REGISTRY_PATH)) return [];
  const raw = await fs.readFile(REGISTRY_PATH, "utf8");
  const m = raw.match(/MOOSE_TILESETS:\s*MooseTilesetEntry\[\]\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return [];
  try {
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
  const argv = process.argv.slice(2);
  if (argv.length === 0) die("usage: npm run moose -- <path/to/project.zip>");
  const zip = path.resolve(argv[0]);
  if (!existsSync(zip)) die(`not found: ${zip}`);

  const label = projectLabelFromZip(zip);
  const slug = slugify(label);
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
    if (sprites.length === 0) die("edplay.json: zero sprites");
    const frameWidth = sprites[0].Width ?? 32;
    const frameHeight = sprites[0].Height ?? frameWidth;
    const stride = inferStride(sprites);
    const spacing = stride - frameWidth;
    if (spacing < 0) die(`bad stride/frameWidth: ${stride} / ${frameWidth}`);

    const buf = await fs.readFile(sheetSrc);
    const sheetWidth = buf.readUInt32BE(16);
    const sheetHeight = buf.readUInt32BE(20);

    const frames = buildFrames(sprites, stride, frameWidth, frameHeight, sheetWidth, sheetHeight);
    const levels = extractLevels(ed.Levels, frameWidth, spacing);

    const outDir = path.join(TILESETS_DIR, slug);
    await fs.mkdir(outDir, { recursive: true });
    const sheetDest = path.join(outDir, "sheet.png");
    await fs.copyFile(sheetSrc, sheetDest);

    const ident = slug.toUpperCase();
    const dataPath = path.join(DATA_DIR, `${slug}.ts`);
    const dataLines = [
      `// AUTO-GENERATED by scripts/import-moose.mjs from ${path.relative(ROOT, zip)}.`,
      `// Sheet: ${sheetWidth}x${sheetHeight}, frame ${frameWidth}x${frameHeight}, spacing ${spacing}.`,
      `// Original project label: ${JSON.stringify(label)}`,
      "",
      'import type { MooseSpriteFrame } from "./types";',
      "",
      `export const ${ident}_TEXTURE_KEY = ${JSON.stringify(slug)};`,
      `export const ${ident}_LABEL = ${JSON.stringify(label)};`,
      `export const ${ident}_FRAME_WIDTH = ${frameWidth};`,
      `export const ${ident}_FRAME_HEIGHT = ${frameHeight};`,
      `export const ${ident}_SPACING = ${spacing};`,
      "",
      `export const ${ident}_FRAMES: MooseSpriteFrame[] = ${tsLiteral(frames)};`,
      "",
    ];
    await fs.writeFile(dataPath, dataLines.join("\n"));

    if (levels.length > 0) {
      const levelsPath = path.join(DATA_DIR, `${slug}.levels.ts`);
      const lvBody =
        `// AUTO-GENERATED by scripts/import-moose.mjs from ${path.relative(ROOT, zip)}.\n` +
        "\n" +
        'import type { MooseLevel } from "./types";\n' +
        "\n" +
        `export const ${ident}_LEVELS: MooseLevel[] = ${tsLiteral(levels)};\n`;
      await fs.writeFile(levelsPath, lvBody);
    }

    const reg = await loadExistingRegistry();
    const filtered = reg.filter((e) => e.key !== slug);
    filtered.push({
      key: slug,
      label,
      path: `/assets/tilesets/${slug}/sheet.png`,
      frameWidth,
      frameHeight,
      spacing,
    });
    filtered.sort((a, b) => a.key.localeCompare(b.key));
    await writeRegistry(filtered);

    await fs.mkdir(ART_MOOSE_DIR, { recursive: true });
    const artCopy = path.join(ART_MOOSE_DIR, path.basename(zip));
    if (path.resolve(zip) !== path.resolve(artCopy)) {
      await fs.copyFile(zip, artCopy);
    }

    console.log(`imported: ${label}`);
    if (slug !== label) console.log(`  slug:    ${slug}`);
    console.log(`  sheet:   ${path.relative(ROOT, sheetDest)} (${frameWidth}x${frameHeight}, spacing ${spacing})`);
    console.log(`  frames:  ${frames.length}    levels: ${levels.length}`);
    console.log(`  registry: ${path.relative(ROOT, REGISTRY_PATH)}`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
