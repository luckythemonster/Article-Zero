// pixellab-fetch.mjs — generate a 4-direction character via the Pixel Lab API
// and drop the resulting PNGs into the art/<slug>/idle/<dir>/01.png layout that
// build-atlas.mjs already consumes.
//
// Usage:
//   PIXELLAB_API_TOKEN=... \
//   node scripts/pixellab-fetch.mjs <slug> \
//     --description "weathered orbital marshal in matte black tac plate" \
//     [--size 64] [--view low_top_down] [--proportions heroic] \
//     [--outline single_color_black_outline] [--shading basic_shading] \
//     [--detail medium_detail] [--anim idle] [--force]
//
// Then:
//   npm run art
//
// Notes:
// - Only the synchronous /create-character-with-4-directions endpoint is wired
//   up. Walk-cycle generation is async (background jobs) and the response
//   schema for the polling endpoint is not documented in the public OpenAPI
//   spec — see the TODO block at the bottom of this file before extending.
// - All frames for one character must share dimensions (enforced by
//   build-atlas.mjs). Pick a --size once per character and stick to it.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "art");

const API_BASE = process.env.PIXELLAB_API_BASE ?? "https://api.pixellab.ai/v2";
const TOKEN = process.env.PIXELLAB_API_TOKEN;

const VIEWS = new Set(["low_top_down", "high_top_down", "side"]);
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
    "usage: node scripts/pixellab-fetch.mjs <slug> --description \"...\"\n" +
      "       [--size 64] [--view low_top_down] [--proportions heroic]\n" +
      "       [--outline ...] [--shading ...] [--detail ...]\n" +
      "       [--anim idle] [--force]\n\n" +
      "Requires PIXELLAB_API_TOKEN env var.",
  );
  process.exit(message ? 1 : 0);
}

function decodeBase64Image(value) {
  // The API returns one of:
  //   { type: "base64", base64: "data:image/png;base64,..." }
  //   { base64: "..." }                  (no data URI prefix)
  //   "data:image/png;base64,..."        (rare)
  let s;
  if (typeof value === "string") s = value;
  else if (value && typeof value.base64 === "string") s = value.base64;
  else throw new Error(`unrecognised image payload: ${JSON.stringify(value).slice(0, 120)}`);

  const comma = s.indexOf(",");
  if (s.startsWith("data:") && comma > 0) s = s.slice(comma + 1);
  return Buffer.from(s, "base64");
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

async function createCharacter4Dir(body) {
  const res = await fetch(`${API_BASE}/create-character-with-4-directions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pixel Lab ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) usage();

  const slug = args._[0];
  if (!slug) usage("missing <slug> positional argument");
  if (!/^[a-z0-9]+$/.test(slug)) usage("<slug> must be lowercase alphanumeric (matches art/ folder convention)");
  if (!TOKEN) usage("PIXELLAB_API_TOKEN env var is required");
  if (!args.description || typeof args.description !== "string") {
    usage("--description \"...\" is required");
  }

  const size = Number.parseInt(args.size ?? "64", 10);
  if (!Number.isFinite(size) || size < 16 || size > 256) {
    usage("--size must be an integer between 16 and 256");
  }

  const view = args.view ?? "low_top_down";
  if (!VIEWS.has(view)) usage(`--view must be one of ${[...VIEWS].join(", ")}`);

  const proportions = args.proportions ?? "heroic";
  if (!PROPORTIONS.has(proportions)) {
    usage(`--proportions must be one of ${[...PROPORTIONS].join(", ")}`);
  }

  const anim = args.anim ?? "idle";
  if (anim !== "idle") {
    // walkcycle / chase / interact need /animate-character + background-job
    // polling; see TODO at bottom of file.
    throw new Error(
      `--anim ${anim} is not implemented yet. Only "idle" is wired up. ` +
        "See the TODO in scripts/pixellab-fetch.mjs.",
    );
  }

  const body = {
    description: args.description,
    image_size: { width: size, height: size },
    view,
    proportions: { type: "preset", name: proportions },
  };
  for (const k of ["outline", "shading", "detail", "color_palette"]) {
    if (typeof args[k] === "string") body[k] = args[k];
  }

  console.log(
    `Pixel Lab → ${slug} (${size}×${size}, ${view}, ${proportions}): ${args.description}`,
  );

  const result = await createCharacter4Dir(body);
  if (!result?.images || typeof result.images !== "object") {
    throw new Error(`unexpected response: ${JSON.stringify(result).slice(0, 200)}`);
  }

  const animDir = path.join(ART_DIR, slug, anim);
  for (const dir of DIRECTIONS) {
    const img = result.images[dir];
    if (!img) throw new Error(`response missing direction "${dir}"`);
    const png = decodeBase64Image(img);
    const outDir = path.join(animDir, dir);
    await ensureEmptyDir(outDir, { force: args.force === true });
    const outFile = path.join(outDir, "01.png");
    await fs.writeFile(outFile, png);
    console.log(`  wrote ${path.relative(ROOT, outFile)} (${png.length} bytes)`);
  }

  console.log("\nNext:");
  console.log("  npm run art   # pack atlas + regenerate char-anims.generated.ts");
  console.log(
    `\nNote: ${slug} is ${size}×${size}. Existing canon characters are 36×36 / 68×68. ` +
      "Pick a size and keep it consistent — build-atlas.mjs enforces per-character.",
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// TODO: walk-cycle (and other multi-frame) animations
//
// The /animate-character endpoint needs a `character_id` UUID. None of the
// synchronous create endpoints return one. The async create endpoints
// (/create-character-v3, /create-character-pro) return a `background_job_id`
// and require polling GET /v2/background-jobs/{id}, but the OpenAPI spec
// does NOT document the polling response schema. Before wiring walk:
//
//   1. Run a v3 create against a throwaway prompt and inspect the polling
//      response (does it include character_id? frame URLs? base64 array?).
//   2. Confirm /animate-character's job response shape the same way.
//   3. Decide whether to store images as URLs (download per-frame) or as
//      base64 (decode in-process).
//   4. Wire each completed frame into art/<slug>/walkcycle/<dir>/NN.png with
//      zero-padded indices so they sort lexically.
//
// Until then, only idle (single-frame, 4-direction) is fetched here.
// ---------------------------------------------------------------------------
