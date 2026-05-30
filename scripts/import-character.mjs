// import-character.mjs — convert a raw character sprite zip into the
// art/<slug>/<anim>/<dir>/NN.png layout that build-atlas.mjs consumes.
//
// The zips are 8-direction Ed/SpriteForge exports:
//   <top>/rotations/<dir>.png
//   <top>/animations/<Name>-<hash>/<dir>/frame_NNN.png
// We keep only the four cardinal directions (diagonals dropped), rename each
// animation folder per the SLUG_MAPS table below (export name with the trailing
// -<hash> stripped → curated key the engine looks up), skip unmapped anims, and
// renumber frames 01.png, 02.png, … in lexical order.
//
// Usage:   node scripts/import-character.mjs <project.zip> <slug>
// Then:    npm run art   (packs the atlas + regenerates char-anims.generated.ts)

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "art");
const CARDINAL = new Set(["north", "south", "east", "west"]);
const ALL_DIRECTIONS = new Set(["north", "south", "east", "west", "north-east", "north-west", "south-east", "south-west"]);

// mode: "replace" wipes art/<slug> first; "merge" overwrites only the mapped
// anim folders (keeps other existing anims).
// anims: rawExportName (hash stripped) → curated anim key, or an array of keys
// when one source feeds several (e.g. the enforcer's single idle loop → idle+stand).
const SLUG_MAPS = {
  rowanibarra: {
    mode: "replace",
    anims: {
      Walking: "walkcycle",
      Running: "runcycle",
      Push_Object: "pushobject",
      Pull_Object: "pullobject",
      Picking_Up: "pickupitem",
      Throw_Object: "throwobject",
      Crouched_Walking: "crouched_walkcycle",
      Crouching: "crouched_stand",
      Breathing_Idle: "stand",
      suffocate: "suffocate",
      terminal1: "interactterminal",
    },
  },
  enforcer: {
    mode: "replace",
    anims: {
      move: ["walkcycle", "chase"],
      idle: ["idle", "stand"],
      apprehend: "crosspunch",
      deactivate: "deactivated",
      panic: "panic",
      reactivate: "reactivate",
    },
  },
  orderly: {
    mode: "replace",
    anims: {
      Breathing_Idle: "stand",
      Walking: "walkcycle",
      Running: "runcycle",
      busy_animation: "idle",
    },
  },
  // EIRA-7: all-new character design at 68×68. Maps all cardinal-direction
  // animations exported from Ed/SpriteForge.
  eira7: {
    mode: "replace",
    anims: {
      animation: "idle",
      interact: "interact",
      walk_cycle: "walkcycle",
    },
  },
  // Security camera: 8 directions for smooth full-rotation animation.
  // All direction blocks (animation/animation_2-8) feed the same "idle" key.
  securitycamera: {
    mode: "replace",
    allDirections: true,
    anims: {
      animation: "idle",
      animation_2: "idle",
      animation_3: "idle",
      animation_4: "idle",
      animation_5: "idle",
      animation_6: "idle",
      animation_7: "idle",
      animation_8: "idle",
    },
  },
  // MITE-3: swarm coalesces and dissolves. Sparse directional coverage
  // (east for idle, south-west for others). Include diagonals for available frames.
  mite3swarm: {
    mode: "replace",
    allDirections: true,
    anims: {
      coalesce: "forming",
      dissolve: "dissipating",
      animation: "idle",
      animation_2: "walkcycle",
      attack: "attack",
      devour_opponent: "devour",
    },
  },
};

function die(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

const stripHash = (s) => s.replace(/-[0-9a-f]{6,}$/i, "");

async function main() {
  const [input, slug] = process.argv.slice(2);
  if (!input || !slug) die("usage: node scripts/import-character.mjs <zip> <slug>");
  const map = SLUG_MAPS[slug];
  if (!map) {
    die(`no anim map for slug "${slug}" (known: ${Object.keys(SLUG_MAPS).join(", ")})`);
  }
  const useAllDirections = map.allDirections || false;
  const directionFilter = useAllDirections ? ALL_DIRECTIONS : CARDINAL;
  const zipPath = path.resolve(input);
  if (!existsSync(zipPath)) die(`not found: ${zipPath}`);

  const tmp = await fs.mkdtemp(path.join(ROOT, ".charimport-tmp-"));
  try {
    const r = spawnSync("unzip", ["-o", "-q", zipPath, "-d", tmp], { stdio: "inherit" });
    if (r.status !== 0) die(`unzip failed for ${zipPath}`);

    // Collect every PNG under any */animations/<anim>/<dir>/*.png, ignoring the
    // (possibly hash-named or duplicated) top-level directory.
    const frames = [];
    const walk = async (dir) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.name.toLowerCase().endsWith(".png") && !e.name.startsWith("._")) {
          const rel = path.relative(tmp, full).split(path.sep).join("/");
          if (rel.startsWith("__MACOSX/")) continue;
          const m = rel.match(/\/animations\/([^/]+)\/([^/]+)\/[^/]+\.png$/);
          if (m) frames.push({ anim: stripHash(m[1]), dir: m[2].toLowerCase(), abs: full });
        }
      }
    };
    await walk(tmp);

    // Group by (target anim, cardinal dir).
    const groups = new Map();
    for (const f of frames) {
      if (!directionFilter.has(f.dir)) continue;
      const targets = map.anims[f.anim];
      if (!targets) continue;
      for (const t of Array.isArray(targets) ? targets : [targets]) {
        const k = `${t}/${f.dir}`;
        let arr = groups.get(k);
        if (!arr) {
          arr = [];
          groups.set(k, arr);
        }
        arr.push(f.abs);
      }
    }
    if (groups.size === 0) {
      die(`no mapped cardinal-direction frames found for slug "${slug}"`);
    }

    const slugDir = path.join(ART_DIR, slug);
    if (map.mode === "replace" && existsSync(slugDir)) {
      await fs.rm(slugDir, { recursive: true, force: true });
    }

    const summary = {};
    for (const [k, files] of [...groups].sort()) {
      const [anim, dir] = k.split("/");
      files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
      const outDir = path.join(slugDir, anim, dir);
      await fs.rm(outDir, { recursive: true, force: true });
      await fs.mkdir(outDir, { recursive: true });
      let i = 1;
      for (const src of files) {
        await fs.copyFile(src, path.join(outDir, String(i++).padStart(2, "0") + ".png"));
      }
      (summary[anim] ??= {})[dir] = files.length;
    }

    console.log(`imported ${slug} (${map.mode}) → art/${slug}/`);
    for (const anim of Object.keys(summary).sort()) {
      const dirs = Object.entries(summary[anim]).map(([d, n]) => `${d}:${n}`).join(" ");
      console.log(`  ${anim.padEnd(20)} ${dirs}`);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
