import { useTerminalStore } from "../state/useTerminalStore";
import { dispatch } from "./commands";
import type { Module } from "../types/world.types";

const VISIBLE_MODULES: Module[] = ["EREMITE", "MIRADOR"];

export default function ModuleSelector() {
  const modules = useTerminalStore((s) => s.modules);

  return (
    <div className="module-selector">
      <p className="module-selector__header">
        ARCHIVIST TERMINAL — SELECT MODULE
      </p>
      <div className="module-selector__list">
        {VISIBLE_MODULES.map((id) => {
          const mod = modules[id];
          const status = mod.decrypted ? "UNLOCKED" : "LOCKED";
          return (
            <div key={id} className={`module-card is-${status.toLowerCase()}`}>
              <div className="module-card__header">
                <span className="module-card__id">{id}</span>
                <span className="module-card__status">{status}</span>
              </div>
              <div className="module-card__actions">
                {!mod.decrypted && (
                  <button
                    className="btn"
                    onClick={() => dispatch(`decrypt ${id}`)}
                  >
                    DECRYPT
                  </button>
                )}
                {mod.decrypted && (
                  <button
                    className="btn btn--primary"
                    onClick={() => dispatch(`load ${id}`)}
                  >
                    LOAD
                  </button>
                )}
                {mod.decrypted && mod.snapshot && (
                  <button
                    className="btn"
                    onClick={() => dispatch(`load-slot ${id}`)}
                  >
                    RESTORE SNAPSHOT
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="module-selector__hint">
        type <kbd>decrypt &lt;module&gt;</kbd> to unlock · <kbd>load &lt;module&gt;</kbd> to enter
      </p>
    </div>
  );
}
