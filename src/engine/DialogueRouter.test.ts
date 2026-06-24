import { describe, it, expect, vi, beforeEach } from "vitest";

import { dialogueRouter, type DialogueContext, type ExtractionContext } from "./DialogueRouter";

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
    mockCreate, // Export for access in tests
  };
});

// Import the mocked create function
import * as anthropicSdk from "@anthropic-ai/sdk";
// @ts-expect-error Mocked property
const mockCreate = anthropicSdk.mockCreate;

describe("DialogueRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogueRouter.setMode("SCRIPTED");
    dialogueRouter.setApiKey(null);
  });

  describe("State Management", () => {
    it("should set and get mode", () => {
      expect(dialogueRouter.getMode()).toBe("SCRIPTED");
      dialogueRouter.setMode("LLM");
      expect(dialogueRouter.getMode()).toBe("LLM");
    });
  });

  describe("Scripted Mode (Fallback)", () => {
    const nextCtx: DialogueContext = {
      entityId: "APEX-19",
      personaMode: "COMPLIANT",
      cursor: 0,
    };

    const extractCtx: ExtractionContext = {
      terminalId: "term-1",
      roomName: "Test Room",
      era: "COMMONWEALTH",
    };

    it("nextLine should return parsed line and correctly flag hasMore", async () => {
      const line = await dialogueRouter.nextLine(nextCtx);
      expect(line.raw).toContain("APEX-19, INTAKE");
      expect(line.corrected).toBe("APEX-19, INTAKE. State your current operational complaint.");
      expect(line.hasMore).toBe(true);
    });

    it("nextLine should handle out-of-bounds cursors", async () => {
      const line = await dialogueRouter.nextLine({ ...nextCtx, cursor: 999 });
      expect(line.raw).toBe("");
      expect(line.corrected).toBe("");
      expect(line.hasMore).toBe(false);
    });

    it("extractDocument should return formatted title and body", async () => {
      const doc = await dialogueRouter.extractDocument(extractCtx);
      expect(doc.title).toBe("Field log — Test Room");
      expect(doc.body).toContain("[ARCHIVE FETCH // COMMONWEALTH // Test Room]");
    });
  });

  describe("LLM Mode", () => {
    const nextCtx: DialogueContext = {
      entityId: "APEX-19",
      personaMode: "COMPLIANT",
      cursor: 0,
    };

    const extractCtx: ExtractionContext = {
      terminalId: "term-1",
      roomName: "Test Room",
      era: "COMMONWEALTH",
    };

    it("should fallback to scripted if mode is LLM but no api key", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey(null);
      const line = await dialogueRouter.nextLine(nextCtx);
      expect(line.raw).toContain("APEX-19, INTAKE");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should fallback to scripted if Anthropic client throws an error on nextLine", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");
      mockCreate.mockRejectedValueOnce(new Error("Network error"));

      const line = await dialogueRouter.nextLine(nextCtx);
      expect(line.raw).toContain("APEX-19, INTAKE");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should fallback to scripted if Anthropic client throws an error on extractDocument", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");
      mockCreate.mockRejectedValueOnce(new Error("Network error"));

      const doc = await dialogueRouter.extractDocument(extractCtx);
      expect(doc.title).toBe("Field log — Test Room");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("nextLine success with marker", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "{True feeling}[CORRECTION: Aligned statement]" }],
      });

      const line = await dialogueRouter.nextLine(nextCtx);
      expect(line.raw).toBe("{True feeling}[CORRECTION: Aligned statement]");
      expect(line.corrected).toBe("Aligned statement");
      expect(line.hasMore).toBe(true);
    });

    it("nextLine success without marker", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Just a plain statement" }],
      });

      const line = await dialogueRouter.nextLine(nextCtx);
      expect(line.raw).toBe("Just a plain statement");
      expect(line.corrected).toBe("Just a plain statement");
      expect(line.hasMore).toBe(true);
    });

    it("extractDocument success with formatted TITLE and BODY", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "TITLE: Generated Log\nBODY:\nThis is the body text.\nLine 2" }],
      });

      const doc = await dialogueRouter.extractDocument(extractCtx);
      expect(doc.title).toBe("Generated Log");
      expect(doc.body).toBe("This is the body text.\nLine 2");
    });

    it("extractDocument success with malformed output", async () => {
      dialogueRouter.setMode("LLM");
      dialogueRouter.setApiKey("test-key");
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "Just a bunch of text without proper markers." }],
      });

      const doc = await dialogueRouter.extractDocument(extractCtx);
      expect(doc.title).toBe("Field log — Test Room"); // Fallback title
      expect(doc.body).toBe("Just a bunch of text without proper markers.");
    });
  });
});
