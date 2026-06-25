import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalStore } from "../state/useTerminalStore";
import { dispatch } from "./commands";

export default function CommandLine() {
  const [value, setValue] = useState("");
  const [historyIdx, setHistoryIdx] = useState(-1);
  const commandHistory = useTerminalStore((s) => s.commandHistory);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const valueRef = useRef(value);
  const historyIdxRef = useRef(historyIdx);
  const commandHistoryRef = useRef(commandHistory);

  useEffect(() => {
    valueRef.current = value;
    historyIdxRef.current = historyIdx;
    commandHistoryRef.current = commandHistory;
  }, [value, historyIdx, commandHistory]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Ensure we only handle relevant keys for the terminal
      if (e.key.length !== 1 && e.key !== "Backspace" && e.key !== "Enter" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();

        if (e.key === "Enter") {
           e.preventDefault();
           const trimmed = (inputRef.current.value || valueRef.current).trim();
           if (trimmed) {
             dispatch(trimmed);
             inputRef.current.value = "";
             setValue("");
             setHistoryIdx(-1);
           }
        } else if (e.key === "ArrowUp") {
           e.preventDefault();
           const nextIdx = Math.min(historyIdxRef.current + 1, commandHistoryRef.current.length - 1);
           setHistoryIdx(nextIdx);
           const newVal = commandHistoryRef.current[commandHistoryRef.current.length - 1 - nextIdx] ?? "";
           inputRef.current.value = newVal;
           setValue(newVal);
        } else if (e.key === "ArrowDown") {
           e.preventDefault();
           const nextIdx = Math.max(historyIdxRef.current - 1, -1);
           setHistoryIdx(nextIdx);
           const newVal = nextIdx < 0 ? "" : (commandHistoryRef.current[commandHistoryRef.current.length - 1 - nextIdx] ?? "");
           inputRef.current.value = newVal;
           setValue(newVal);
        } else if (e.key.length === 1) {
          e.preventDefault();
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(inputRef.current, valueRef.current + e.key);
          }
          inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (e.key === "Backspace") {
          e.preventDefault();
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(inputRef.current, valueRef.current.slice(0, -1));
          }
          inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

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
