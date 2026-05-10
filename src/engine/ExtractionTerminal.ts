// ExtractionTerminal — sneak up, hold for N turns, get a Claude-authored file.
//
// The player must stand orthogonally adjacent to an EXTRACTION_TERMINAL tile,
// face it, and end their turn without being detected. Each qualifying turn
// increments `progress`. On `progress >= required` the engine asks
// `DialogueRouter.extractDocument` for a body and files it via DocumentArchive.

import type { RoomId, Tile, Vec2, WorldState } from "../types/world.types";
import { eventBus } from "./EventBus";
import { dialogueRouter } from "./DialogueRouter";
import { documentArchive } from "./DocumentArchive";

export interface TerminalState {
  terminalId: string;
  roomId: RoomId;
  pos: Vec2;
  progress: number;
  required: number;
}

class ExtractionTerminalSystem {
  private terminals = new Map<string, TerminalState>();

  reset(state: WorldState): void {
    this.terminals.clear();
    for (const [roomId, room] of state.rooms) {
      for (let y = 0; y < room.height; y++) {
        for (let x = 0; x < room.width; x++) {
          const tile = room.tiles[y * room.width + x];
          if (!tile || tile.kind !== "EXTRACTION_TERMINAL") continue;
          const id = `term-${roomId}-${x}-${y}`;
          this.terminals.set(id, {
            terminalId: id,
            roomId,
            pos: { x, y },
            progress: 0,
            required: 3,
          });
        }
      }
    }
  }

  list(): TerminalState[] {
    return Array.from(this.terminals.values());
  }

  /** Called at end-of-turn after guards have ticked. Increments progress on
   *  the terminal the player is currently extracting from. */
  tick(state: WorldState): void {
    for (const term of this.terminals.values()) {
      const eligible = this.eligibleFor(state, term);
      if (!eligible) {
        if (term.progress > 0) {
          term.progress = 0;
          eventBus.emit("EXTRACTION_INTERRUPTED", {
            terminalId: term.terminalId,
            reason: "lost-contact",
          });
        }
        continue;
      }
      const wasZero = term.progress === 0;
      term.progress = Math.min(term.required, term.progress + 1);
      if (wasZero) {
        eventBus.emit("EXTRACTION_STARTED", {
          terminalId: term.terminalId,
          roomId: term.roomId,
        });
      }
      eventBus.emit("EXTRACTION_PROGRESS", {
        terminalId: term.terminalId,
        progress: term.progress,
        required: term.required,
      });
      if (term.progress >= term.required) {
        // Fire-and-forget: the dialogue router is async (LLM); we file when it
        // resolves. The terminal stays at full until a redraw or a fresh tick.
        void this.complete(state, term);
      }
    }
  }

  private async complete(state: WorldState, term: TerminalState): Promise<void> {
    const room = state.rooms.get(term.roomId);
    const ctx = {
      terminalId: term.terminalId,
      roomName: room?.name ?? term.roomId,
      era: state.era,
    };
    const doc = await dialogueRouter.extractDocument(ctx);
    const caseId = documentArchive.fileExtractedDocument(state, term.terminalId, doc);
    eventBus.emit("EXTRACTION_COMPLETED", { terminalId: term.terminalId, caseId });
    // Terminals can be re-extracted; reset progress so the player can hold
    // again (each pass produces a new file).
    term.progress = 0;
  }

  private eligibleFor(state: WorldState, term: TerminalState): boolean {
    if (state.detected || state.detained) return false;
    if (state.player.roomId !== term.roomId) return false;
    const dx = state.player.pos.x - term.pos.x;
    const dy = state.player.pos.y - term.pos.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    // Must be facing the terminal.
    if (dx === -1 && state.player.facing !== "east") return false;
    if (dx === 1 && state.player.facing !== "west") return false;
    if (dy === -1 && state.player.facing !== "south") return false;
    if (dy === 1 && state.player.facing !== "north") return false;
    return true;
  }
}

/** Helper: identify whether a tile kind blocks extraction adjacency. Unused
 *  here but kept for clarity in case of future expansion. */
export function isExtractionTile(tile: Tile | undefined): boolean {
  return !!tile && tile.kind === "EXTRACTION_TERMINAL";
}

export const extractionTerminal = new ExtractionTerminalSystem();
