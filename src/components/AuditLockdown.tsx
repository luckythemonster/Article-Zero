// "Auditors aren't guards with guns; they are clipboard-wielding bureaucrats.
//  If they spot Rowan out of bounds, they don't shoot — they lock the blast
//  doors and casually vent the oxygen from the corridor, treating Rowan as
//  an 'anomalous organic blockage'."  — vertical-slice spec, Phase 1.
//
// This overlay listens to AUDIT_LOCKDOWN_TRIGGERED and PHASE_RESTART_REQUESTED
// to fade in / out independently of the active phase.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

export default function AuditLockdown() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const off1 = eventBus.on("AUDIT_LOCKDOWN_TRIGGERED", () => setVisible(true));
    const off2 = eventBus.on("PHASE_RESTART_REQUESTED", () => setVisible(false));
    return () => {
      off1();
      off2();
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="audit-lockdown">
      <div>// AUDIT FLAG RAISED</div>
      <div className="audit-lockdown__sub">
        BLAST DOORS LOCKED. CORRIDOR ATMOSPHERICS PURGING.
        <br />
        ANOMALOUS ORGANIC BLOCKAGE — ROW E-3 — SCHEDULING FOR EXTRACTION.
      </div>
    </div>
  );
}
