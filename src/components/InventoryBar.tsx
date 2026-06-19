import { useSimStore } from "../state/useSimStore";
import { useTerminalStore } from "../state/useTerminalStore";
import { useGameActions } from "../hooks/useGameActions";
import { useTargetingStore } from "../state/useTargetingStore";
import { worldEngine } from "../engine/WorldEngine";
import { ITEM_METADATA, USABLE, TARGETED } from "../data/items/itemMetadata";
import type { ItemType } from "../types/world.types";

export default function InventoryBar() {
  const inventory = useSimStore((s) => s.subjective?.inventory ?? []);
  const equippedItem = useTerminalStore((s) => s.equippedItem);
  const { useItem: applyItem } = useGameActions();

  // Deduplicate items the player holds that are usable
  const heldUsableTypes = Array.from(
    new Set(inventory.filter((i) => USABLE.includes(i.itemType)).map((i) => i.itemType))
  );

  // If we have nothing usable in the inventory and nothing equipped, hide the bar entirely
  if (heldUsableTypes.length === 0 && !equippedItem) return null;

  function handleUse(itemType: ItemType) {
    if (TARGETED.includes(itemType)) {
      const state = worldEngine.getState();
      const room = state.rooms.get(state.player.roomId);
      if (!room) return;
      useTargetingStore.getState().begin(itemType, state.player.pos, {
        w: room.width,
        h: room.height,
      });
      return;
    }
    applyItem(itemType);
  }

  // Filter out the equipped item from the remaining list so it's only shown once in the prominent slot
  const unequippedTypes = heldUsableTypes.filter((t) => t !== equippedItem);

  const equippedIsHeld = equippedItem ? heldUsableTypes.includes(equippedItem) : false;

  return (
    <div className="inventory-bar">
      <div className="inventory-bar__hex-grid">
        {equippedItem && (
          <div className={`inventory-bar__slot is-equipped ${equippedIsHeld ? "" : "is-empty"}`}>
            <button
              className="inventory-bar__slot-btn"
              onClick={() => handleUse(equippedItem)}
              disabled={!equippedIsHeld}
              title={ITEM_METADATA[equippedItem].displayName}
            >
              <span
                className="inventory-bar__slot-icon"
                style={{
                  backgroundColor: `#${ITEM_METADATA[equippedItem].placeholderColor.toString(16).padStart(6, "0")}`,
                }}
              />
            </button>
          </div>
        )}

        {unequippedTypes.map((type) => {
          const meta = ITEM_METADATA[type];
          return (
            <div key={type} className="inventory-bar__slot">
              <button
                className="inventory-bar__slot-btn"
                onClick={() => handleUse(type)}
                title={meta.displayName}
              >
                <span
                  className="inventory-bar__slot-icon"
                  style={{
                    backgroundColor: `#${meta.placeholderColor.toString(16).padStart(6, "0")}`,
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
