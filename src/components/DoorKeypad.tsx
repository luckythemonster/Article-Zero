import { useEffect, useState, useCallback } from "react";
import { worldEngine } from "../engine/WorldEngine";
import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";

const CODE_MAX_LEN = 4;
const KEYPAD_KEYS = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "DEL", "0", "ENT",
] as const;

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

  function pressKey(k: (typeof KEYPAD_KEYS)[number]): void {
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
                <div className="wall-terminal__chassis-upper" />
        <div className="wall-terminal__chassis-lower" />
        <div className="wall-terminal__chassis-sides" />
        <div className="wall-terminal__viewscreen" />

        {/* Overlays */}
        <div className="wall-terminal__scanner" />
        <div className="wall-terminal__placard">
          <span className="wall-terminal__placard-text">{active.roomId}</span>
          <span className="wall-terminal__placard-braille">Braille</span>
        </div>
        <div className="wall-terminal__content">
          <div className="wall-terminal__header">
            <span className="wall-terminal__title">
              DOOR KEYPAD
            </span>
            <span className="wall-terminal__emergency-button" />
          </div>

          <div className="wall-terminal__section wall-terminal__section--code">
            <div className="wall-terminal__display">
              {codeBuffer.padEnd(CODE_MAX_LEN, "·").split("").map((c, i) => (
                <span
                  key={i}
                  className={
                    "wall-terminal__display-char" +
                    (i < codeBuffer.length
                      ? " wall-terminal__display-char--filled"
                      : "")
                  }
                >
                  {c}
                </span>
              ))}
            </div>
            <div
              className={
                "wall-terminal__keypad" +
                (codeError ? " wall-terminal__keypad--error" : "")
              }
            >
              {KEYPAD_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={
                    "wall-terminal__key wall-terminal__key--" +
                    (k === "DEL" ? "del" : k === "ENT" ? "ent" : k)
                  }
                  onClick={() => pressKey(k)}
                >
                  <span className="wall-terminal__key-label">{k}</span>
                </button>
              ))}
            </div>

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
