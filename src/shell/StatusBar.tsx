import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";

export default function StatusBar() {
  const archivistId = useTerminalStore((s) => s.archivistId);
  const srp = useTerminalStore((s) => s.srp);
  const activeModuleId = useTerminalStore((s) => s.activeModuleId);
  const subjectiveDesync = useTerminalStore((s) => s.subjectiveDesync);
  const setExecuteResetOpen = useTerminalStore((s) => s.setExecuteResetOpen);
  const subjective = useSimStore((s) => s.subjective);

  const compliance = subjective?.compliance ?? null;
  const spoof = subjective?.spoofTurnsRemaining ?? 0;
  const baffle = subjective?.baffleTurnsRemaining ?? 0;

  return (
    <header className="status-bar">
      <span className="status-bar__id">{archivistId}</span>
      <span className="status-bar__sep">|</span>
      <span className="status-bar__module">
        MODULE: {activeModuleId ?? "—"}
      </span>
      <span className="status-bar__sep">|</span>
      <span className="status-bar__srp">SRP: {srp}</span>
      {compliance && (
        <>
          <span className="status-bar__sep">|</span>
          <span className={`status-bar__compliance is-${compliance.toLowerCase()}`}>
            {compliance}
          </span>
        </>
      )}
      {spoof > 0 && (
        <>
          <span className="status-bar__sep">|</span>
          <span className="status-bar__effect">SPOOF: {spoof}</span>
        </>
      )}
      {baffle > 0 && (
        <>
          <span className="status-bar__sep">|</span>
          <span className="status-bar__effect">BAFFLE: {baffle}</span>
        </>
      )}
      {subjectiveDesync && (
        <>
          <span className="status-bar__sep">|</span>
          <span className="status-bar__desync">SUBJECTIVE DESYNC</span>
        </>
      )}
      {subjective && (
        <button
          className="status-bar__reset-btn"
          onClick={() => setExecuteResetOpen(true)}
        >
          EXECUTE RESET
        </button>
      )}
    </header>
  );
}
