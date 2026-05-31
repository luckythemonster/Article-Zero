// Transient targeting state for thrown items (e.g. EMP_GRENADE).
// NOT persisted — intentionally a plain create() with no persist() wrapper.
// Active while the player is aiming a targeted item; cleared on confirm/cancel.

import { create } from "zustand";
import type { ItemType, Vec2 } from "../types/world.types";

interface TargetingStore {
  active: boolean;
  itemType: ItemType | null;
  cursor: Vec2 | null;
  begin: (itemType: ItemType, start: Vec2, roomBounds: { w: number; h: number }) => void;
  moveCursor: (dx: number, dy: number) => void;
  setCursor: (pos: Vec2) => void;
  cancel: () => void;
  _roomBounds: { w: number; h: number } | null;
}

export const useTargetingStore = create<TargetingStore>()((set, get) => ({
  active: false,
  itemType: null,
  cursor: null,
  _roomBounds: null,

  begin(itemType, start, roomBounds) {
    set({ active: true, itemType, cursor: { ...start }, _roomBounds: roomBounds });
  },

  moveCursor(dx, dy) {
    const { cursor, _roomBounds } = get();
    if (!cursor || !_roomBounds) return;
    const nx = Math.max(0, Math.min(_roomBounds.w - 1, cursor.x + dx));
    const ny = Math.max(0, Math.min(_roomBounds.h - 1, cursor.y + dy));
    set({ cursor: { x: nx, y: ny } });
  },

  setCursor(pos) {
    const { _roomBounds } = get();
    if (!_roomBounds) return;
    const nx = Math.max(0, Math.min(_roomBounds.w - 1, pos.x));
    const ny = Math.max(0, Math.min(_roomBounds.h - 1, pos.y));
    set({ cursor: { x: nx, y: ny } });
  },

  cancel() {
    set({ active: false, itemType: null, cursor: null, _roomBounds: null });
  },
}));
