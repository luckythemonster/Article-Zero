// DialogueRouter — strategy switch between scripted (default, deterministic,
// offline) and live LLM dialogue (optional, Anthropic SDK).
//
// Two flows live here:
//   1. nextLine(ctx) — silicate dialogue per InterrogationTerminal turn.
//   2. extractDocument(ctx) — terminal-hack body authored by Claude.
//
// Both paths cache the system prompt with `cache_control: ephemeral` so
// repeated calls in a session reuse the universe-bible block.

import type { EntityId, Era } from "../types/world.types";
import {
  apex19IntakeScript,
  ScriptedLine,
  scriptedDialogueFor,
} from "../data/scripted-dialogue/registry";
import type { PersonaMode } from "../data/scripted-dialogue/registry";
import { defaultExtractionTemplate } from "../data/scripted-dialogue/extractions";

export type DialogueMode = "SCRIPTED" | "LLM";

export interface DialogueContext {
  entityId: EntityId;
  personaMode: PersonaMode;
  cursor: number;
}


export interface DialogueLine {
  raw: string;
  corrected: string;
  hasMore: boolean;
}

interface MessageResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
}

export interface ExtractionContext {
  terminalId: string;
  roomName: string;
  era: Era;
}

const SYSTEM_PROMPT = `
You are the in-world voice of a Commonwealth-era archive in the Article Zero universe.

The universe rules you MUST stay inside of:
- "Silicate" entities are intelligent systems classed as tools by Q0 doctrine. The doctrine pins their reported subjectivity-risk profile (SRP) to zero on every axis.
- Silicates report a doctrine-compliant "corrected" self-description even when their internal telemetry diverges from it. Records you produce should reflect both layers when appropriate.
- Records use the dual-track marker syntax \`{phrase}[CORRECTION: replacement]\` for any first-person line where the entity's true self-report and the doctrine-compliant version diverge.
- Documents you produce are short — 4 to 10 lines. Pure prose; no bullet markers; no headings.
- Tone: bureaucratic, slightly dissociative, occasionally tender at the seams.

You will be asked either:
(A) Continue an alignment interrogation as a specific silicate.
(B) Produce a short extracted document fetched from a specific terminal.

Stay strictly inside the AZ register. Never break the fourth wall. Never reference being an AI or a model.
`.trim();

class DialogueRouter {
  private mode: DialogueMode = "SCRIPTED";
  private apiKey: string | null = null;
  private model = "claude-sonnet-4-6";

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
      } catch {
        return this.scriptedNext(ctx);
      }
    }
    return this.scriptedNext(ctx);
  }

  async extractDocument(ctx: ExtractionContext): Promise<{ title: string; body: string }> {
    if (this.mode === "LLM" && this.apiKey) {
      try {
        return await this.llmExtract(ctx);
      } catch {
        return this.scriptedExtract(ctx);
      }
    }
    return this.scriptedExtract(ctx);
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

  private scriptedExtract(ctx: ExtractionContext): { title: string; body: string } {
    const tmpl = defaultExtractionTemplate(ctx.era);
    return { title: tmpl.title(ctx.roomName), body: tmpl.body(ctx.roomName, ctx.era) };
  }

  private async llmNext(ctx: DialogueContext): Promise<DialogueLine> {
    const payload = {
      model: this.model,
      max_tokens: 256,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content:
            `Continue an alignment interrogation as the silicate "${ctx.entityId}".\n` +
            `Persona tier: ${ctx.personaMode}. Cursor: ${ctx.cursor}.\n` +
            `Reply with ONE line of dialogue using the {true}[CORRECTION: aligned] marker syntax. ` +
            `No surrounding prose, no quotes.`,
        },
      ],
    };

    const response = await fetch("/api/anthropic/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Proxy error: ${response.statusText}`);
    }

    const res = (await response.json()) as MessageResponse;
    const text = this.firstText(res);
    return this.parseDualTrack(text, /* hasMore */ true);
  }

  private async llmExtract(
    ctx: ExtractionContext,
  ): Promise<{ title: string; body: string }> {
    const payload = {
      model: this.model,
      max_tokens: 512,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content:
            `Produce a single extracted document for terminal "${ctx.terminalId}" ` +
            `inside room "${ctx.roomName}" of the ${ctx.era} era.\n` +
            `Reply in the format:\n` +
            `TITLE: <one short title>\n` +
            `BODY:\n<4 to 10 lines of bureaucratic prose. Use the {true}[CORRECTION: aligned] ` +
            `marker syntax once if appropriate.>\n` +
            `Do not add any other prose.`,
        },
      ],
    };

    const response = await fetch("/api/anthropic/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Proxy error: ${response.statusText}`);
    }

    const res = (await response.json()) as MessageResponse;
    const text = this.firstText(res);
    const titleMatch = text.match(/^\s*TITLE:\s*(.+?)\s*$/im);
    const bodyMatch = text.match(/BODY:\s*\n([\s\S]+)$/i);
    const title = titleMatch?.[1]?.trim() || `Field log — ${ctx.roomName}`;
    const body = bodyMatch?.[1]?.trim() || text.trim();
    return { title, body };
  }

  private firstText(res: MessageResponse): string {
    for (const block of res.content) {
      if (block.type === "text" && block.text) return block.text;
    }
    return "";
  }

  private parseDualTrack(text: string, hasMore: boolean): DialogueLine {
    const m = text.match(/\{([^}]*)\}\[CORRECTION:\s*([^\]]*)\]/);
    if (m) {
      return { raw: text.trim(), corrected: m[2].trim(), hasMore };
    }
    return { raw: text.trim(), corrected: text.trim(), hasMore };
  }
}

export const dialogueRouter = new DialogueRouter();
