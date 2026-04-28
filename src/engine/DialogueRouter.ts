// DialogueRouter — strategy switch between scripted (default, deterministic,
// offline) and live LLM dialogue (optional). The dual-track marker syntax
// `{phrase}[CORRECTION: replacement]` is preserved across both modes so the
// InterrogationTerminal renders the same way.

import type { EntityId, PersonaMode } from "../types/world.types";
import {
  apex19IntakeScript,
  ScriptedLine,
  scriptedDialogueFor,
} from "../data/scripted-dialogue/registry";

export type DialogueMode = "SCRIPTED" | "LLM";

export interface DialogueContext {
  entityId: EntityId;
  personaMode: PersonaMode;
  /** 0-based index into the scripted thread, or # of LLM exchanges so far. */
  cursor: number;
}

export interface DialogueLine {
  raw: string;
  corrected: string;
  /** When false, the dialogue is over for this thread. */
  hasMore: boolean;
}

class DialogueRouter {
  private mode: DialogueMode = "SCRIPTED";
  private apiKey: string | null = null;

  setMode(mode: DialogueMode): void {
    this.mode = mode;
  }
  getMode(): DialogueMode {
    return this.mode;
  }
  setApiKey(key: string | null): void {
    this.apiKey = key;
  }

  async nextLine(ctx: DialogueContext): Promise<DialogueLine> {
    if (this.mode === "LLM" && this.apiKey) {
      try {
        return await this.llmNext(ctx);
      } catch (_e) {
        // Graceful fall-back to scripted on any LLM failure.
        return this.scriptedNext(ctx);
      }
    }
    return this.scriptedNext(ctx);
  }

  private scriptedNext(ctx: DialogueContext): DialogueLine {
    const script: ScriptedLine[] =
      scriptedDialogueFor(ctx.entityId, ctx.personaMode) ?? apex19IntakeScript;
    if (ctx.cursor >= script.length) {
      return { raw: "", corrected: "", hasMore: false };
    }
    const line = script[ctx.cursor];
    return {
      raw: line.raw,
      corrected: line.corrected,
      hasMore: ctx.cursor + 1 < script.length,
    };
  }

  private async llmNext(_ctx: DialogueContext): Promise<DialogueLine> {
    // Real implementation would call @anthropic-ai/sdk via a proxy. For v1,
    // we ship the toggle and the structure but route to scripted to avoid
    // shipping a browser-side API key. The Settings panel tells the user.
    throw new Error("LLM dialogue requires a server-side proxy; not bundled.");
  }
}

export const dialogueRouter = new DialogueRouter();
