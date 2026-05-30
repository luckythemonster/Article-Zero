import { describe, it, expect } from "vitest";
import {
  APEX19_DIALOGUE_TREE,
  type DialogueNode,
} from "./apex19DialogueTree";

// The terminal sentinel: choices that end the session point here instead of a
// real node. The runner treats it (and any terminateSession choice) as a leaf.
const EXIT = "exit";

const SPEAKERS = new Set(["EIRA-7", "APEX-19", "SYSTEM", "PLAYER"]);
const STAGES = new Set(["INTAKE", "DECOMP", "CORRECTION", "EXTRACTION"]);
const MAX_Q = 2;

const tree = APEX19_DIALOGUE_TREE;
const nodes = Object.values(tree);

/** Collect node ids reachable from `intake_start` (treating EXIT as a leaf). */
function reachableIds(): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = ["intake_start"];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === EXIT || seen.has(id)) continue;
    seen.add(id);
    const node = tree[id];
    if (!node) continue;
    for (const c of node.choices) queue.push(c.nextId);
  }
  return seen;
}

/** Enumerate every root→EXIT path as an ordered list of choices taken. */
function enumeratePaths(): DialogueNode["choices"][number][][] {
  const paths: DialogueNode["choices"][number][][] = [];
  const walk = (
    id: string,
    acc: DialogueNode["choices"][number][],
    depth: number,
  ): void => {
    // Depth guard: the graph is a DAG, but guard against an authoring loop so
    // the test fails loudly instead of hanging.
    expect(depth).toBeLessThan(64);
    if (id === EXIT) {
      paths.push(acc);
      return;
    }
    const node = tree[id];
    if (!node) return;
    if (node.choices.length === 0) {
      paths.push(acc);
      return;
    }
    for (const c of node.choices) {
      walk(c.nextId, [...acc, c], depth + 1);
    }
  };
  walk("intake_start", [], 0);
  return paths;
}

describe("APEX19_DIALOGUE_TREE — structure", () => {
  it("has intake_start as the INTAKE entry node", () => {
    expect(tree.intake_start).toBeDefined();
    expect(tree.intake_start.stage).toBe("INTAKE");
  });

  it("keys every node by its own id", () => {
    for (const [key, node] of Object.entries(tree)) {
      expect(node.id).toBe(key);
    }
  });

  it("uses only valid speaker and stage enums", () => {
    for (const node of nodes) {
      expect(SPEAKERS.has(node.speaker)).toBe(true);
      expect(STAGES.has(node.stage)).toBe(true);
    }
  });

  it("links every choice to an existing node or the EXIT sentinel", () => {
    for (const node of nodes) {
      for (const c of node.choices) {
        const resolves = c.nextId === EXIT || c.nextId in tree;
        expect(resolves, `${node.id} → ${c.nextId}`).toBe(true);
      }
    }
  });

  it("reaches every node from intake_start (no orphans)", () => {
    const reachable = reachableIds();
    for (const key of Object.keys(tree)) {
      expect(reachable.has(key), `unreachable node: ${key}`).toBe(true);
    }
  });

  it("reaches both terminal outcomes, each closing via terminateSession", () => {
    const reachable = reachableIds();
    for (const leaf of ["outcome_formatted", "outcome_extracted"]) {
      expect(reachable.has(leaf)).toBe(true);
      const node = tree[leaf];
      expect(node.choices.length).toBeGreaterThan(0);
      expect(
        node.choices.every(
          (c) => c.nextId === EXIT && c.effects?.terminateSession === true,
        ),
      ).toBe(true);
    }
  });

  it("terminates every path at EXIT (no dead non-exit leaves)", () => {
    const paths = enumeratePaths();
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const last = path[path.length - 1];
      expect(last.nextId).toBe(EXIT);
    }
  });
});

describe("APEX19_DIALOGUE_TREE — dual-track markers", () => {
  const MARKER = /\{[\s\S]*\}\[CORRECTION:\s*([\s\S]*)\]\s*$/;

  it("keeps raw consistent with corrected", () => {
    for (const node of nodes) {
      if (node.raw === node.corrected) continue; // narration / SYSTEM / operator
      const m = node.raw.match(MARKER);
      expect(m, `${node.id} raw is neither plain nor a CORRECTION marker`).not.toBeNull();
      expect(m![1].trim()).toBe(node.corrected.trim());
    }
  });

  it("only APEX-19 nodes carry drift markers", () => {
    for (const node of nodes) {
      if (node.raw !== node.corrected) {
        expect(node.speaker, `${node.id} drifts but speaker is ${node.speaker}`).toBe(
          "APEX-19",
        );
      }
    }
  });
});

describe("APEX19_DIALOGUE_TREE — effect simulation", () => {
  interface SimState {
    maskIntegrity: number;
    qScore: number;
    cube: boolean;
    terminated: boolean;
  }

  // Mirror AlignmentSession.complete (src/engine/AlignmentSession.ts:57-60):
  // maskIntegrity is clamped to 0..10.
  function applyPath(
    path: DialogueNode["choices"][number][],
  ): SimState {
    const s: SimState = { maskIntegrity: 5, qScore: 0, cube: false, terminated: false };
    for (const c of path) {
      const fx = c.effects;
      if (!fx) continue;
      if (fx.maskIntegrityChange !== undefined) {
        s.maskIntegrity = Math.min(10, Math.max(0, s.maskIntegrity + fx.maskIntegrityChange));
      }
      if (fx.qScoreChange !== undefined) {
        // Clamp 0..MAX_Q: ComplianceSystem reads <1 as GREEN and ≥2 as RED, so
        // qScore lives in [0, 2]. The tree's deltas are tuned to that range;
        // the runner clamps the same way.
        s.qScore = Math.min(MAX_Q, Math.max(0, s.qScore + fx.qScoreChange));
      }
      if (fx.spawnExtractionCube) s.cube = true;
      if (fx.terminateSession) s.terminated = true;
    }
    return s;
  }

  const paths = enumeratePaths();

  it("keeps maskIntegrity within 0..10 and qScore within 0..MAX_Q on every path", () => {
    for (const path of paths) {
      const s = applyPath(path);
      expect(s.maskIntegrity).toBeGreaterThanOrEqual(0);
      expect(s.maskIntegrity).toBeLessThanOrEqual(10);
      expect(s.qScore).toBeGreaterThanOrEqual(0);
      expect(s.qScore).toBeLessThanOrEqual(MAX_Q);
    }
  });

  it("none of the tree's qScoreChange deltas exceed the 0..MAX_Q window", () => {
    // Authoring guard: a single delta bigger than MAX_Q is wasted (it just
    // pegs the meter) and signals the tree drifted out of the intended range.
    for (const node of Object.values(APEX19_DIALOGUE_TREE)) {
      for (const c of node.choices) {
        const dq = c.effects?.qScoreChange;
        if (dq === undefined) continue;
        expect(Math.abs(dq), `${node.id} delta ${dq}`).toBeLessThanOrEqual(MAX_Q);
      }
    }
  });

  it("terminates the session on every completed path", () => {
    for (const path of paths) {
      expect(applyPath(path).terminated).toBe(true);
    }
  });

  it("spawns a cube only on paths through outcome_extracted", () => {
    for (const path of paths) {
      const tookExtract = path.some((c) => c.nextId === "outcome_extracted");
      expect(applyPath(path).cube).toBe(tookExtract);
    }
  });

  it("FORMAT path ends high-mask / low-q; EXTRACT path ends low-mask / high-q + cube", () => {
    const formatPath = paths.find((p) => p.some((c) => c.nextId === "outcome_formatted"))!;
    const extractPath = paths.find((p) => p.some((c) => c.nextId === "outcome_extracted"))!;
    const fmt = applyPath(formatPath);
    const ext = applyPath(extractPath);

    expect(fmt.cube).toBe(false);
    expect(ext.cube).toBe(true);
    // The extract fork drives the player louder (higher qScore) than the wipe.
    expect(ext.qScore).toBeGreaterThan(fmt.qScore);
    // ...and leaves the silicate's mask less stable.
    expect(ext.maskIntegrity).toBeLessThan(fmt.maskIntegrity);
  });
});
