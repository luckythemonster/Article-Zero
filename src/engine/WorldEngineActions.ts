// Player action implementations. Mutates WorldState in place, then emits via
// the EventBus. Kept thin — one function per verb.

import type { Facing, Vec3, WorldState } from "../types/world.types";
import { tileKey } from "../types/world.types";
import { eventBus } from "./EventBus";
import { alignmentSession } from "./AlignmentSession";
import { ventOptimizer } from "./VentOptimizer";
import { stitcherTimer } from "./StitcherTimer";
import { miradorPersona } from "./MiradorPersona";
import { enforcerAI } from "./EnforcerAI";
import { documentArchive } from "./DocumentArchive";
import { articleZeroMeta } from "./ArticleZeroMeta";
import { insomniaSystem } from "./InsomniaSystem";

const MOVE_AP_COST = 1;
const INTERACT_AP_COST = 1;
// Each ADVANCE inside the InterrogationTerminal consumes a full Era-1 turn.
// Per the mechanics blueprint: "Send LLM Message (React): 3 AP".
export const ALIGN_AP_COST = 3;
const KILL_SCREEN_AP_COST = 1;
const FRAGMENT_BOX_HANDLE_AP_COST = 1;

/** True when the player carries a FRAGMENT_BOX. Used to gate interactions
 *  and reduce the effective per-turn AP refresh by 1. */
export function playerHoldsFragmentBox(state: WorldState): boolean {
  return state.player.inventory.some((i) => i.itemType === "FRAGMENT_BOX");
}

/** Per-turn AP refresh after encumbrance penalty. */
export function effectiveApMax(state: WorldState): number {
  return Math.max(0, state.player.apMax - (playerHoldsFragmentBox(state) ? 1 : 0));
}

export function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

function tileAt(state: WorldState, pos: Vec3) {
  const floor = state.floors.get(pos.z);
  if (!floor) return undefined;
  if (pos.x < 0 || pos.y < 0 || pos.x >= floor.width || pos.y >= floor.height) return undefined;
  return floor.tiles[pos.y * floor.width + pos.x];
}

function entityAt(state: WorldState, pos: Vec3) {
  for (const entity of state.entities.values()) {
    if (
      entity.kind !== "PLAYER" &&
      entity.status === "ACTIVE" &&
      entity.pos.x === pos.x &&
      entity.pos.y === pos.y &&
      entity.pos.z === pos.z
    ) return entity;
  }
  return undefined;
}

export const actions = {
  move(state: WorldState, dx: number, dy: number): boolean {
    if (state.detained || state.player.ap < MOVE_AP_COST) return false;
    const facing = facingFromDelta(dx, dy);
    if (facing) state.player.facing = facing;
    const from = state.player.pos;
    const to: Vec3 = { x: from.x + dx, y: from.y + dy, z: from.z };
    const t = tileAt(state, to);
    if (!t || t.solid) return false;
    const blockingEntity = entityAt(state, to);
    if (blockingEntity) return false;
    state.player.pos = to;
    state.player.ap -= MOVE_AP_COST;
    state.player.lastMoveTurn = state.turn;
    eventBus.emit("PLAYER_MOVED", { from, to });
    eventBus.emit("PLAYER_AP_CHANGED", {
      previous: state.player.ap + MOVE_AP_COST,
      current: state.player.ap,
    });
    return true;
  },

  interact(state: WorldState): boolean {
    if (state.detained || state.player.ap < INTERACT_AP_COST) return false;
    // Encumbrance: holding the Fragment Box occupies both hands. The player
    // must drop the box before doors, terminals, fragments, vent controls, or
    // RUN-01 rigs are usable.
    if (playerHoldsFragmentBox(state)) return false;

    // Adjacent doors first.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const pos: Vec3 = { x: state.player.pos.x + dx, y: state.player.pos.y + dy, z: state.player.pos.z };
      const t = tileAt(state, pos);
      if (!t) continue;
      if (t.kind === "DOOR_CLOSED") {
        t.kind = "DOOR_OPEN";
        t.solid = false;
        t.opaque = false;
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("DOOR_TOGGLED", { pos, open: true });
        return true;
      }
      if (t.kind === "DOOR_OPEN") {
        t.kind = "DOOR_CLOSED";
        t.solid = true;
        t.opaque = true;
        state.player.ap -= INTERACT_AP_COST;
        eventBus.emit("DOOR_TOGGLED", { pos, open: false });
        return true;
      }
    }

    // Standing on terminal/fragment/vent control?
    const here = tileAt(state, state.player.pos);
    if (!here) return false;

    if (here.kind === "ARTICLE_ZERO_FRAGMENT_TILE") {
      const fragmentId = state.era === "LATTICE"
        ? "fragment-ring-c"
        : state.era === "MIRADOR"
          ? "fragment-mirador"
          : state.era === "BAFFLE"
            ? "fragment-baffle"
            : "fragment-nw-smac-01";
      articleZeroMeta.discoverFragment(state, fragmentId);
      state.player.ap -= INTERACT_AP_COST;
      return true;
    }
    if (here.kind === "VENT_CONTROL") {
      const incident = ventOptimizer.openIncident(state);
      if (incident) {
        eventBus.emit("VENT4_DECISION_REQUIRED", incident);
        state.player.ap -= INTERACT_AP_COST;
        return true;
      }
    }
    if (here.kind === "SHARED_FIELD_RIG") {
      // RUN 01 — only fires once. The merge dialogue is rendered by the
      // RunZeroOneOverlay React component, which calls worldEngine.markEntangled
      // when the sequence completes.
      if (!state.player.entangled) {
        eventBus.emit("RUN_01_TRIGGERED", { turn: state.turn });
        state.player.ap -= INTERACT_AP_COST;
        return true;
      }
    }
    if (here.kind === "TERMINAL") {
      // Terminals open the document archive in v1.
      documentArchive.broadcastList();
      state.player.ap -= INTERACT_AP_COST;
      return true;
    }
    return false;
  },

  endTurn(state: WorldState, recomputeFOV: () => void): void {
    state.turn += 1;
    const refreshed = effectiveApMax(state);
    state.player.ap = refreshed;
    eventBus.emit("TURN_END", { turn: state.turn - 1 });
    eventBus.emit("TURN_START", { turn: state.turn, apRestored: refreshed });
    eventBus.emit("PLAYER_AP_CHANGED", {
      previous: 0,
      current: state.player.ap,
    });
    // Tick subsystems
    enforcerAI.tick(state);
    stitcherTimer.tick(state);
    miradorPersona.tick(state);
    insomniaSystem.tick(state);
    articleZeroMeta.checkPromote(state);
    // Expire violations older than 20 turns
    state.violations = state.violations.filter((v) => state.turn - v.turn < 20);
    // Flashlight battery
    if (state.player.flashlightOn) {
      state.player.flashlightBattery -= 1;
      if (state.player.flashlightBattery <= 0) {
        state.player.flashlightOn = false;
        state.player.flashlightBattery = 0;
        eventBus.emit("FLASHLIGHT_TOGGLED", { on: false, battery: 0 });
      }
    }
    recomputeFOV();
  },

  toggleFlashlight(state: WorldState, recomputeFOV: () => void): void {
    if (state.player.flashlightBattery <= 0 && !state.player.flashlightOn) return;
    state.player.flashlightOn = !state.player.flashlightOn;
    eventBus.emit("FLASHLIGHT_TOGGLED", {
      on: state.player.flashlightOn,
      battery: state.player.flashlightBattery,
    });
    recomputeFOV();
  },

  /**
   * Pure validation. Does NOT mutate state — open the modal first, only spend
   * AP and start the session when the player clicks ADVANCE.
   */
  canStartAlignment(
    state: WorldState,
    entityId: string,
  ): { ok: boolean; reason?: string } {
    if (state.detained) return { ok: false, reason: "detained" };
    // Encumbrance: holding the Fragment Box blocks alignment-terminal use.
    if (playerHoldsFragmentBox(state)) return { ok: false, reason: "encumbered" };
    const entity = state.entities.get(entityId);
    if (!entity || entity.status !== "ACTIVE") {
      return { ok: false, reason: "no-such-entity" };
    }
    if (entity.kind !== "SILICATE") {
      return { ok: false, reason: "not-silicate" };
    }
    const dx = Math.abs(entity.pos.x - state.player.pos.x);
    const dy = Math.abs(entity.pos.y - state.player.pos.y);
    if (entity.pos.z !== state.player.pos.z || dx + dy > 1) {
      return { ok: false, reason: "not-adjacent" };
    }
    if (state.player.ap < ALIGN_AP_COST) return { ok: false, reason: "low-ap" };
    return { ok: true };
  },

  /**
   * Spend AP and start the session. Caller must have already checked
   * canStartAlignment — this is the commit step from the modal's first ADVANCE.
   * Also raises the alignment light (Light Spill) so the EnforcerAI can see it.
   */
  commitAlignment(state: WorldState, entityId: string): boolean {
    const check = actions.canStartAlignment(state, entityId);
    if (!check.ok) return false;
    const previous = state.player.ap;
    state.player.ap -= ALIGN_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
    alignmentSession.start(state, entityId);
    if (!state.alignmentLightActive) {
      state.alignmentLightActive = true;
      eventBus.emit("ALIGNMENT_LIGHT_TOGGLED", { active: true });
    }
    return true;
  },

  /**
   * Spend AP for one ADVANCE inside the InterrogationTerminal. Used after
   * the session has been started; gates the LLM-message-per-turn pacing.
   */
  spendAlignmentAdvance(state: WorldState): boolean {
    if (state.detained || state.player.ap < ALIGN_AP_COST) return false;
    const previous = state.player.ap;
    state.player.ap -= ALIGN_AP_COST;
    eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
    return true;
  },

  /** Light Spill on. Idempotent. Called when the InterrogationTerminal opens
   *  or [Wake Screen] fires. Wake-screen costs 1 AP; opening for free is
   *  handled by the caller. */
  setAlignmentLight(
    state: WorldState,
    active: boolean,
    spendAp: boolean,
  ): boolean {
    if (spendAp) {
      if (state.detained || state.player.ap < KILL_SCREEN_AP_COST) return false;
      const previous = state.player.ap;
      state.player.ap -= KILL_SCREEN_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
    }
    if (state.alignmentLightActive !== active) {
      state.alignmentLightActive = active;
      eventBus.emit("ALIGNMENT_LIGHT_TOGGLED", { active });
    }
    return true;
  },

  /**
   * Pickup or drop a FRAGMENT_BOX standing on / held by the player.
   * 1 AP. Returns true on a successful state change.
   */
  toggleFragmentBox(state: WorldState): boolean {
    if (state.detained || state.player.ap < FRAGMENT_BOX_HANDLE_AP_COST) return false;
    const held = state.player.inventory.find((i) => i.itemType === "FRAGMENT_BOX");
    if (held) {
      // Drop at current tile.
      held.pos = { ...state.player.pos };
      state.player.inventory = state.player.inventory.filter((i) => i.id !== held.id);
      state.items.set(held.id, held);
      const previous = state.player.ap;
      state.player.ap -= FRAGMENT_BOX_HANDLE_AP_COST;
      eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
      eventBus.emit("FRAGMENT_BOX_DROPPED", { itemId: held.id, pos: held.pos });
      return true;
    }
    // Pick up if standing on one.
    const here = state.player.pos;
    for (const item of state.items.values()) {
      if (
        item.itemType === "FRAGMENT_BOX" &&
        item.pos &&
        item.pos.x === here.x &&
        item.pos.y === here.y &&
        item.pos.z === here.z
      ) {
        const picked = { ...item, pos: undefined };
        state.items.delete(item.id);
        state.player.inventory.push(picked);
        const previous = state.player.ap;
        state.player.ap -= FRAGMENT_BOX_HANDLE_AP_COST;
        // Encumbrance: clamp AP to the new effective ceiling.
        state.player.ap = Math.min(state.player.ap, effectiveApMax(state));
        eventBus.emit("PLAYER_AP_CHANGED", { previous, current: state.player.ap });
        eventBus.emit("FRAGMENT_BOX_PICKED_UP", { itemId: item.id, pos: here });
        return true;
      }
    }
    return false;
  },

  // Used by the dialogue UI and incident handlers to mark progress without an
  // adjacency check.
  forceTileKey(pos: Vec3): string {
    return tileKey(pos);
  },
};
