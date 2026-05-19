// Archivist debug overlay. Toggled by `~`. Persists flag values via
// useDebugStore. The event log panel is selectable + copyable so logs
// can be pasted into bug reports — leaning into the hacker UX.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebugStore, type DebugEvent } from "../state/useDebugStore";
import { footsteps } from "../audio/Footsteps";
import { getSharedContext, getUnlockStats } from "../audio/audio-context";
import { getBridgeStats } from "../audio/footstep-bridge";
import { forcePlay, forceStop, getMusicStats } from "../audio/MusicBridge";
import { soundField } from "../engine/SoundField";

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
  const stats = footsteps.getStats();
  const bridge = getBridgeStats();
  const unlockStats = getUnlockStats();
  const sfStats = soundField.getStats();
  const musicStats = getMusicStats();
  const reasonsLine = Object.entries(bridge.player.byReason)
    .map(([r, n]) => `${r} ${n}`)
    .join(" · ");
  const playerLast = bridge.player.last;
  const guardLast = bridge.guard.last;
  const unlockErr = unlockStats.lastError;

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
        ctx: {unlockStats.ctxState}{" "}
        {unlockStats.unlocked && unlockStats.ctxState === "running"
          ? "[unlocked]"
          : "[locked]"}
      </div>
      <div>
        gestures: {unlockStats.gestures}
        {unlockStats.lastGesture ? ` (last: ${unlockStats.lastGesture})` : ""}
      </div>
      <div>
        soundField emits: {sfStats.emits}
        {sfStats.lastReason ? ` (last: ${sfStats.lastReason})` : ""}
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
      {unlockErr && (
        <div style={{ color: "#ebd14a", whiteSpace: "normal" }}>
          unlock err: {unlockErr}
        </div>
      )}

      <div style={{ color: "#6ad0a4", letterSpacing: 1.2, marginTop: 4 }}>BRIDGE</div>
      <div>
        recv {bridge.player.received} · played {bridge.player.played} · bail
        prof {bridge.player.bailNoProfile} · tile {bridge.player.bailNoTile} ·
        surf {bridge.player.bailNoSurface}
      </div>
      <div>reasons: {reasonsLine || "—"}</div>
      <div>
        last:{" "}
        {playerLast
          ? `${playerLast.reason} @ ${playerLast.roomId} ${playerLast.pos.x},${playerLast.pos.y} → ${playerLast.surface ?? "—"}`
          : "—"}
      </div>

      <div style={{ color: "#6ad0a4", letterSpacing: 1.2, marginTop: 4 }}>GUARDS</div>
      <div>
        recv {bridge.guard.received} · played {bridge.guard.played} · room{" "}
        {bridge.guard.bailRoom} · tile {bridge.guard.bailNoTile} · surf{" "}
        {bridge.guard.bailNoSurface} · vol {bridge.guard.bailZeroVolume}
      </div>
      <div>
        last:{" "}
        {guardLast
          ? `${guardLast.roomId} ${guardLast.pos.x},${guardLast.pos.y} d=${guardLast.dist} v=${guardLast.volume.toFixed(2)}`
          : "—"}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
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

      <div style={{ color: "#6ad0a4", letterSpacing: 1.2, marginTop: 4 }}>MUSIC</div>
      <div>
        loaded {String(musicStats.loaded)} · playing {String(musicStats.playing)} ·
        state {musicStats.lastState} · hot {musicStats.hotGuards}
      </div>
      {musicStats.lastError && (
        <div style={{ color: "#ebd14a", whiteSpace: "normal" }}>
          err: {musicStats.lastError}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        <button type="button" onClick={() => void forcePlay()} style={btnStyle}>
          [play chase]
        </button>
        <button type="button" onClick={() => forceStop()} style={btnStyle}>
          [stop]
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
  const toggleVisible = useDebugStore((s) => s.toggleVisible);
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
      className="debug-overlay"
      style={{
        background: "rgba(5,8,9,0.92)",
        border: "1px solid #1d2a30",
        color: "#9bb1b6",
        fontFamily: '"Berkeley Mono", "Courier New", monospace',
        fontSize: 11,
        boxShadow: "0 0 24px rgba(0,0,0,0.6)",
      }}
    >
      <header
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid #1d2a30",
          color: "#6ad0a4",
          letterSpacing: 1.2,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ flex: 1 }}>ARCHIVIST DEBUG // ~ OR [X] TO CLOSE</span>
        <button
          type="button"
          onClick={toggleVisible}
          aria-label="Close debug overlay"
          className="debug-overlay__close"
        >
          [X]
        </button>
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
