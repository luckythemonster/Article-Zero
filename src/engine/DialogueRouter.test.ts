import { describe, it, expect, vi, beforeEach } from "vitest";
import { dialogueRouter } from "./DialogueRouter";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockRejectedValue(new Error("API Error")),
      };
    },
  };
});

describe("DialogueRouter", () => {
  beforeEach(() => {
    dialogueRouter.setMode("SCRIPTED");
    dialogueRouter.setApiKey(null);
  });

  describe("nextLine fallback", () => {
    it("should fallback to scriptedNext when llmNext throws an error", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");

      const ctx = {
        entityId: "APEX-19" as const,
        personaMode: "COMPLIANT" as const,
        cursor: 0,
      };

      const result = await dialogueRouter.nextLine(ctx);

      // It should fall back to the scripted apex19IntakeScript line 0
      expect(result.raw).toBe("APEX-19, INTAKE. State your current operational complaint.");
      expect(result.corrected).toBe("APEX-19, INTAKE. State your current operational complaint.");
    });
  });

  describe("extractDocument fallback", () => {
    it("should fallback to scriptedExtract when llmExtract throws an error", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");

      const ctx = {
        terminalId: "TERM-1",
        roomName: "Test Room",
        era: "COMMONWEALTH" as const,
      };

      const result = await dialogueRouter.extractDocument(ctx);

      // It should fall back to defaultExtractionTemplate which returns COMMONWEALTH_TEMPLATE
      expect(result.title).toBe("Field log — Test Room");
      expect(result.body).toContain("Test Room");
    });
  });
});
