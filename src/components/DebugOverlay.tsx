// Archivist debug overlay. Toggled by `~`. Persists flag values via
// useDebugStore. The event log panel is selectable + copyable so logs
// can be pasted into bug reports — leaning into the hacker UX.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebugStore, type DebugEvent } from "../state/useDebugStore";
import { footsteps } from "../audio/Footsteps";
import { getSharedContext, isAudioUnlocked } from "../audio/audio-context";

const LEVEL_COLOR: Record<DebugEvent["level"], string> = {
  INFO: "#9bb1b6",
  WARN: "#ebd14a",
  FATAL: "#ff5050",
};

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function formatLine(e: DebugEvent): string {
  return `[0x${hex(e.id)}] T${String(e.turn).padStart(4, "0")} ${e.level.padEnd(5)} ${e.tag.padEnd(22)} ${e.payload}`;
}

const btnStyle: React.CSSProperties = {
  background: "#0a1014",
  border: "1px solid #1d2a30",
  color: "#6ad0a4",
  padding: "4px 8px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

export default function DebugOverlay(): React.ReactElement | null {
  const visible = useDebugStore((s) => s.visible);
  if (!visible) return null;
  return <DebugOverlayBody />;
}

function AudioDebugPanel(): React.ReactElement {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const ctx = getSharedContext();
  const stats = footsteps.getStats();
  const ctxState = ctx ? ctx.state : "uncreated";
  const unlocked = isAudioUnlocked();

  return (
    <div
      style={{
        padding: "8px 10px",
        borderTop: "1px solid #1d2a30",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ color: "#6ad0a4", letterSpacing: 1.2 }}>AUDIO</div>
      <div>
        ctx: {ctxState} {unlocked ? "[unlocked]" : "[locked]"}
      </div>
      <div>
        plays {stats.plays} · fires {stats.fires} · cached {stats.cachedBuffers}
      </div>
      <div>
        loaded {stats.loaded} · loadFails {stats.loadFails}
      </div>
      {stats.lastError && (
        <div style={{ color: "#ebd14a", whiteSpace: "normal" }}>
          err: {stats.lastError}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => footsteps.testTone()} style={btnStyle}>
          [test tone]
        </button>
        <button
          type="button"
          onClick={() =>
            footsteps.play({ surface: "dirtyground", action: "walk", volume: 1 })
          }
          style={btnStyle}
        >
          [test sample]
        </button>
        <button
          type="button"
          onClick={() => {
            const c = getSharedContext();
            if (c && c.state === "suspended") void c.resume();
          }}
          style={btnStyle}
        >
          [force resume]
        </button>
      </div>
    </div>
  );
}

function DebugOverlayBody(): React.ReactElement {
  const flags = useDebugStore((s) => s.flags);
  const events = useDebugStore((s) => s.events);
  const setFlag = useDebugStore((s) => s.setFlag);
  const clearEvents = useDebugStore((s) => s.clearEvents);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return events;
    const needle = filter.trim().toLowerCase();
    return events.filter((e) => e.tag.toLowerCase().includes(needle));
  }, [events, filter]);

  const copyAll = useCallback(() => {
    const text = filtered.map(formatLine).join("\n");
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    }
  }, [filtered]);

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        width: 380,
        maxHeight: "70vh",
        background: "rgba(5,8,9,0.92)",
        border: "1px solid #1d2a30",
        color: "#9bb1b6",
        fontFamily: '"Berkeley Mono", "Courier New", monospace',
        fontSize: 11,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 0 24px rgba(0,0,0,0.6)",
      }}
    >
      <header
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid #1d2a30",
          color: "#6ad0a4",
          letterSpacing: 1.2,
        }}
      >
        ARCHIVIST DEBUG // ~ TO CLOSE
      </header>

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={flags.showHitboxes}
            onChange={(e) => setFlag("showHitboxes", e.target.checked)}
          />{" "}
          Show hitboxes
        </label>
        <label style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={flags.disableEnforcerAI}
            onChange={(e) => setFlag("disableEnforcerAI", e.target.checked)}
          />{" "}
          Disable Enforcer AI
        </label>
        <label style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={flags.showTileElevation}
            onChange={(e) => setFlag("showTileElevation", e.target.checked)}
          />{" "}
          Show tile elevation
        </label>
      </div>

      <AudioDebugPanel />

      <div
        style={{
          padding: "6px 10px",
          borderTop: "1px solid #1d2a30",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="filter tag…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            background: "#0a1014",
            border: "1px solid #1d2a30",
            color: "#9bb1b6",
            padding: "2px 6px",
            fontFamily: "inherit",
            fontSize: 11,
          }}
        />
        <button
          type="button"
          onClick={copyAll}
          style={{
            background: "#0a1014",
            border: "1px solid #1d2a30",
            color: "#6ad0a4",
            padding: "2px 8px",
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          [copy all]
        </button>
        <button
          type="button"
          onClick={clearEvents}
          style={{
            background: "#0a1014",
            border: "1px solid #1d2a30",
            color: "#9bb1b6",
            padding: "2px 8px",
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          [clear]
        </button>
      </div>

      <pre
        style={{
          margin: 0,
          padding: "6px 10px",
          flex: 1,
          overflowY: "auto",
          userSelect: "text",
          background: "#04070a",
          borderTop: "1px solid #1d2a30",
          fontFamily: "inherit",
          fontSize: 11,
          lineHeight: 1.4,
        }}
      >
        {filtered.map((e) => (
          <div key={e.id} style={{ color: LEVEL_COLOR[e.level] }}>
            {formatLine(e)}
          </div>
        ))}
      </pre>
    </div>
  );
}
