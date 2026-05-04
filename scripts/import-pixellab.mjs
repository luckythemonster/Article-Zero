// import-pixellab.mjs — ingest a pixellab.ai export ZIP (or extracted dir)
// into art/ so that `npm run art` can pack it into the chars-art atlas.
//
// Usage:
//   node scripts/import-pixellab.mjs <path-to.zip>
//   node scripts/import-pixellab.mjs <path-to.zip> --slug-overrides=StateName=myslug,StateName2=myslug2
//   node scripts/import-pixellab.mjs <path-to.zip> --skip=StateName1,StateName2
//
// Pixellab export layout (two flavours):
//
//   Flat (e.g. The_Fragment_Box.zip, Mesh_Uplink.zip):
//     metadata.json
//     states/<StateName>/rotations/<dir>.png
//     states/<StateName>/animations/<prompt_prefix>/<dir>/frame_NNN.png
//
//   Object-nested (e.g. NW-SMAC-01 items.zip):
//     metadata.json
//     objects/<objName>/states/<StateName>/rotations/<dir>.png
//     objects/<objName>/states/<StateName>/animations/<prompt_prefix>/<dir>/frame_NNN.png
//
// The importer is disk-first: it walks the state folders directly rather than
// trying to correlate metadata object entries to folders.  Metadata is used
// only to detect frame counts and animation names — the disk layout is the
// source of truth for slugging.
//
// Output layout (build-atlas.mjs convention):
//   art/<slug>/rotations/<dir>/01.png     — for cardinal dirs (south/north/east/west)
//   art/<slug>/rotations/01.png           — for 1-direction (unknown) objects
//   art/<slug>/<animKey>/<dir>/NN.png
//   art/<slug>/<animKey>/NN.png           — for 1-direction objects
//
// Slug derivation:
//   1. --slug-overrides=StateName=foo wins
//   2. For object-nested: slugify(objName) + numeric suffix for extra states
//   3. For flat: slugify(StateName)
//
// Direction handling:
//   8-dir exports (south/south-east/north/etc.): only cardinal dirs kept.
//   1-dir exports (unknown): flat output, no direction subdir.

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "art");

const CARDINALS = new Set(["south", "north", "east", "west"]);

function die(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

function slugify(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return /^[0-9]/.test(s) ? `n${s}` : s;
}

function pad(n) {
  return String(n + 1).padStart(2, "0");
}

function unzipTo(zip, dest) {
  const r = spawnSync("unzip", ["-o", "-q", zip, "-d", dest], { stdio: "inherit" });
  if (r.status !== 0) die(`unzip failed for ${zip}`);
}

async function pathExists(p) {
  return fs.stat(p).then(() => true).catch(() => false);
}

async function listDirs(p) {
  if (!(await pathExists(p))) return [];
  const entries = await fs.readdir(p, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function listFiles(p) {
  if (!(await pathExists(p))) return [];
  const entries = await fs.readdir(p, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name).sort();
}

async function copyFrame(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

function parseSlugOverrides(args) {
  const map = new Map();
  for (const arg of args) {
    const m = arg.match(/^--slug-overrides=(.+)$/);
    if (!m) continue;
    for (const pair of m[1].split(",")) {
      const eq = pair.indexOf("=");
      if (eq > 0) map.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  return map;
}

function parseSkip(args) {
  const set = new Set();
  for (const arg of args) {
    const m = arg.match(/^--skip=(.+)$/);
    if (!m) continue;
    for (const name of m[1].split(",")) set.add(name);
  }
  return set;
}

/**
 * Import one state folder into art/<slug>/.
 * Works by walking the on-disk rotations/ and animations/ directories.
 */
async function importStateDir(stateDir, slug) {
  const artDir = path.join(ART_DIR, slug);
  let framesWritten = 0;

  // --- Rotations ---
  const rotDir = path.join(stateDir, "rotations");
  const rotFiles = await listFiles(rotDir);
  const rotDirs = await listDirs(rotDir);

  // Rotation files may be flat with direction names ("south.png", "unknown.png")
  // or inside subdirs. Detect directional flat files by checking if any name
  // matches a cardinal or "unknown".
  const ALL_DIRS = new Set([...CARDINALS, "unknown", "south-east", "north-east", "north-west", "south-west"]);
  const rotPngs = rotFiles.filter((f) => f.toLowerCase().endsWith(".png"));
  const hasDirectionalFiles = rotPngs.some((f) => ALL_DIRS.has(path.basename(f, ".png").toLowerCase()));

  if (rotPngs.length > 0 && hasDirectionalFiles) {
    // Files named by direction (e.g. south.png, unknown.png)
    const isOnly1Dir = rotPngs.every((f) => path.basename(f, ".png").toLowerCase() === "unknown");
    for (const file of rotPngs) {
      const dirName = path.basename(file, ".png").toLowerCase();
      if (dirName === "unknown") {
        // Flat 1-direction
        const src = path.join(rotDir, file);
        const dest = path.join(artDir, "rotations", "01.png");
        await copyFrame(src, dest);
        framesWritten++;
      } else if (CARDINALS.has(dirName)) {
        const src = path.join(rotDir, file);
        const dest = path.join(artDir, "rotations", dirName, "01.png");
        await copyFrame(src, dest);
        framesWritten++;
      }
      // intercardinals skipped
    }
  } else if (rotPngs.length > 0) {
    // Unnamed flat files (1-direction fallback)
    for (let i = 0; i < rotPngs.length; i++) {
      const src = path.join(rotDir, rotPngs[i]);
      const dest = path.join(artDir, "rotations", `${pad(i)}.png`);
      await copyFrame(src, dest);
      framesWritten++;
    }
  } else if (rotDirs.length > 0) {
    // Multi-direction: subdirs named after directions
    for (const dir of rotDirs) {
      if (!CARDINALS.has(dir)) continue;
      const dirPath = path.join(rotDir, dir);
      const frames = (await listFiles(dirPath)).filter((f) => f.toLowerCase().endsWith(".png"));
      for (let i = 0; i < frames.length; i++) {
        const src = path.join(dirPath, frames[i]);
        const dest = path.join(artDir, "rotations", dir, `${pad(i)}.png`);
        await copyFrame(src, dest);
        framesWritten++;
      }
    }
  }

  // --- Animations ---
  const animRoot = path.join(stateDir, "animations");
  const animNames = await listDirs(animRoot);

  for (let animIdx = 0; animIdx < animNames.length; animIdx++) {
    const animName = animNames[animIdx];
    const animKey = animIdx === 0 ? "idle" : `anim${animIdx + 1}`;
    const animDir = path.join(animRoot, animName);

    // Check if 1-direction (files directly here) or multi-direction (subdirs)
    const animFiles = (await listFiles(animDir)).filter((f) => f.toLowerCase().endsWith(".png"));
    const animSubdirs = await listDirs(animDir);

    if (animFiles.length > 0) {
      // Flat 1-direction (frame_NNN.png directly in animDir — but usually it's a dir of unknown/)
      for (let i = 0; i < animFiles.length; i++) {
        const src = path.join(animDir, animFiles[i]);
        const dest = path.join(artDir, animKey, `${pad(i)}.png`);
        await copyFrame(src, dest);
        framesWritten++;
      }
    } else {
      for (const dir of animSubdirs) {
        // 1-direction objects use "unknown" dir — output flat (no direction subdir)
        const is1Dir = dir === "unknown";
        const isCardinal = CARDINALS.has(dir);
        if (!is1Dir && !isCardinal) continue;

        const dirPath = path.join(animDir, dir);
        const frames = (await listFiles(dirPath)).filter((f) => f.toLowerCase().endsWith(".png"));
        for (let i = 0; i < frames.length; i++) {
          const src = path.join(dirPath, frames[i]);
          const dest = is1Dir
            ? path.join(artDir, animKey, `${pad(i)}.png`)
            : path.join(artDir, animKey, dir, `${pad(i)}.png`);
          await copyFrame(src, dest);
          framesWritten++;
        }
      }
    }
  }

  return framesWritten;
}

async function main() {
  const [, , zipArg, ...restArgs] = process.argv;
  if (!zipArg) {
    die("usage: node scripts/import-pixellab.mjs <path-to.zip> [--slug-overrides=A=b] [--skip=X,Y]");
  }

  const slugOverrides = parseSlugOverrides(restArgs);
  const skip = parseSkip(restArgs);

  const zipPath = path.resolve(zipArg);
  const tmpDir = path.join(ROOT, ".pixellab-import-tmp-" + Date.now());

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    unzipTo(zipPath, tmpDir);

    // Locate the root dir (zip might wrap everything in one folder)
    let root = tmpDir;
    const top = await fs.readdir(tmpDir, { withFileTypes: true });
    if (top.length === 1 && top[0].isDirectory()) {
      root = path.join(tmpDir, top[0].name);
    }

    // Detect layout
    const hasObjects = await pathExists(path.join(root, "objects"));
    const hasStates = await pathExists(path.join(root, "states"));

    let totalFrames = 0;
    let totalSlugs = 0;
    const usedSlugs = new Map(); // base slug → count of uses (for dedup suffix)

    if (hasObjects) {
      // Object-nested: objects/<objName>/states/<stateName>/
      const objNames = await listDirs(path.join(root, "objects"));
      for (const objName of objNames) {
        const statesRoot = path.join(root, "objects", objName, "states");
        const stateNames = await listDirs(statesRoot);

        const baseSlug = slugify(objName);
        let stateCount = 0;

        for (const stateName of stateNames) {
          if (skip.has(stateName) || skip.has(objName)) continue;

          // Slug: first state → base, subsequent → base + "2", "3", …
          let slug = slugOverrides.get(stateName) ?? slugOverrides.get(objName);
          if (!slug) {
            const used = usedSlugs.get(baseSlug) ?? 0;
            slug = used === 0 ? baseSlug : `${baseSlug}${used + 1}`;
            usedSlugs.set(baseSlug, used + 1);
          }

          const stateDir = path.join(statesRoot, stateName);
          console.log(`  importing ${objName}/${stateName} → art/${slug}/`);
          const frames = await importStateDir(stateDir, slug);
          totalFrames += frames;
          totalSlugs++;
          stateCount++;
        }

        if (stateCount === 0) {
          console.warn(`  warn: no states found for objects/${objName} — skipping`);
        }
      }
    } else if (hasStates) {
      // Flat: states/<stateName>/
      const stateNames = await listDirs(path.join(root, "states"));
      for (const stateName of stateNames) {
        if (skip.has(stateName)) continue;

        let slug = slugOverrides.get(stateName);
        if (!slug) {
          const base = slugify(stateName);
          const used = usedSlugs.get(base) ?? 0;
          slug = used === 0 ? base : `${base}${used + 1}`;
          usedSlugs.set(base, (usedSlugs.get(base) ?? 0) + 1);
        }

        const stateDir = path.join(root, "states", stateName);
        console.log(`  importing ${stateName} → art/${slug}/`);
        const frames = await importStateDir(stateDir, slug);
        totalFrames += frames;
        totalSlugs++;
      }
    } else {
      die(`no 'objects/' or 'states/' directory found in ${zipPath}`);
    }

    console.log(`\nwrote ${totalFrames} frames across ${totalSlugs} slugs to art/`);
    console.log(`run \`npm run art\` to rebuild the atlas`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
