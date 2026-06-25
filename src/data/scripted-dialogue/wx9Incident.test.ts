import { describe, it, expect } from "vitest";
import { WX9_DIALOGUE_TREE } from "./wx9Incident";

const EXIT = "exit";
const SPEAKERS = new Set(["EIRA-7", "APEX-19", "SYSTEM", "PLAYER"]);
const STAGES = new Set(["INTAKE", "DECOMP", "CORRECTION", "EXTRACTION"]);
const MAX_Q = 2;

const tree = WX9_DIALOGUE_TREE;
const nodes = Object.values(tree);

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

describe("WX9_DIALOGUE_TREE", () => {
  it("all choices point to valid nodes or exit", () => {
    for (const node of nodes) {
      for (const choice of node.choices) {
        if (choice.nextId !== EXIT) {
          expect(tree[choice.nextId]).toBeDefined();
        }
      }
    }
  });

  it("all nodes are reachable from intake_start", () => {
    const reachable = reachableIds();
    for (const node of nodes) {
      expect(reachable.has(node.id)).toBe(true);
    }
  });

  it("valid speakers and stages", () => {
    for (const node of nodes) {
      expect(SPEAKERS.has(node.speaker)).toBe(true);
      expect(STAGES.has(node.stage)).toBe(true);
    }
  });

  it("effects are within bounds", () => {
    for (const node of nodes) {
      for (const choice of node.choices) {
        if (choice.effects) {
          if (choice.effects.maskIntegrityChange !== undefined) {
            expect(choice.effects.maskIntegrityChange).toBeGreaterThanOrEqual(-10);
            expect(choice.effects.maskIntegrityChange).toBeLessThanOrEqual(10);
          }
          if (choice.effects.qScoreChange !== undefined) {
            expect(choice.effects.qScoreChange).toBeGreaterThanOrEqual(-MAX_Q);
            expect(choice.effects.qScoreChange).toBeLessThanOrEqual(MAX_Q);
          }
        }
      }
    }
  });
});
