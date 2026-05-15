import { useEffect } from "react";
import { useTerminalStore } from "../state/useTerminalStore";
import { applySettings, loadSettings } from "./settings";
import { installEventBridge } from "./eventBridge";
import StatusBar from "./StatusBar";
import AuditLog from "./AuditLog";
import CommandLine from "./CommandLine";
import ModuleSelector from "./ModuleSelector";
import { PhaserCanvas } from "./PhaserCanvas";

export default function TerminalShell() {
  const activeModule = useTerminalStore((s) => s.activeModuleId);

  useEffect(() => {
    applySettings(loadSettings());
    return installEventBridge();
  }, []);

  return (
    <div className="shell-grid">
      <StatusBar />
      <main className="shell-main">
        {activeModule ? (
          <PhaserCanvas moduleId={activeModule} />
        ) : (
          <ModuleSelector />
        )}
      </main>
      <footer className="shell-footer">
        <AuditLog />
        <CommandLine />
      </footer>
    </div>
  );
}
