import { useEffect, useState, useCallback } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";
import { KeypadDisplay, CODE_MAX_LEN, KeypadKey } from "./KeypadDisplay";

export function DoorKeypad() {
  const active = useTerminalStore((s) => s.activeDoorKeypad);
  const inventory = useSimStore((s) => s.subjective?.inventory ?? []);
  const setPhase = useTerminalStore((s) => s.setPhase);
  const setActiveDoorKeypad = useTerminalStore((s) => s.setActiveDoorKeypad);

  const [codeBuffer, setCodeBuffer] = useState<string>("");
  const [codeError, setCodeError] = useState<boolean>(false);

  const dismiss = useCallback((): void => {
    setPhase("FLOOR");
    setActiveDoorKeypad(null);
  }, [setPhase, setActiveDoorKeypad]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [dismiss]);

  // Clear keypad-error flash after a beat so repeat-failure restarts the
  // animation instead of staying red forever.
  useEffect(() => {
    if (codeError) {
      const t = setTimeout(() => setCodeError(false), 400);
      return () => clearTimeout(t);
    }
  }, [codeError]);

  if (!active) return null;

  function pressKey(k: KeypadKey): void {
    if (codeError) return;
    if (k === "DEL") {
      setCodeBuffer((b) => b.slice(0, -1));
      return;
    }
    if (k === "ENT") {
      const ok = worldEngine.submitDoorCode(
        active!.roomId,
        active!.pos,
        codeBuffer,
      );
      if (ok) {
        dismiss();
      } else {
        setCodeError(true);
        setCodeBuffer("");
      }
      return;
    }
    setCodeBuffer((b) => (b.length >= CODE_MAX_LEN ? b : b + k));
  }

  return (
    <div className="overlay-root">
      <div className="overlay-panel overlay-panel--terminal wall-terminal">
        <div className="wall-terminal__frame" />
        <div className="wall-terminal__content">
          <div className="wall-terminal__header">
            <span className="wall-terminal__title">
              DOOR KEYPAD
            </span>
            <span className="wall-terminal__emergency" />
          </div>

          <div className="wall-terminal__section wall-terminal__section--code">
            <KeypadDisplay codeBuffer={codeBuffer} codeError={codeError} onKeyPress={pressKey}>
            {/* Displaying an option to use a key if applicable can be added here if needed */}
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                 className="hvac__mode-btn"
                 onClick={() => {
                   const ok = inventory.some((i: any) => i.itemType === "OVERRIDE_KEY")
                     && worldEngine.useItem("OVERRIDE_KEY");
                   if (ok) {
                     dismiss();
                   }
                 }}
              >
                USE KEY
              </button>
            </div>
            </KeypadDisplay>

            <div className="hvac__footer" style={{ marginTop: "1rem" }}>
              <button className="hvac__dismiss" onClick={dismiss}>
                CANCEL (ESC)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
