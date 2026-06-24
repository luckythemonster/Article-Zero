export const CODE_MAX_LEN = 4;
export const KEYPAD_KEYS = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "DEL", "0", "ENT",
] as const;

export type KeypadKey = (typeof KEYPAD_KEYS)[number];

interface KeypadDisplayProps {
  codeBuffer: string;
  codeError: boolean;
  onKeyPress: (k: KeypadKey) => void;
  children?: React.ReactNode;
}

export function KeypadDisplay({ codeBuffer, codeError, onKeyPress, children }: KeypadDisplayProps) {
  return (
    <>
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
            onClick={() => onKeyPress(k)}
          >
            <span className="wall-terminal__key-label">{k}</span>
          </button>
        ))}
      </div>
      {children}
    </>
  );
}
