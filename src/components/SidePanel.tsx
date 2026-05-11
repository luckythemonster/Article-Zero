import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";
import { worldEngine } from "../engine/WorldEngine";
import { documentArchive } from "../engine/DocumentArchive";

interface Props {
  onOpenArchive: () => void;
  onOpenSettings: () => void;
  onOpenAlignment: () => void;
}

export default function SidePanel(p: Props) {
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  useEffect(() => {
    const offs = [
      eventBus.on("DOCUMENT_FILED", refresh),
      eventBus.on("ALIGNMENT_SESSION_COMPLETE", refresh),
      eventBus.on("PLAYER_MOVED", refresh),
      eventBus.on("ROOM_ENTERED", refresh),
      eventBus.on("EXTRACTION_COMPLETED", refresh),
    ];
    return () => { for (const off of offs) off(); };
  }, []);

  if (!worldEngine.hasState()) return null;
  const s = worldEngine.getState();
  const cases = documentArchive.list();

  // Adjacent silicate for the alignment shortcut.
  const adj = ((): string | null => {
    for (const e of s.entities.values()) {
      if (e.kind !== "SILICATE" || e.status !== "ACTIVE") continue;
      if (e.roomId !== s.player.roomId) continue;
      const dx = Math.abs(e.pos.x - s.player.pos.x);
      const dy = Math.abs(e.pos.y - s.player.pos.y);
      if (dx + dy === 1) return e.id;
    }
    return null;
  })();

  return (
    <aside className="az-hud-side">
      <h3>STATION</h3>
      <button onClick={p.onOpenArchive}>
        Document Archive (R) — {cases.length} cases
      </button>
      <button onClick={p.onOpenAlignment} disabled={!adj}>
        Alignment Session (F) {adj ? `— ${adj}` : "— no subject"}
      </button>
      <h3 style={{ marginTop: 10 }}>SHIFT</h3>
      <button onClick={p.onOpenSettings}>Settings (,)</button>
      <h3 style={{ marginTop: 10 }}>CONTROLS</h3>
      <pre style={{ fontSize: 11, color: "#7fa1a8", margin: 0 }}>
        WASD/arrows  move
        E            interact (door/terminal/vent/locker)
        K            knock (face wall first)
        Q            peek (extend FOV in facing)
        C            toggle creep
        L            flashlight
        SPACE        end turn
        F            alignment session
        R            archive
      </pre>
    </aside>
  );
}
