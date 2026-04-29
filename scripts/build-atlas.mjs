// build-atlas.mjs — pack PNGs from art/<character>/<animation>/<direction>/*.png
// into a single TexturePacker-style atlas at public/assets/sprite_pack/chars-art.png
// + .json, and emit src/data/char-anims.generated.ts with one CharAnim per
// (character, animation, direction) triple.
//
// Run with: npm run art
//
// Conventions:
// - All PNGs for a single character must share width and height
// - Filenames sorted lexically (use 01.png, 02.png, … for ordering)
// - Optional art/<character>/meta.json overrides frameRate / repeat per
//   animation; defaults: idle=4, walk/walkcycle=8, chase=6, others=8; repeat=-1.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Jimp } from "jimp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "art");
const ATLAS_PNG = path.join(ROOT, "public/assets/sprite_pack/chars-art.png");
const ATLAS_JSON = path.join(ROOT, "public/assets/sprite_pack/chars-art.json");
const REGISTRY_TS = path.join(ROOT, "src/data/char-anims.generated.ts");

const ATLAS_COLUMNS = 8;
const TEXTURE_KEY = "chars-art";

const DEFAULT_FRAME_RATES = {
  idle: 4,
  walk: 8,
  walkcycle: 8,
  chase: 6,
};

function frameRateFor(animation) {
  return DEFAULT_FRAME_RATES[animation.toLowerCase()] ?? 8;
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(p) {
  if (!(await exists(p))) return [];
  const entries = await fs.readdir(p, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listPngs(p) {
  if (!(await exists(p))) return [];
  const entries = await fs.readdir(p, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png"))
    .map((e) => e.name)
    .sort();
}

async function readMeta(characterDir) {
  const metaPath = path.join(characterDir, "meta.json");
  if (!(await exists(metaPath))) return {};
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf8"));
  } catch (e) {
    throw new Error(`Failed to parse ${metaPath}: ${e.message}`);
  }
}

async function collect() {
  const characters = await listDirs(ART_DIR);
  const groups = []; // [{ character, animation, direction, files: [absPath, ...] }]
  const meta = {}; // { [character]: { [animation]: { frameRate, repeat } } }

  for (const character of characters) {
    const charDir = path.join(ART_DIR, character);
    meta[character] = await readMeta(charDir);
    const animations = (await listDirs(charDir)).filter((n) => n !== "meta.json");
    for (const animation of animations) {
      const animDir = path.join(charDir, animation);
      const directions = await listDirs(animDir);
      if (directions.length === 0) {
        // Allow flat animation: art/<char>/<anim>/*.png with no direction split
        const files = await listPngs(animDir);
        if (files.length > 0) {
          groups.push({
            character,
            animation,
            direction: null,
            files: files.map((f) => path.join(animDir, f)),
          });
        }
        continue;
      }
      for (const direction of directions) {
        const dirPath = path.join(animDir, direction);
        const files = await listPngs(dirPath);
        if (files.length === 0) continue;
        groups.push({
          character,
          animation,
          direction,
          files: files.map((f) => path.join(dirPath, f)),
        });
      }
    }
  }

  return { groups, meta };
}

async function loadFrames(groups) {
  const all = [];
  for (const g of groups) {
    for (const filePath of g.files) {
      const img = await Jimp.read(filePath);
      const fileName = path.basename(filePath, ".png");
      const key = g.direction
        ? `${g.character}/${g.animation}/${g.direction}/${fileName}`
        : `${g.character}/${g.animation}/${fileName}`;
      all.push({
        ...g,
        filePath,
        fileName,
        key,
        width: img.bitmap.width,
        height: img.bitmap.height,
        image: img,
      });
    }
  }
  return all;
}

function assertConsistentSize(frames) {
  const byChar = new Map();
  for (const f of frames) {
    const existing = byChar.get(f.character);
    if (!existing) {
      byChar.set(f.character, { w: f.width, h: f.height, ref: f.filePath });
    } else if (existing.w !== f.width || existing.h !== f.height) {
      throw new Error(
        `Frame size mismatch for "${f.character}":\n` +
          `  ${existing.ref}: ${existing.w}x${existing.h}\n` +
          `  ${f.filePath}: ${f.width}x${f.height}\n` +
          "All frames for one character must share the same dimensions.",
      );
    }
  }
}

async function writePlaceholderAtlas() {
  const img = new Jimp({ width: 1, height: 1, color: 0x00000000 });
  await fs.mkdir(path.dirname(ATLAS_PNG), { recursive: true });
  await img.write(ATLAS_PNG);
  await fs.writeFile(
    ATLAS_JSON,
    JSON.stringify(
      {
        frames: {},
        meta: {
          app: "article-zero/build-atlas.mjs",
          version: "1",
          image: "chars-art.png",
          format: "RGBA8888",
          size: { w: 1, h: 1 },
          scale: "1",
        },
      },
      null,
      2,
    ),
  );
}

async function buildAtlas(frames) {
  if (frames.length === 0) {
    await writePlaceholderAtlas();
    return { frameMap: {}, atlasW: 1, atlasH: 1 };
  }

  // All frames go into a single grid. Cell size = max width × max height
  // across the whole set. Per-character size is already enforced.
  let cellW = 0;
  let cellH = 0;
  for (const f of frames) {
    if (f.width > cellW) cellW = f.width;
    if (f.height > cellH) cellH = f.height;
  }

  const cols = Math.min(ATLAS_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / cols);
  const atlasW = cols * cellW;
  const atlasH = rows * cellH;

  const atlas = new Jimp({ width: atlasW, height: atlasH, color: 0x00000000 });
  const frameMap = {};

  frames.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    atlas.composite(f.image, x, y);
    frameMap[f.key] = {
      frame: { x, y, w: f.width, h: f.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.width, h: f.height },
      sourceSize: { w: f.width, h: f.height },
    };
  });

  await fs.mkdir(path.dirname(ATLAS_PNG), { recursive: true });
  await atlas.write(ATLAS_PNG);
  await fs.writeFile(
    ATLAS_JSON,
    JSON.stringify(
      {
        frames: frameMap,
        meta: {
          app: "article-zero/build-atlas.mjs",
          version: "1",
          image: "chars-art.png",
          format: "RGBA8888",
          size: { w: atlasW, h: atlasH },
          scale: "1",
        },
      },
      null,
      2,
    ),
  );

  return { frameMap, atlasW, atlasH };
}

function emitRegistry(groups, meta) {
  // Build CharAnim entries grouped by (character, animation, direction).
  const anims = [];
  for (const g of groups) {
    const animMeta = meta[g.character]?.[g.animation] ?? {};
    const frameRate = animMeta.frameRate ?? frameRateFor(g.animation);
    const repeat = animMeta.repeat ?? -1;
    const dirSuffix = g.direction ? `_${g.direction}` : "";
    const key = `${g.character}_${g.animation}${dirSuffix}`;
    const frameNames = g.files.map((fp) => {
      const name = path.basename(fp, ".png");
      return g.direction
        ? `${g.character}/${g.animation}/${g.direction}/${name}`
        : `${g.character}/${g.animation}/${name}`;
    });
    anims.push({ key, frameRate, repeat, frames: frameNames });
  }

  const body =
    "// AUTO-GENERATED by scripts/build-atlas.mjs. Do not hand-edit.\n" +
    '// Run `npm run art` to regenerate after changing files in art/.\n' +
    "\n" +
    'import type { CharAnim } from "./char-anims";\n' +
    "\n" +
    "export const GENERATED_ANIMS: CharAnim[] = " +
    JSON.stringify(
      anims.map((a) => ({
        key: a.key,
        frameRate: a.frameRate,
        repeat: a.repeat,
        frames: a.frames,
        texture: TEXTURE_KEY,
      })),
      null,
      2,
    ) +
    ";\n";
  return fs.writeFile(REGISTRY_TS, body);
}

async function main() {
  const { groups, meta } = await collect();
  const frames = await loadFrames(groups);
  assertConsistentSize(frames);
  const { atlasW, atlasH } = await buildAtlas(frames);
  await emitRegistry(groups, meta);

  const characterCount = new Set(groups.map((g) => g.character)).size;
  console.log(
    `Atlas: ${frames.length} frames across ${characterCount} character(s) → ${atlasW}×${atlasH} px`,
  );
  console.log(`  ${path.relative(ROOT, ATLAS_PNG)}`);
  console.log(`  ${path.relative(ROOT, ATLAS_JSON)}`);
  console.log(`  ${path.relative(ROOT, REGISTRY_TS)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
