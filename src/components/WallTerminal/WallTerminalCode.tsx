export const KEYPAD_KEYS = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "DEL", "0", "ENT",
] as const;

export const CODE_MAX_LEN = 4;

interface WallTerminalCodeProps {
  codeBuffer: string;
  codeError: boolean;
  pressKey: (k: (typeof KEYPAD_KEYS)[number]) => void;
  returnToMap: () => void;
}

export function WallTerminalCode({
  codeBuffer,
  codeError,
  pressKey,
  returnToMap,
}: WallTerminalCodeProps) {
  return (
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
        {KEYPAD_KEYS.map((k) => {
          return (
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
          );
        })}
      </div>
      <div className="hvac__footer">
        <button className="hvac__dismiss" onClick={returnToMap}>
          CANCEL (ESC)
        </button>
      </div>
    </div>
  );
}
