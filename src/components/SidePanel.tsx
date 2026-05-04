import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { documentArchive } from "../engine/DocumentArchive";
import { ventOptimizer } from "../engine/VentOptimizer";

interface Props {
  onOpenArchive: () => void;
  onOpenSaveLoad: () => void;
  onOpenSettings: () => void;
  onOpenAlignment: () => void;
  onOpenLog: () => void;
  onOpenVent: () => void;
}

export default function SidePanel(p: Props) {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  useEffect(() => {
    const offs = [
      eventBus.on("DOCUMENT_FILED", refresh),
      eventBus.on("DOCUMENT_DISPUTED", refresh),
      eventBus.on("DOCUMENT_CORRECTED", refresh),
      eventBus.on("STITCHER_TICK", refresh),
      eventBus.on("STITCHER_RECONCILED", refresh),
      eventBus.on("VENT4_DECISION_REQUIRED", refresh),
      eventBus.on("VENT4_DECISION_MADE", refresh),
      eventBus.on("ALIGNMENT_SESSION_COMPLETE", refresh),
      eventBus.on("PLAYER_MOVED", refresh),
      eventBus.on("FRAGMENT_BOX_PICKED_UP", refresh),
      eventBus.on("FRAGMENT_BOX_DROPPED", refresh),
      eventBus.on("EMP_DEVICE_USED", refresh),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  if (!worldEngine.hasState()) return null;
  const s = worldEngine.getState();
  const cases = documentArchive.list();
  const disputed = cases.filter((c) => c.disputed && !c.stitcherOutcome).length;
  const failed = cases.filter((c) => c.stitcherOutcome === "FAILED").length;

  // Find adjacent silicate for the alignment shortcut.
  const adj = ((): string | null => {
    for (const e of s.entities.values()) {
      if (e.kind !== "SILICATE" || e.status !== "ACTIVE") continue;
      if (e.pos.z !== s.player.pos.z) continue;
      const dx = Math.abs(e.pos.x - s.player.pos.x);
      const dy = Math.abs(e.pos.y - s.player.pos.y);
      if (dx + dy === 1) return e.id;
    }
    return null;
  })();

  // Standing on a vent control?
  const here = (() => {
    const f = worldEngine.getFloor(s.player.pos.z);
    if (!f) return null;
    return f.tiles[s.player.pos.y * f.width + s.player.pos.x];
  })();
  const onVent = here?.kind === "VENT_CONTROL" && !ventOptimizer.hasDecided();

  // Fragment Box hint — items aren't rendered in the scene yet, so the
  // SidePanel surfaces the current encumbrance affordance.
  const holdingEmp = s.player.inventory.some((i) => i.itemType === "EMP_DEVICE");
  const holdingBox = s.player.inventory.some((i) => i.itemType === "FRAGMENT_BOX");
  const boxHere = !holdingBox && (() => {
    for (const item of s.items.values()) {
      if (item.itemType !== "FRAGMENT_BOX") continue;
      if (!item.pos) continue;
      if (
        item.pos.x === s.player.pos.x &&
        item.pos.y === s.player.pos.y &&
        item.pos.z === s.player.pos.z
      ) return true;
    }
    return false;
  })();
  const fragmentBoxHint = holdingBox
    ? "Drop FRAGMENT_BOX (B) — currently encumbered"
    : boxHere
      ? "Pick up FRAGMENT_BOX (B)"
      : null;

  return (
    <aside className="az-hud-side">
      <h3>STATION</h3>
      <button onClick={p.onOpenArchive}>
        Document Archive (R) — {cases.length} cases
        {disputed ? ` · ${disputed} disputed` : ""}
        {failed ? ` · ${failed} unreconciled` : ""}
      </button>
      <button onClick={p.onOpenAlignment} disabled={!adj}>
        Alignment Session (F) {adj ? `— ${adj}` : "— no subject"}
      </button>
      <button onClick={p.onOpenVent} disabled={!onVent}>
        VENT-4 Console {onVent ? "" : "— stand on the panel"}
      </button>
      <button onClick={p.onOpenLog}>Extracted Entity Log</button>
      {fragmentBoxHint && (
        <button
          onClick={() => worldEngine.toggleFragmentBox()}
          style={{ borderColor: holdingBox ? "#c89adb" : undefined }}
        >
          {fragmentBoxHint}
        </button>
      )}
      {holdingEmp && (
        <button
          onClick={() => worldEngine.useEmpDevice()}
          style={{ borderColor: "#7ad4f0" }}
        >
          Use EMP device (X)
        </button>
      )}
      <h3 style={{ marginTop: 10 }}>SHIFT</h3>
      <button onClick={p.onOpenSaveLoad}>Save / Load (M)</button>
      <button onClick={p.onOpenSettings}>Settings (,)</button>
    </aside>
  );
}
