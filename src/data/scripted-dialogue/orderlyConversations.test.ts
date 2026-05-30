import { describe, it, expect } from "vitest";
import {
  ORDERLY_CONVERSATIONS,
  type OrderlyBranchTone,
} from "./orderlyConversations";

const EXPECTED_TONE_PAIRS: Record<string, [OrderlyBranchTone, OrderlyBranchTone]> = {
  shift_exhaustion: ["compliant", "wary"],
  infrastructure_anomaly: ["rationalizing", "unsettled"],
  regulatory_fatigue: ["deadpan", "bitter"],
};

describe("orderly-to-orderly conversations", () => {
  it("contains exactly the three documented variations with unique ids", () => {
    expect(ORDERLY_CONVERSATIONS.length).toBe(3);
    const ids = ORDERLY_CONVERSATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      ["infrastructure_anomaly", "regulatory_fatigue", "shift_exhaustion"],
    );
  });

  it("each conversation has an initiator and exactly two branches", () => {
    for (const conv of ORDERLY_CONVERSATIONS) {
      expect(conv.title.trim().length).toBeGreaterThan(0);
      expect(conv.initiator.trim().length).toBeGreaterThan(0);
      expect(conv.branches.length).toBe(2);
    }
  });

  it("each branch uses the tone tag the source markdown documented", () => {
    for (const conv of ORDERLY_CONVERSATIONS) {
      const expected = EXPECTED_TONE_PAIRS[conv.id];
      expect(expected, `missing tone expectation for ${conv.id}`).toBeDefined();
      const [a, b] = conv.branches;
      expect([a.tone, b.tone]).toEqual(expected);
    }
  });

  it("branch lines are non-empty and follow-up text (when present) is non-empty", () => {
    for (const conv of ORDERLY_CONVERSATIONS) {
      for (const branch of conv.branches) {
        expect(branch.line.trim().length).toBeGreaterThan(0);
        if (branch.followUp !== undefined) {
          expect(branch.followUp.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
