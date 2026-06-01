// pixellab-fetch.mjs — generate a 4-direction character via the Pixel Lab API
// and drop the resulting PNGs into the art/<slug>/{idle,walkcycle}/<dir>/NN.png
// layout that build-atlas.mjs already consumes.
//
// Usage:
//   PIXELLAB_API_TOKEN=... \
//   node scripts/pixellab-fetch.mjs <slug> \
//     --description "weathered orbital marshal in matte black tac plate" \
//     [--size 64] [--view "low top-down"] [--proportions heroic] \
//     [--outline ...] [--shading ...] [--detail ...] \
//     [--skip-walk] [--walk-frames 8] [--force]
//
// Then:
//   npm run art
//
// Endpoint behaviour (probed against the live API — the public OpenAPI doc
// describes some fields incorrectly):
//   POST /v2/create-character-with-4-directions  → always async; returns
//     { background_job_id, character_id, status: "processing" } immediately.
//   POST /v2/animate-character                   → async; returns one
//     background_job_id per direction.
//   GET  /v2/background-jobs/{id}                → poll until status is
//     "completed" or "failed". On completion:
//       create:   last_response.storage_urls.{dir}    = PNG URL (Backblaze)
//       animate:  last_response.storage_urls.frames   = array of PNG URLs
//                 (one per frame; Pixel Lab returns frame_count + 1 to make
//                 the cycle loop cleanly — asking for 8 yields 9)
//     We download from storage_urls. The `images[*].base64` field in the
//     same response is RAW RGBA bytes (not PNG-encoded), so it's unusable
//     without client-side image construction. Use the URLs.
//
// Quirks:
//   - image_size snaps to Pixel Lab's grid — 64×64 returns 92×92.
//   - Walk frame count clamped to 4-16, must be even (their v3 mode rule).
//   - Their TLS cert rotates often and our sandbox clock can be ~1s ahead of
//     their CA — we transparently retry on CERT_NOT_YET_VALID.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "art");

const API_BASE = process.env.PIXELLAB_API_BASE ?? "https://api.pixellab.ai/v2";
const TOKEN = process.env.PIXELLAB_API_TOKEN;

const VIEWS = new Set(["side", "low top-down", "high top-down"]);
const PROPORTIONS = new Set([
  "chibi",
  "cartoon",
  "stylized",
  "realistic_male",
  "realistic_female",
  "heroic",
]);
const DIRECTIONS = ["south", "north", "east", "west"];

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
    'usage: node scripts/pixellab-fetch.mjs <slug> --description "..."\n' +
      '       [--size 64] [--view "low top-down"] [--proportions heroic]\n' +
      "       [--outline ...] [--shading ...] [--detail ...]\n" +
      "       [--skip-walk] [--walk-frames 8] [--force]\n\n" +
      "View options: " + [...VIEWS].map((v) => `"${v}"`).join(", ") + "\n" +
      "  (also accepts low_top_down / low-top-down — normalised to API form)\n" +
      "Proportions: " + [...PROPORTIONS].join(", ") + "\n\n" +
      "Requires PIXELLAB_API_TOKEN env var.",
  );
  process.exit(message ? 1 : 0);
}

function normaliseView(s) {
  // Accept low_top_down / low-top-down / low top-down → "low top-down"
  const v = s.toLowerCase().replace(/_/g, " ").replace(/^(low|high) (top.down)$/, (_, h) => `${h} top-down`);
  return v;
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
    throw new Error(`download ${url} did not return a PNG (first 4 bytes: ${[...buf.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ")})`);
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

async function ensureEmptyDir(dir, { force }) {
  const has = await fs
    .stat(dir)
    .then(() => true)
    .catch(() => false);
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

  const slug = args._[0];
  if (!slug) usage("missing <slug> positional argument");
  if (!/^[a-z0-9]+$/.test(slug)) usage("<slug> must be lowercase alphanumeric");
  if (!TOKEN) usage("PIXELLAB_API_TOKEN env var is required");
  if (!args.description || typeof args.description !== "string") {
    usage('--description "..." is required');
  }

  const size = Number.parseInt(args.size ?? "64", 10);
  if (!Number.isFinite(size) || size < 16 || size > 256) {
    usage("--size must be an integer between 16 and 256");
  }

  const view = normaliseView(args.view ?? "low top-down");
  if (!VIEWS.has(view)) {
    usage(`--view must normalise to one of ${[...VIEWS].map((v) => `"${v}"`).join(", ")}`);
  }

  const proportions = args.proportions ?? "heroic";
  if (!PROPORTIONS.has(proportions)) {
    usage(`--proportions must be one of ${[...PROPORTIONS].join(", ")}`);
  }

  const walkFrames = Number.parseInt(args["walk-frames"] ?? "8", 10);
  if (!Number.isFinite(walkFrames) || walkFrames < 4 || walkFrames > 16 || walkFrames % 2 !== 0) {
    usage("--walk-frames must be an even integer in 4..16");
  }
  const skipWalk = args["skip-walk"] === true;
  const force = args.force === true;

  const createBody = {
    description: args.description,
    image_size: { width: size, height: size },
    view,
    proportions: { type: "preset", name: proportions },
  };
  for (const k of ["outline", "shading", "detail"]) {
    if (typeof args[k] === "string") createBody[k] = args[k];
  }

  console.log(`Pixel Lab → ${slug} (${size}×${size}, "${view}", ${proportions})`);
  console.log(`  "${args.description}"`);

  // ── Phase 1: rotations (idle) ──────────────────────────────────────────
  const create = await postJson("/create-character-with-4-directions", createBody);
  if (!create.background_job_id) {
    throw new Error(`no background_job_id in create response: ${JSON.stringify(create)}`);
  }
  console.log(`  character_id: ${create.character_id}`);
  console.log(`  polling rotations job ${create.background_job_id.slice(0, 8)}...`);

  const idleJob = await pollJob(create.background_job_id, { label: "rotations" });
  const idleResp = idleJob.last_response;
  if (!idleResp?.storage_urls) {
    throw new Error(`completed rotations job has no last_response.storage_urls: ${JSON.stringify(idleResp).slice(0, 300)}`);
  }
  const actualW = idleResp.image_width ?? "?";
  const actualH = idleResp.image_height ?? "?";
  if (actualW !== size || actualH !== size) {
    console.log(`  note: returned size ${actualW}×${actualH} (Pixel Lab snaps to its own grid)`);
  }

  await writeIdleFrames(slug, idleResp.storage_urls, force);

  // ── Phase 2: walk cycle ────────────────────────────────────────────────
  if (skipWalk) {
    console.log("  skipping walk cycle (--skip-walk)");
  } else {
    console.log(`  animating walkcycle (${walkFrames} frames × 4 directions)...`);
    const anim = await postJson("/animate-character", {
      character_id: create.character_id,
      action_description: "walking",
      mode: "v3",
      frame_count: walkFrames,
      directions: DIRECTIONS,
    });
    if (!Array.isArray(anim.background_job_ids) || anim.background_job_ids.length !== anim.directions?.length) {
      throw new Error(`unexpected animate response: ${JSON.stringify(anim).slice(0, 300)}`);
    }

    // Poll all 4 direction-jobs concurrently — each is independent.
    const dirJobs = anim.directions.map((dir, i) => ({
      dir,
      jobId: anim.background_job_ids[i],
    }));
    const completed = await Promise.all(
      dirJobs.map(async ({ dir, jobId }) => ({
        dir,
        job: await pollJob(jobId, { label: dir }),
      })),
    );

    for (const { dir, job } of completed) {
      const urls = job.last_response?.storage_urls?.frames;
      if (!Array.isArray(urls) || urls.length === 0) {
        throw new Error(`walkcycle ${dir}: no frames in last_response.storage_urls.frames`);
      }
      const outDir = path.join(ART_DIR, slug, "walkcycle", dir);
      await ensureEmptyDir(outDir, { force });
      const pngs = await Promise.all(urls.map((u) => downloadPng(u)));
      for (let i = 0; i < pngs.length; i++) {
        const name = String(i + 1).padStart(2, "0") + ".png";
        await fs.writeFile(path.join(outDir, name), pngs[i]);
      }
      console.log(`  wrote ${pngs.length} frames → art/${slug}/walkcycle/${dir}/`);
    }
  }

  console.log("\nNext:");
  console.log("  npm run art   # pack atlas + regenerate char-anims.generated.ts");
  console.log(`\nRemote character_id: ${create.character_id}`);
}

async function writeIdleFrames(slug, storageUrls, force) {
  for (const dir of DIRECTIONS) {
    const url = storageUrls[dir];
    if (!url) throw new Error(`rotations: missing storage_urls.${dir}`);
    const png = await downloadPng(url);
    const outDir = path.join(ART_DIR, slug, "idle", dir);
    await ensureEmptyDir(outDir, { force });
    await fs.writeFile(path.join(outDir, "01.png"), png);
  }
  console.log(`  wrote idle/{${DIRECTIONS.join(",")}}/01.png`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
