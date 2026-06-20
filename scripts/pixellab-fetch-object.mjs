// pixellab-fetch-object.mjs — pull an existing Pixel Lab "object" (8-direction,
// multi-animation) into the art/<slug>/ layout that build-atlas.mjs consumes.
//
// Companion to pixellab-fetch.mjs (which CREATES a new 4-direction character).
// Use this one when you've authored an object in the Pixel Lab web UI
// (https://www.pixellab.ai/create-object/<id>) and want its frames in-game.
//
// Usage:
//   PIXELLAB_API_TOKEN=... \
//   node scripts/pixellab-fetch-object.mjs <object_id> <slug> \
//     [--fill-missing] [--cardinals-only] [--frame-count N] [--force]
//
// Then:
//   npm run art
//
// Flags:
//   --fill-missing    Trigger generation of any cardinal direction that an
//                     existing animation group doesn't yet cover, then download
//                     once the jobs complete. Without this flag, missing
//                     directions are just reported and skipped.
//   --cardinals-only  Only download south/north/east/west (the four the
//                     renderer's animKey lookup actually consumes). Default is
//                     all 8 directions including diagonals.
//   --frame-count N   Override frame_count for fill-missing animate calls.
//                     Useful when the existing direction was generated with a
//                     non-default count and you want the new ones to match.
//   --force           Overwrite existing frame folders under art/<slug>/.
//
// Pixel Lab quirks (same as pixellab-fetch.mjs):
//   - GET /v2/objects/{id} returns rotation_urls (idle, 8 dirs) and
//     animations[] — each animation_group with per-direction frame URLs.
//   - POST /v2/objects/{id}/animations queues background jobs (one per
//     submitted direction). Poll /v2/background-jobs/{id} until "completed".
//   - The animation display_name is freeform — we map common names to the
//     art-folder keys the renderer expects (idle, walkcycle, anchor, spray).
//     Anything we can't classify is reported and skipped.
//   - TLS certs rotate often and our sandbox clock can be a hair ahead of
//     their CA — we retry transparently on CERT_NOT_YET_VALID.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "art");

const API_BASE = process.env.PIXELLAB_API_BASE ?? "https://api.pixellab.ai/v2";
const TOKEN = process.env.PIXELLAB_API_TOKEN;

const CARDINAL_DIRS = ["south", "north", "east", "west"];
const ALL_DIRS = [
  "south", "south-east", "east", "north-east",
  "north", "north-west", "west", "south-west",
];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function usage(message) {
  if (message) console.error(`error: ${message}\n`);
  console.error(
    "usage: node scripts/pixellab-fetch-object.mjs <object_id> <slug>\n" +
      "       [--fill-missing] [--cardinals-only] [--frame-count N] [--force]\n\n" +
      "Requires PIXELLAB_API_TOKEN env var.",
  );
  process.exit(message ? 1 : 0);
}

// fetch() with retry on CERT_NOT_YET_VALID (Pixel Lab rotates TLS certs every
// few minutes; our sandbox clock can be a hair ahead of their CA).
async function tlsFetch(url, opts, { retries = 5, delayMs = 2000 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (e?.cause?.code === "CERT_NOT_YET_VALID" && i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
  throw new Error("unreachable");
}

async function postJson(pathname, body) {
  const res = await tlsFetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${pathname} → ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function getJson(pathname) {
  const res = await tlsFetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${pathname} → ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function downloadPng(url) {
  const res = await tlsFetch(url);
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error(`download ${url} did not return a PNG`);
  }
  return buf;
}

async function pollJob(jobId, { intervalMs = 3000, timeoutMs = 5 * 60 * 1000, label } = {}) {
  const start = Date.now();
  let last = "";
  const tag = label ?? jobId.slice(0, 8);
  for (;;) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`background job ${jobId} (${tag}) timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    const j = await getJson(`/background-jobs/${jobId}`);
    if (j.status !== last) {
      process.stdout.write(`  ${tag}: ${j.status}\n`);
      last = j.status;
    }
    if (j.status === "completed") return j;
    if (j.status === "failed") {
      const err = j.last_response?.error ?? j.last_response?.detail ?? "unknown error";
      throw new Error(`job ${jobId} (${tag}) failed: ${err}`);
    }
  }
}

// Map a Pixel Lab animation display_name onto one of the art-folder keys the
// renderer actually consumes. Returning null skips the animation (with a log).
// Patterns are intentionally loose because the web UI lets the author type
// freeform names and uses the prompt as a fallback when display_name is blank.
function normalizeAnimKey(displayName, description) {
  const n = ((displayName || "") + " " + (description || "")).toLowerCase();
  if (/\bwalk(\b|ing|cycle|forward)/.test(n) || n.includes("moves for") || /\bmove\b/.test(n)) return "walkcycle";
  if (/deactivate|power.*down|emp/i.test(n)) return "deactivate";
  if (/scan|survey|sweep/i.test(n)) return "scan";
  if (/attack|thrust|ram|apprehend/i.test(n)) return "attack";
  if (/panic/i.test(n)) return "panic";
  if (/idle|stand/i.test(n)) return "idle";
  if (/\b(plant|anchor)\b/.test(n)) return "anchor";
  if (/spray|chemical|irritant|nozzle|mist/.test(n)) return "spray";
  return null;
}

async function ensureEmptyDir(dir, { force }) {
  const has = await fs.stat(dir).then(() => true).catch(() => false);
  if (has && !force) {
    throw new Error(
      `${path.relative(ROOT, dir)} already exists. Pass --force to overwrite.`,
    );
  }
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) usage();
  if (!TOKEN) usage("PIXELLAB_API_TOKEN env var is required");

  const objectId = args._[0];
  const slug = args._[1];
  if (!objectId || !slug) usage("expected <object_id> <slug>");
  if (!/^[a-z0-9]+$/.test(slug)) usage("<slug> must be lowercase alphanumeric");

  const fillMissing = args["fill-missing"] === true;
  const cardinalsOnly = args["cardinals-only"] === true;
  const frameCount = args["frame-count"] != null && args["frame-count"] !== true
    ? Number(args["frame-count"])
    : undefined;
  const force = args.force === true;

  const targetDirs = cardinalsOnly ? CARDINAL_DIRS : ALL_DIRS;

  console.log(`Pixel Lab object ${objectId} → art/${slug}`);
  let obj = await getJson(`/objects/${objectId}`);
  console.log(`  name="${obj.name}" size=${obj.size.width}x${obj.size.height} dirs=${obj.directions} view="${obj.view}"`);

  // ── Classify animations by anim_key ─────────────────────────────────
  function classify(o) {
    const byKey = new Map(); // anim_key → [{ anim, dirs_present }]
    for (const anim of o.animations || []) {
      const key = normalizeAnimKey(anim.display_name, anim.description);
      if (!key) {
        console.log(
          `  skipping animation: "${(anim.display_name || anim.description || "").slice(0, 60)}" group=${anim.animation_group_id.slice(0, 8)}`,
        );
        continue;
      }
      const dirs_present = (anim.directions || []).map((d) => d.direction);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ anim, dirs_present });
    }
    return byKey;
  }

  let groupsByKey = classify(obj);
  for (const [key, groups] of groupsByKey) {
    const covered = new Set(groups.flatMap((g) => g.dirs_present));
    const missing = targetDirs.filter((d) => !covered.has(d));
    console.log(`  ${key}: covered=[${[...covered].join(",")}]${missing.length ? `  missing=[${missing.join(",")}]` : ""}`);
  }

  // ── Fill missing cardinals (optional) ──────────────────────────────
  if (fillMissing) {
    const submissions = []; // { key, group_id, direction, job_id }
    for (const [key, groups] of groupsByKey) {
      const covered = new Set(groups.flatMap((g) => g.dirs_present));
      const missing = targetDirs.filter((d) => !covered.has(d));
      if (missing.length === 0) continue;
      // Pick a canonical group to extend: prefer the one with the most
      // already-generated cardinals (so we add to a coherent batch).
      const canonical = [...groups].sort((a, b) => b.dirs_present.length - a.dirs_present.length)[0];
      console.log(`  filling ${key} via group ${canonical.anim.animation_group_id.slice(0, 8)}: ${missing.join(", ")}`);
      const body = {
        animation_group_id: canonical.anim.animation_group_id,
        directions: missing,
        mode: "v3",
      };
      if (frameCount != null) body.frame_count = frameCount;
      const resp = await postJson(`/objects/${objectId}/animations`, body);
      for (const sub of resp.submissions || []) {
        if (sub.status === "rate_limited") {
          throw new Error(`fill ${key}/${sub.direction} was rate_limited — try again later`);
        }
        if (!sub.background_job_id) {
          console.log(`  ${key}/${sub.direction}: ${sub.status} (no job id)`);
          continue;
        }
        submissions.push({
          key, group_id: resp.animation_group_id, direction: sub.direction, job_id: sub.background_job_id,
        });
      }
    }

    if (submissions.length > 0) {
      console.log(`  polling ${submissions.length} fill jobs...`);
      // allSettled so one model failure doesn't abort the whole import — the
      // other in-flight jobs still complete and publish their frames. We
      // report failures at the end and ship whatever cardinals we got.
      const results = await Promise.allSettled(
        submissions.map((s) => pollJob(s.job_id, { label: `${s.key}/${s.direction}` })),
      );
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === "rejected") failed.push({ ...submissions[i], reason: r.reason?.message ?? r.reason });
      });
      if (failed.length > 0) {
        console.log(`  ${failed.length} job(s) failed — proceeding with the successful ones:`);
        for (const f of failed) console.log(`    ${f.key}/${f.direction}: ${f.reason}`);
      }
      // Re-fetch — completed jobs publish their frames into the object.
      obj = await getJson(`/objects/${objectId}`);
      groupsByKey = classify(obj);
    }
  }

  // ── Download idle (rotations) ──────────────────────────────────────
  for (const dir of targetDirs) {
    const url = obj.rotation_urls?.[dir];
    if (!url) {
      console.log(`  idle/${dir}: no rotation URL (skipping)`);
      continue;
    }
    const outDir = path.join(ART_DIR, slug, "idle", dir);
    await ensureEmptyDir(outDir, { force });
    const png = await downloadPng(url);
    await fs.writeFile(path.join(outDir, "01.png"), png);
  }
  console.log(`  wrote idle/{${targetDirs.join(",")}}/01.png`);

  // ── Download animation frames ──────────────────────────────────────
  // When two groups cover the same direction (rare, e.g. duplicate "plant"
  // groups), the first one encountered wins — that's usually the one we just
  // extended via --fill-missing because the API sorts animations[] by created.
  for (const [key, groups] of groupsByKey) {
    const dirFrames = new Map(); // direction → [url, ...]
    for (const { anim } of groups) {
      for (const d of anim.directions || []) {
        if (!targetDirs.includes(d.direction)) continue;
        if (dirFrames.has(d.direction)) continue;
        const frames = d.storage_urls?.frames || [];
        if (frames.length === 0) continue;
        dirFrames.set(d.direction, frames);
      }
    }
    for (const dir of targetDirs) {
      const frames = dirFrames.get(dir);
      if (!frames) {
        console.log(`  ${key}/${dir}: no frames available`);
        continue;
      }
      const outDir = path.join(ART_DIR, slug, key, dir);
      await ensureEmptyDir(outDir, { force });
      const pngs = await Promise.all(frames.map((u) => downloadPng(u)));
      for (let i = 0; i < pngs.length; i++) {
        const name = String(i + 1).padStart(2, "0") + ".png";
        await fs.writeFile(path.join(outDir, name), pngs[i]);
      }
      console.log(`  wrote ${pngs.length} frames → art/${slug}/${key}/${dir}/`);
    }
  }

  console.log("\nNext:");
  console.log("  npm run art   # pack atlas + regenerate char-anims.generated.ts");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
