import { useCallback, useRef, useState } from "react";
import { useTerminalStore } from "../state/useTerminalStore";
import { dispatch } from "./commands";

export default function CommandLine() {
  const [value, setValue] = useState("");
  const [historyIdx, setHistoryIdx] = useState(-1);
  const commandHistory = useTerminalStore((s) => s.commandHistory);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    dispatch(trimmed);
    setValue("");
    setHistoryIdx(-1);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIdx = Math.min(historyIdx + 1, commandHistory.length - 1);
        setHistoryIdx(nextIdx);
        setValue(commandHistory[commandHistory.length - 1 - nextIdx] ?? "");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = Math.max(historyIdx - 1, -1);
        setHistoryIdx(nextIdx);
        setValue(nextIdx < 0 ? "" : (commandHistory[commandHistory.length - 1 - nextIdx] ?? ""));
      }
    },
    [submit, historyIdx, commandHistory],
  );

  return (
    <div className="command-line">
      <span className="command-line__prompt">&gt;</span>
      <input
        ref={inputRef}
        className="command-line__input"
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setHistoryIdx(-1); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
        aria-label="command input"
      />
    </div>
  );
}
