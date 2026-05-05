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
const SPRITE_PACK_DIR = path.join(ROOT, "public/assets/sprite_pack");
const REGISTRY_TS = path.join(ROOT, "src/data/char-anims.generated.ts");

const TEXTURE_KEY_PREFIX = "chars-art";

// Keep each atlas under ~4000 px on its longest side so it loads on the
// 4096×4096 WebGL floor (iPad Air 2, older Android). Per bucket we pick a
// column count that yields a roughly-square atlas while respecting the
// width cap for the bucket's cell size.
const MAX_ATLAS_DIMENSION = 4000;

function bucketColumns(cellWidth, frameCount) {
  const widthCap = Math.max(1, Math.floor(MAX_ATLAS_DIMENSION / cellWidth));
  const square = Math.max(1, Math.ceil(Math.sqrt(frameCount)));
  return Math.min(widthCap, Math.max(square, 1), frameCount);
}

function bucketKey(width, height) {
  return `${TEXTURE_KEY_PREFIX}-${width}x${height}`;
}

function bucketFiles(width, height) {
  const key = bucketKey(width, height);
  return {
    key,
    png: path.join(SPRITE_PACK_DIR, `${key}.png`),
    json: path.join(SPRITE_PACK_DIR, `${key}.json`),
    publicPath: `${key}.png`,
  };
}

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

async function pruneOldAtlases() {
  // Remove any pre-existing chars-art*.{png,json} so renames/regroupings
  // don't leave orphan files in the public/ tree.
  if (!(await exists(SPRITE_PACK_DIR))) return;
  const entries = await fs.readdir(SPRITE_PACK_DIR);
  for (const name of entries) {
    if (!/^chars-art(?:-[0-9]+x[0-9]+)?\.(png|json)$/.test(name)) continue;
    await fs.rm(path.join(SPRITE_PACK_DIR, name), { force: true });
  }
}

async function writePlaceholderAtlas() {
  // Emit a 1×1 chars-art-placeholder.{png,json} so BootScene always has at
  // least one texture to load even when art/ is empty.
  const files = bucketFiles(1, 1);
  const img = new Jimp({ width: 1, height: 1, color: 0x00000000 });
  await fs.mkdir(SPRITE_PACK_DIR, { recursive: true });
  await img.write(files.png);
  await fs.writeFile(
    files.json,
    JSON.stringify(
      {
        frames: {},
        meta: {
          app: "article-zero/build-atlas.mjs",
          version: "1",
          image: files.publicPath,
          format: "RGBA8888",
          size: { w: 1, h: 1 },
          scale: "1",
        },
      },
      null,
      2,
    ),
  );
  return [files];
}

/**
 * Pack a single size-bucket into one atlas. Cell size matches the bucket's
 * frame dimensions exactly, so there's no waste from larger sprites in
 * other buckets.
 */
async function buildBucketAtlas(width, height, frames) {
  const files = bucketFiles(width, height);
  const cols = bucketColumns(width, frames.length);
  const rows = Math.ceil(frames.length / cols);
  const atlasW = cols * width;
  const atlasH = rows * height;

  const atlas = new Jimp({ width: atlasW, height: atlasH, color: 0x00000000 });
  const frameMap = {};

  frames.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * width;
    const y = row * height;
    atlas.composite(f.image, x, y);
    frameMap[f.key] = {
      frame: { x, y, w: f.width, h: f.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.width, h: f.height },
      sourceSize: { w: f.width, h: f.height },
    };
  });

  await fs.mkdir(SPRITE_PACK_DIR, { recursive: true });
  await atlas.write(files.png);
  await fs.writeFile(
    files.json,
    JSON.stringify(
      {
        frames: frameMap,
        meta: {
          app: "article-zero/build-atlas.mjs",
          version: "1",
          image: files.publicPath,
          format: "RGBA8888",
          size: { w: atlasW, h: atlasH },
          scale: "1",
        },
      },
      null,
      2,
    ),
  );

  return { ...files, atlasW, atlasH, frameCount: frames.length };
}

async function buildAtlases(frames) {
  await pruneOldAtlases();

  if (frames.length === 0) {
    return await writePlaceholderAtlas();
  }

  // Bucket frames by `${width}x${height}`. Per-character consistency is
  // already enforced, so a character maps to exactly one bucket.
  const byBucket = new Map(); // "WxH" -> frames[]
  for (const f of frames) {
    const k = `${f.width}x${f.height}`;
    if (!byBucket.has(k)) byBucket.set(k, []);
    byBucket.get(k).push(f);
  }

  const written = [];
  for (const [size, bucketFrames] of byBucket) {
    const [w, h] = size.split("x").map((n) => parseInt(n, 10));
    written.push(await buildBucketAtlas(w, h, bucketFrames));
  }
  return written;
}

function emitRegistry(groups, meta, characterTexture, atlases) {
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
    const texture = characterTexture.get(g.character) ?? TEXTURE_KEY_PREFIX;
    anims.push({ key, frameRate, repeat, frames: frameNames, texture });
  }

  const body =
    "// AUTO-GENERATED by scripts/build-atlas.mjs. Do not hand-edit.\n" +
    '// Run `npm run art` to regenerate after changing files in art/.\n' +
    "\n" +
    'import type { CharAnim } from "./char-anims";\n' +
    "\n" +
    "export interface GeneratedAtlas {\n" +
    "  key: string;\n" +
    "  /** Path served from /assets/sprite_pack/ */\n" +
    "  png: string;\n" +
    "  json: string;\n" +
    "}\n" +
    "\n" +
    "export const GENERATED_ATLASES: GeneratedAtlas[] = " +
    JSON.stringify(
      atlases.map((a) => ({
        key: a.key,
        png: `/assets/sprite_pack/${a.key}.png`,
        json: `/assets/sprite_pack/${a.key}.json`,
      })),
      null,
      2,
    ) +
    ";\n\n" +
    "export const GENERATED_ANIMS: CharAnim[] = " +
    JSON.stringify(anims, null, 2) +
    ";\n";
  return fs.writeFile(REGISTRY_TS, body);
}

async function main() {
  const { groups, meta } = await collect();
  const frames = await loadFrames(groups);
  assertConsistentSize(frames);
  const atlases = await buildAtlases(frames);

  // Map each character to the texture key of its bucket. Per-character size
  // is already enforced, so a character maps to exactly one bucket.
  const characterTexture = new Map(); // character -> "chars-art-WxH"
  for (const f of frames) {
    if (!characterTexture.has(f.character)) {
      characterTexture.set(f.character, bucketKey(f.width, f.height));
    }
  }

  await emitRegistry(groups, meta, characterTexture, atlases);

  const characterCount = new Set(groups.map((g) => g.character)).size;
  console.log(
    `Atlases: ${frames.length} frames across ${characterCount} character(s) in ${atlases.length} bucket(s):`,
  );
  for (const a of atlases) {
    console.log(`  ${a.key}: ${a.frameCount ?? 0} frames → ${a.atlasW ?? 1}×${a.atlasH ?? 1} px`);
  }
  console.log(`  registry: ${path.relative(ROOT, REGISTRY_TS)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
