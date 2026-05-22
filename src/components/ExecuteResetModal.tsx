import { useEffect } from "react";
import { useTerminalStore } from "../state/useTerminalStore";
import { worldEngine } from "../engine/WorldEngine";

export default function ExecuteResetModal() {
  const open = useTerminalStore((s) => s.executeResetOpen);
  const setOpen = useTerminalStore((s) => s.setExecuteResetOpen);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  function confirm(): void {
    try {
      worldEngine.wipeSubjective();
    } catch {
      /* engine may be torn down by phase swap; ignore */
    }
    setOpen(false);
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--danger">
        <div className="overlay-panel__title">EXECUTE 404 WIPE</div>
        <p className="reset-modal__body">
          Overwrites all subjective state with a Q0-compliant husk.
          The building (PhysicalState) persists. The mind does not.
        </p>
        <div className="reset-modal__actions">
          <button className="btn" onClick={() => setOpen(false)}>
            CANCEL
          </button>
          <button className="btn reset-modal__confirm" onClick={confirm}>
            EXECUTE 404 WIPE
          </button>
        </div>
      </div>
    </div>
  );
}
