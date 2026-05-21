// Inventory overlay — opened / closed by the U key (wired in useInput.ts).
// Lists every item the player is currently holding with a one-line lore blurb.
// Selecting an item calls worldEngine.useItem() via useGameActions; the engine
// handles all targeting (facing tile / facing cone — no sub-selection here).
// Pressing U again or Escape closes the overlay without using anything.

import { useEffect, useState } from "react";
import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";
import { useGameActions } from "../hooks/useGameActions";
import { ITEM_METADATA } from "../data/items/itemMetadata";
import type { ItemType } from "../types/world.types";

// Only these five types are directly activatable from the overlay.
// EXTRACTION_CUBE and BYPASS_DRIVE remain passive (auto-resolved at tiles).
const USABLE: ItemType[] = [
  "PHANTOM_EMITTER",
  "Q0_SPOOF_BADGE",
  "DUMP_FRAGMENT",
  "THERMAL_BAFFLE",
  "OVERRIDE_KEY",
];

export default function InventoryOverlay() {
  const open = useTerminalStore((s) => s.inventoryOpen);
  const setInventoryOpen = useTerminalStore((s) => s.setInventoryOpen);
  const inventory = useSimStore((s) => s.subjective?.inventory ?? []);
  const { useItem } = useGameActions();
  const [feedback, setFeedback] = useState<string | null>(null);

  // Close on Escape; let U be handled by useInput (which already toggles).
  useEffect(() => {
    if (!open) { setFeedback(null); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setInventoryOpen(false); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setInventoryOpen]);

  if (!open) return null;

  function handleUse(itemType: ItemType) {
    const ok = useItem(itemType);
    if (ok) {
      setInventoryOpen(false);
      setFeedback(null);
    } else {
      // The engine may have emitted ITEM_REJECTED — surface a short message
      // inside the overlay so the player understands without closing it.
      const meta = ITEM_METADATA[itemType];
      setFeedback(
        `${meta.displayName}: cannot activate right now (no valid target or insufficient AP).`,
      );
    }
  }

  // Deduplicate by type to show one row per distinct ItemType in inventory.
  // USABLE items that aren't in inventory are shown greyed-out.
  const heldUsable = new Set(
    inventory.filter((i) => USABLE.includes(i.itemType)).map((i) => i.itemType),
  );
  const passiveHeld = inventory.filter((i) => !USABLE.includes(i.itemType));

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--inventory">
        <div className="overlay-panel__title">INVENTORY // [U] CLOSE</div>

        <div className="inventory__section-label">TACTICAL ITEMS</div>
        <ul className="inventory__list">
          {USABLE.map((type) => {
            const meta = ITEM_METADATA[type];
            const held = heldUsable.has(type);
            return (
              <li key={type} className={`inventory__item ${held ? "is-held" : "is-empty"}`}>
                <div className="inventory__item-header">
                  <span className="inventory__item-name">{meta.displayName}</span>
                  {meta.usesFacing && held && (
                    <span className="inventory__item-tag">uses facing</span>
                  )}
                </div>
                <p className="inventory__item-blurb">{meta.blurb}</p>
                {held && (
                  <button
                    className="inventory__use-btn"
                    onClick={() => handleUse(type)}
                  >
                    ACTIVATE
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {passiveHeld.length > 0 && (
          <>
            <div className="inventory__section-label">PASSIVE / QUEST ITEMS</div>
            <ul className="inventory__list">
              {passiveHeld.map((item) => {
                const meta = ITEM_METADATA[item.itemType] ?? {
                  displayName: item.itemType,
                  blurb: "No description.",
                  placeholderColor: 0x888888,
                };
                return (
                  <li key={item.id} className="inventory__item is-held is-passive">
                    <div className="inventory__item-header">
                      <span className="inventory__item-name">{meta.displayName}</span>
                    </div>
                    <p className="inventory__item-blurb">{meta.blurb}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {feedback && (
          <div className="inventory__feedback">{feedback}</div>
        )}
      </div>
    </div>
  );
}
