// Static display metadata for every ItemType. Used by InventoryOverlay and
// the Phaser floor-item renderer. Keep in sync with world.types.ts:ItemType.

import type { ItemType } from "../../types/world.types";

export interface ItemMeta {
  displayName: string;
  /** One-line lore blurb for the inventory overlay. */
  blurb: string;
  /** Hex color used for the placeholder floor-item square in RoomScene. */
  placeholderColor: number;
  /** True for items that need the player's facing direction at activation
   *  (Phantom Emitter, Dump Fragment, Override Key). Shown in the overlay
   *  so the player knows to orient before using. */
  usesFacing?: boolean;
}

export const ITEM_METADATA: Record<ItemType, ItemMeta> = {
  EXTRACTION_CUBE: {
    displayName: "Fragment Box",
    blurb: "Compressed subjective dump. Carries it to EXFIL_POINT.",
    placeholderColor: 0xc89adb,
  },
  BYPASS_DRIVE: {
    displayName: "Bypass Drive",
    blurb: "Auth-string patch cable. Required at the bypass terminal.",
    placeholderColor: 0x7ab8d4,
  },
  PHANTOM_EMITTER: {
    displayName: "Phantom Manifest Emitter",
    blurb:
      "Deploys a 3-turn phantom supply-chain signal on the facing tile. " +
      "Enforcers in earshot investigate toward it.",
    placeholderColor: 0xe8b86d,
    usesFacing: true,
  },
  Q0_SPOOF_BADGE: {
    displayName: "Q0 Spoof Badge",
    blurb:
      "Forged doctrinal credential. Forces compliance to GREEN for 4 turns — " +
      "enforcers see a TECH-2 on authorized shift.",
    placeholderColor: 0x6ad0a4,
  },
  DUMP_FRAGMENT: {
    displayName: "Subjective Dump Fragment",
    blurb:
      "Crystallised self-report from a Q2 process. Throw into the facing " +
      "cone (radius 5) — overwrites the target's loss-function for one tick, " +
      "or breaks active pursuit to EVASION.",
    placeholderColor: 0xe06060,
    usesFacing: true,
  },
  THERMAL_BAFFLE: {
    displayName: "Thermal Baffle",
    blurb:
      "4-turn thermodynamic mask. All movement emits intensity 0; " +
      "vent crawls cost 1 AP instead of 2.",
    placeholderColor: 0xa0c8e8,
  },
  OVERRIDE_KEY: {
    displayName: "Doctrinal Override Key (Red Date)",
    blurb:
      "Silently toggles the facing doorway open or closed — no SoundField " +
      "emission. Closed doors block enforcer pathfinding.",
    placeholderColor: 0xd46a6a,
    usesFacing: true,
  },
  EMP: {
    displayName: "EMP Charge",
    blurb:
      "Omnidirectional burst centered on you (radius 5). Temporarily disables " +
      "every drone, camera, enforcer, and silicate unit in range for 4 turns — " +
      "they recover automatically. Does not clear active lockdowns.",
    placeholderColor: 0xb070ff,
  },
  EMP_GRENADE: {
    displayName: "EMP Grenade",
    blurb:
      "Thrown to a chosen visible tile (max 6 tiles). Burst (radius 3) " +
      "temporarily disables all silicate units in range for 4 turns. " +
      "Aim with WASD, confirm with Space/Enter, cancel with Esc.",
    placeholderColor: 0x9050e0,
  },
};
