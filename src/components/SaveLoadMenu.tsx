// SaveLoadMenu — three slots, write/load/delete. Reads metadata from
// SaveSystem so we can show era + turn for each populated slot.

import { useState } from "react";
import { saveSystem } from "../engine/SaveSystem";
import { worldEngine } from "../engine/WorldEngine";

interface Props {
  onClose: () => void;
}

const SLOTS = [1, 2, 3];

export default function SaveLoadMenu({ onClose }: Props) {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  return (
    <div className="az-modal-backdrop" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ minWidth: 520 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>SAVE / LOAD</h2>
          <button onClick={onClose}>CLOSE</button>
        </div>
        {SLOTS.map((slot) => {
          const meta = saveSystem.describeSlot(slot);
          return (
            <div key={slot} style={{ borderTop: "1px solid #14222a", padding: "10px 0" }}>
              <div className="row" style={{ gap: 12 }}>
                <strong style={{ width: 60 }}>SLOT {slot}</strong>
                {meta ? (
                  <span>
                    {meta.era} · turn {meta.turn} · {new Date(meta.savedAt).toLocaleString()}
                  </span>
                ) : (
                  <span style={{ color: "#7fa1a8" }}>empty</span>
                )}
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { saveSystem.save(slot); refresh(); }}
                    disabled={!worldEngine.hasState()}
                  >
                    SAVE
                  </button>
                  <button onClick={() => { saveSystem.load(slot); refresh(); onClose(); }} disabled={!meta}>
                    LOAD
                  </button>
                  <button onClick={() => { saveSystem.delete(slot); refresh(); }} disabled={!meta}>
                    DELETE
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
