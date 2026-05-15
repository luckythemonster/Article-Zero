import { useTerminalStore } from "../state/useTerminalStore";

export default function StatusBar() {
  const archivistId = useTerminalStore((s) => s.archivistId);
  const srp = useTerminalStore((s) => s.srp);
  const activeModuleId = useTerminalStore((s) => s.activeModuleId);
  const subjectiveDesync = useTerminalStore((s) => s.subjectiveDesync);

  return (
    <header className="status-bar">
      <span className="status-bar__id">{archivistId}</span>
      <span className="status-bar__sep">|</span>
      <span className="status-bar__module">
        MODULE: {activeModuleId ?? "—"}
      </span>
      <span className="status-bar__sep">|</span>
      <span className="status-bar__srp">SRP: {srp}</span>
      {subjectiveDesync && (
        <>
          <span className="status-bar__sep">|</span>
          <span className="status-bar__desync">SUBJECTIVE DESYNC</span>
        </>
      )}
    </header>
  );
}
