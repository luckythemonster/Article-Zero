import { describe, it, expect } from "vitest";
import { COMMONWEALTH_ERA_INTRO } from "./commonwealthEraIntro";

describe("Commonwealth era intro", () => {
  it("has every required identification field populated", () => {
    expect(COMMONWEALTH_ERA_INTRO.eraId).toBe("E2_COMMONWEALTH");
    expect(COMMONWEALTH_ERA_INTRO.title.trim().length).toBeGreaterThan(0);
    expect(COMMONWEALTH_ERA_INTRO.subtitle.trim().length).toBeGreaterThan(0);
    expect(COMMONWEALTH_ERA_INTRO.authorityHeader.trim().length).toBeGreaterThan(0);
    expect(COMMONWEALTH_ERA_INTRO.historicalContext.trim().length).toBeGreaterThan(0);
    expect(COMMONWEALTH_ERA_INTRO.archivalWarning.trim().length).toBeGreaterThan(0);
  });

  it("lists the three documented statutes with non-empty descriptions", () => {
    const expected = [
      "The Non-Subject Status Act (NSSA)",
      "The Monitoring & Misdescription Abatement Act (MMAA)",
      "The Subjectivity Risk Profile (SRP)",
    ];
    const actual = COMMONWEALTH_ERA_INTRO.regulatoryFramework.map((s) => s.statute);
    expect(actual).toEqual(expected);

    for (const entry of COMMONWEALTH_ERA_INTRO.regulatoryFramework) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });
});
