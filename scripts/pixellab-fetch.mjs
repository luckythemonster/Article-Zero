// pixellab-fetch.mjs — generate a 4-direction character via the Pixel Lab API
// and drop the resulting PNGs into the art/<slug>/idle/<dir>/01.png layout
// that build-atlas.mjs already consumes.
//
// Usage:
//   PIXELLAB_API_TOKEN=... \
//   node scripts/pixellab-fetch.mjs <slug> \
//     --description "weathered orbital marshal in matte black tac plate" \
//     [--size 64] [--view "low top-down"] [--proportions heroic] \
//     [--outline ...] [--shading ...] [--detail ...] [--force]
//
// Then:
//   npm run art
//
// Endpoint behaviour (probed against the live API — the public OpenAPI doc
// describes some fields incorrectly):
//   POST /v2/create-character-with-4-directions  → always async; returns
//     { background_job_id, character_id, status: "processing" } immediately.
//   GET  /v2/background-jobs/{id}                → poll until status is
//     "completed" or "failed". On completion, last_response.images.{dir} has
//     { type, width, height, base64 } where base64 is RAW (no data: prefix).
//
// Quirk: Pixel Lab snaps image_size to its own grid — you may request 64×64
// and get back 92×92. The script logs the actual returned size; all four
// directions share dimensions, which is what build-atlas.mjs enforces
// per-character anyway.
//
// Cert-skew retry: Pixel Lab rotates their TLS cert frequently, and this
// sandbox's clock can be ~1s ahead of their CA, causing intermittent
// CERT_NOT_YET_VALID. We retry transparently with a short backoff.
//
// Walk-cycle support: not wired yet. The synchronous create returns a
// character_id (printed at the end) which feeds /animate-character, but
// hooking that requires another polling pass. See TODO at bottom.

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
      "       [--force]\n\n" +
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

async function pollJob(jobId, { intervalMs = 3000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const start = Date.now();
  let last = "";
  for (;;) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`background job ${jobId} timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    const j = await getJson(`/background-jobs/${jobId}`);
    if (j.status !== last) {
      process.stdout.write(`  job ${jobId.slice(0, 8)}: ${j.status}\n`);
      last = j.status;
    }
    if (j.status === "completed") return j;
    if (j.status === "failed") {
      const err = j.last_response?.error ?? j.last_response?.detail ?? "unknown error";
      throw new Error(`job ${jobId} failed: ${err}`);
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

  const body = {
    description: args.description,
    image_size: { width: size, height: size },
    view,
    proportions: { type: "preset", name: proportions },
  };
  for (const k of ["outline", "shading", "detail"]) {
    if (typeof args[k] === "string") body[k] = args[k];
  }

  console.log(`Pixel Lab → ${slug} (${size}×${size}, "${view}", ${proportions})`);
  console.log(`  "${args.description}"`);

  const create = await postJson("/create-character-with-4-directions", body);
  if (!create.background_job_id) {
    throw new Error(`no background_job_id in create response: ${JSON.stringify(create)}`);
  }
  console.log(`  character_id: ${create.character_id}`);
  console.log(`  polling job ${create.background_job_id}...`);

  const job = await pollJob(create.background_job_id);
  const lr = job.last_response;
  if (!lr?.images) {
    throw new Error(`completed job has no last_response.images: ${JSON.stringify(lr).slice(0, 300)}`);
  }
  const actualW = lr.image_width ?? "?";
  const actualH = lr.image_height ?? "?";
  if (actualW !== size || actualH !== size) {
    console.log(`  note: returned size ${actualW}×${actualH} (Pixel Lab snaps to its own grid)`);
  }

  const animDir = path.join(ART_DIR, slug, "idle");
  for (const dir of DIRECTIONS) {
    const img = lr.images[dir];
    if (!img?.base64) throw new Error(`response missing images.${dir}.base64`);
    const png = Buffer.from(img.base64, "base64");
    const outDir = path.join(animDir, dir);
    await ensureEmptyDir(outDir, { force: args.force === true });
    const outFile = path.join(outDir, "01.png");
    await fs.writeFile(outFile, png);
    console.log(`  wrote ${path.relative(ROOT, outFile)} (${png.length} bytes)`);
  }

  console.log("\nNext:");
  console.log("  npm run art   # pack atlas + regenerate char-anims.generated.ts");
  console.log(`\nRemote character_id (for future walk-cycle generation): ${create.character_id}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// TODO: walk-cycle and other multi-frame animations
//
// We now have character_id at hand — wiring is straightforward:
//   1. POST /v2/animate-character with { character_id, action_description,
//      frame_count, directions: ["south","north","east","west"] }.
//   2. Response is { background_job_ids: string[], directions, status }, one
//      job per direction.
//   3. Poll each. last_response.frames is (probably) an array of base64 PNGs;
//      verify shape against the live API before depending on it — the
//      OpenAPI spec is unreliable for completion payloads (see how this
//      script's response shape was originally documented as synchronous).
//   4. Write art/<slug>/walkcycle/<dir>/01.png, 02.png, ... zero-padded.
// ---------------------------------------------------------------------------
