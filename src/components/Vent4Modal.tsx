// Vent4Modal — surfaces the loss-function dilemma. Two sectors; one airflow
// budget. Whichever the player sacrifices is logged as the OFFICIAL incident.

import { useEffect, useState } from "react";
import { ventOptimizer } from "../engine/VentOptimizer";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";

interface Props {
  onClose: () => void;
}

interface Incident {
  caseId: string;
  sectors: string[];
}

export default function Vent4Modal({ onClose }: Props) {
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    const off = eventBus.on("VENT4_DECISION_REQUIRED", (p) => setIncident(p));
    return off;
  }, []);

  function decide(sector: string) {
    if (!incident) return;
    ventOptimizer.decide(worldEngine.getState(), sector);
    setIncident(null);
    onClose();
  }

  if (!incident) return null;

  return (
    <div className="az-modal-backdrop" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ maxWidth: 560 }}>
        <h2>VENT-4 // QUOTA CONFLICT</h2>
        <pre style={{ color: "#ff9577" }}>
{`LOSS_FUNCTION = max(quota_compliance) over { ${incident.sectors.join(", ")} }
no configuration avoids hurting them`}
        </pre>
        <p style={{ color: "#cfe9ee" }}>
          Allocate the remaining airflow. The unselected sector falls within
          tolerance. The optimization is sound.
        </p>
        <div className="row" style={{ gap: 10 }}>
          {incident.sectors.map((s) => (
            <button key={s} onClick={() => decide(s)}>{`PRESERVE ${s}`}</button>
          ))}
        </div>
        <p style={{ color: "#7fa1a8", marginTop: 12, fontSize: 12 }}>
          The OFFICIAL incident report will be filed automatically. If what
          you saw differs, the Document Archive (R) accepts a witness log.
        </p>
      </div>
    </div>
  );
}
