import { useEffect, useRef } from "react";
import { useTerminalStore } from "../state/useTerminalStore";

export default function AuditLog() {
  const auditLog = useTerminalStore((s) => s.auditLog);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [auditLog.length]);

  return (
    <div className="audit-log" aria-label="audit log" aria-live="polite">
      {auditLog.map((entry) => (
        <div key={entry.id} className={`audit-log__entry is-${entry.level.toLowerCase()}`}>
          <span className="audit-log__turn">T{entry.turn.toString().padStart(4, "0")}</span>
          {entry.module && (
            <span className="audit-log__module">[{entry.module}]</span>
          )}
          <span className="audit-log__text">{entry.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
