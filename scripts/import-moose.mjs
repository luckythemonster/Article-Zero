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

// Build sprite-id resolvers shared between level extraction and tile-anim
// extraction. KeyFrame.SpriteId can be either a Ref string ("south1_0") or
// the sprite's numeric Handle serialised as a string ("2880196025").
//
// Hand-cropped frames in Ed often lack a Ref entirely, so we resolve
// Handles by computing the Phaser frame index directly from each sprite's
// X/Y coordinates rather than going through the Ref map.
function buildSpriteResolvers(sprites, frames, stride, frameWidth, frameHeight, sheetWidth, sheetHeight) {
  const refToIndex = new Map();
  for (const f of frames) if (f.ref) refToIndex.set(f.ref, f.index);

  const cols = Math.max(1, Math.floor((sheetWidth + stride - frameWidth) / stride));
  const handleToIndex = new Map();
  for (const s of sprites) {
    if (s.Handle == null) continue;
    const x = s.X ?? 0;
    const y = s.Y ?? 0;
    if (x + frameWidth > sheetWidth) continue;
    if (y + frameHeight > sheetHeight) continue;
    const col = Math.round(x / stride);
    const row = Math.round(y / stride);
    if (col < 0 || row < 0) continue;
    handleToIndex.set(s.Handle, row * cols + col);
  }

  function resolveSpriteId(id) {
    if (typeof id !== "string") return null;
    if (refToIndex.has(id)) return refToIndex.get(id);
    const asNum = Number(id);
    if (Number.isFinite(asNum) && handleToIndex.has(asNum)) {
      return handleToIndex.get(asNum);
    }
    return null;
  }
  return { refToIndex, handleToIndex, resolveSpriteId };
}

// Multi-keyframe TileDefs are state-transition / continuous animations.
// Single-keyframe TileDefs are the static-render path the level extractor
// already handles.
function extractTileAnims(ed, sprites, frames, stride, frameWidth, frameHeight, sheetWidth, sheetHeight) {
  const tileDefs = ed.TileDefs ?? [];
  const { resolveSpriteId } = buildSpriteResolvers(
    sprites, frames, stride, frameWidth, frameHeight, sheetWidth, sheetHeight,
  );
  const anims = [];
  let skipped = 0;
  for (const td of tileDefs) {
    const kf = td.Animation?.KeyFrames ?? [];
    if (kf.length <= 1) continue;
    const indices = [];
    let unresolved = 0;
    for (const f of kf) {
      const idx = resolveSpriteId(f.SpriteId);
      if (idx == null) { unresolved += 1; continue; }
      indices.push(idx);
    }
    if (indices.length === 0) { skipped += 1; continue; }
    if (unresolved > 0) {
      console.warn(
        `warn: TileDef "${td.Ref}" had ${unresolved}/${kf.length} unresolved keyframes — animation plays with the resolvable subset.`,
      );
    }
    anims.push({
      handle: td.Handle,
      label: td.Ref ?? `tiledef-${td.Handle}`,
      baseFrame: indices[0],
      settleFrame: indices[indices.length - 1],
      frames: indices,
      frameRate: td.Animation?.Rate ?? 4,
    });
  }
  if (skipped > 0) {
    console.warn(`warn: skipped ${skipped} multi-keyframe TileDef(s) whose keyframes didn't resolve.`);
  }
  return anims;
}

// Ed's painted level data lives in Levels[].Boards[] — each Board is a
// layer (sparse Tiles[] plus its own Width/Height/Opacity/Name). Each
// painted tile carries a Handle that resolves through TileDefs to a
// SpriteId Ref, which we then map back to our slice-frame index.
function extractLevels(ed, frames, defaultTileSize, defaultSpacing) {
  const rawLevels = ed.Levels ?? ed.levels;
  if (!Array.isArray(rawLevels)) return [];

  // SpriteId (Ref string) -> our frame index in the slice order.
  const refToIndex = new Map();
  for (const f of frames) if (f.ref) refToIndex.set(f.ref, f.index);

  // TileDef.Handle -> SpriteId Ref of the first keyframe.
  // Some TileDefs (notably the `spawn` marker) have empty KeyFrames — they
  // exist as cell-presence markers, not renderable sprites. We track those
  // separately so the level-extractor can still mark a cell as painted
  // without resolving to a sprite frame.
  const tileDefs = ed.TileDefs ?? [];
  const handleToRef = new Map();
  const markerHandles = new Set();
  for (const td of tileDefs) {
    if (td.Handle == null) continue;
    const ref = td.Animation?.KeyFrames?.[0]?.SpriteId;
    if (typeof ref === "string") {
      handleToRef.set(td.Handle, ref);
    } else {
      markerHandles.add(td.Handle);
    }
  }

  const out = [];
  for (const lv of rawLevels) {
    const levelName = lv.Name ?? lv.name ?? "level";
    const boards = lv.Boards ?? lv.boards ?? [];
    if (!Array.isArray(boards) || boards.length === 0) continue;

    // We pick the level's grid dimensions from the largest board so that
    // every layer ends up the same shape after we pad zero rows/cols.
    let width = 0;
    let height = 0;
    for (const b of boards) {
      width = Math.max(width, b.Width ?? b.width ?? 0);
      height = Math.max(height, b.Height ?? b.height ?? 0);
    }
    if (!width || !height) continue;

    const layers = [];
    let unresolved = 0;
    let painted = 0;
    boards.forEach((b, boardIdx) => {
      const bName = b.Name ?? b.name ?? `board ${boardIdx + 1}`;
      const opacity = b.Opacity ?? b.opacity ?? 1;
      const tiles = b.Tiles ?? b.tiles ?? [];
      const grid = Array.from({ length: height }, () =>
        new Array(width).fill(0),
      );
      for (const t of tiles) {
        const x = t.X ?? t.x ?? 0;
        const y = t.Y ?? t.y ?? 0;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        painted += 1;
        const ref = handleToRef.get(t.Handle);
        const idx = ref != null ? refToIndex.get(ref) : undefined;
        if (idx != null) {
          // Tiled / Ed convention: 0 = empty; non-zero = 1-based frame index.
          grid[y][x] = idx + 1;
        } else if (markerHandles.has(t.Handle)) {
          // Marker tile (no sprite). Record presence with sentinel 1 so
          // semantic-layer logic (especially `spawn`) can locate the cell.
          // The decoration renderer never sees `spawn`, and out-of-range
          // frame indices on other marker-named layers degrade harmlessly.
          grid[y][x] = 1;
        } else {
          unresolved += 1;
        }
      }
      layers.push({ name: bName, opacity, data: grid });
    });

    if (layers.length === 0) continue;

    // Auto-crop the level to the union bbox of painted cells across all
    // layers. Ed defaults a new Board's size to the project's
    // Width/Height (often 100x100), even when paint occupies only a
    // corner — without this the renderer would draw a giant mostly-empty
    // grid.
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (const ly of layers) {
      for (let y = 0; y < ly.data.length; y++) {
        const row = ly.data[y];
        for (let x = 0; x < row.length; x++) {
          if ((row[x] ?? 0) === 0) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0 && (minX > 0 || minY > 0 || maxX < width - 1 || maxY < height - 1)) {
      const newW = maxX - minX + 1;
      const newH = maxY - minY + 1;
      for (const ly of layers) {
        const cropGrid = [];
        for (let y = minY; y <= maxY; y++) {
          const row = ly.data[y] ?? [];
          cropGrid.push(row.slice(minX, maxX + 1));
        }
        ly.data = cropGrid;
      }
      console.log(
        `note:  level "${levelName}" cropped from ${width}x${height} to ${newW}x${newH} (paint bbox: ${minX},${minY} -> ${maxX},${maxY})`,
      );
      width = newW;
      height = newH;
    }

    out.push({
      name: levelName,
      width,
      height,
      tileSize: defaultTileSize,
      spacing: defaultSpacing,
      layers,
    });

    // Empty-semantic-layer warning. The user almost certainly added these
    // boards on purpose, so a zero-tile board likely means they forgot to
    // paint. We surface this so the next export round-trip is informed.
    const SEMANTIC = new Set([
      "floor", "walls", "doors", "terminals", "vent_control",
      "shared_field", "light_sources", "article_zero", "lattice_exit",
      "spawn",
    ]);
    for (const ly of layers) {
      const lname = ly.name.toLowerCase();
      if (!SEMANTIC.has(lname)) continue;
      const total = ly.data.reduce(
        (n, row) => n + row.reduce((m, c) => m + (c > 0 ? 1 : 0), 0),
        0,
      );
      if (total > 0) continue;
      if (lname === "spawn") {
        console.log(
          `note:  layer "${ly.name}" is empty — Sol will spawn on the first walkable floor cell (or the map centre if no floor exists).`,
        );
      } else {
        console.log(
          `note:  layer "${ly.name}" is empty (no painted cells); the layer will have no in-game effect.`,
        );
      }
    }

    if (painted > 0 && unresolved === painted) {
      console.warn(
        `warn: level "${levelName}" has ${painted} painted tiles but none resolved through TileDefs — check that the project has been saved (Ed sometimes elides TileDefs in unsaved projects).`,
      );
    } else if (unresolved > 0) {
      console.warn(
        `warn: level "${levelName}" has ${unresolved}/${painted} unresolved tile handles (probably autotile rule outputs; v1.5 doesn't evaluate rules).`,
      );
    }
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
    const levels = extractLevels(ed, frames, frameWidth, spacing);
    const tileAnims = extractTileAnims(
      ed, sprites, frames, stride, frameWidth, frameHeight, sheetWidth, sheetHeight,
    );

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
      'import type { MooseSpriteFrame, MooseTileAnim } from "./types";',
      "",
      `export const ${ident}_TEXTURE_KEY = ${JSON.stringify(slug)};`,
      `export const ${ident}_LABEL = ${JSON.stringify(label)};`,
      `export const ${ident}_FRAME_WIDTH = ${frameWidth};`,
      `export const ${ident}_FRAME_HEIGHT = ${frameHeight};`,
      `export const ${ident}_SPACING = ${spacing};`,
      "",
      `export const ${ident}_FRAMES: MooseSpriteFrame[] = ${tsLiteral(frames)};`,
      "",
      `export const ${ident}_TILE_ANIMS: MooseTileAnim[] = ${tsLiteral(tileAnims)};`,
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
    const entry = {
      key: slug,
      label,
      path: `/assets/tilesets/${slug}/sheet.png`,
      frameWidth,
      frameHeight,
      spacing,
    };
    if (tileAnims.length > 0) entry.tileAnims = tileAnims;
    filtered.push(entry);
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
    console.log(`  frames:  ${frames.length}    levels: ${levels.length}    tile-anims: ${tileAnims.length}`);
    if (tileAnims.length > 0) {
      for (const a of tileAnims) {
        console.log(`    anim:  "${a.label}" handle=${a.handle} ${a.frames.length} frames @ ${a.frameRate}fps`);
      }
    }
    console.log(`  registry: ${path.relative(ROOT, REGISTRY_PATH)}`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
