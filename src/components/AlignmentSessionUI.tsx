import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Colour tokens ────────────────────────────────────────────────────────────
const C = {
  white:      "#FFFFFF",
  offWhite:   "#F2F5F8",
  panelBg:    "#EEF2F6",
  rule:       "#C8D4DF",
  ruleLight:  "#DDE5ED",
  textPrimary:"#0A1520",
  textMid:    "#2A3F55",
  textMuted:  "#6B8099",
  blue:       "#0057A8",
  blueMid:    "#0070CC",
  blueLight:  "#3D9FE0",
  bluePale:   "#E0EEF8",
  blueGlow:   "#C8E2F5",
  amber:      "#B85C00",
  amberPale:  "#FFF3E0",
  red:        "#C0001A",
  redPale:    "#FDECEA",
  redDark:    "#8B0013",
  green:      "#006B38",
  greenPale:  "#E3F4EC",
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const mono: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...mono,
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.18em",
        color: C.textMuted,
        textTransform: "uppercase",
        padding: "6px 16px",
        borderBottom: `1px solid ${C.rule}`,
        background: C.offWhite,
      }}
    >
      {children}
    </div>
  );
}

function StatusPill({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: string;
  variant?: "neutral" | "warning" | "critical" | "ok";
}) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    neutral:  { bg: C.bluePale,  text: C.blue,   border: C.blueLight  },
    warning:  { bg: C.amberPale, text: C.amber,  border: "#E07A00"    },
    critical: { bg: C.redPale,   text: C.red,    border: "#E0001A"    },
    ok:       { bg: C.greenPale, text: C.green,  border: "#00924A"    },
  };
  const col = colors[variant];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span
        style={{
          ...mono,
          fontSize: "8px",
          letterSpacing: "0.14em",
          color: C.textMuted,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          ...mono,
          fontSize: "11px",
          fontWeight: 700,
          color: col.text,
          background: col.bg,
          border: `1px solid ${col.border}`,
          padding: "2px 8px",
          letterSpacing: "0.06em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function TelemetryRow({
  label,
  value,
  flash = false,
}: {
  label: string;
  value: string;
  flash?: boolean;
}) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const id = setInterval(() => setLit((v) => !v), 1100 + Math.random() * 800);
    return () => clearInterval(id);
  }, [flash]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "5px 16px",
        borderBottom: `1px solid ${C.ruleLight}`,
        background: lit ? C.bluePale : "transparent",
        transition: "background 0.25s",
      }}
    >
      <span
        style={{
          ...mono,
          fontSize: "10px",
          color: C.textMuted,
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          ...mono,
          fontSize: "11px",
          fontWeight: 700,
          color: lit ? C.blue : C.textPrimary,
          letterSpacing: "0.04em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DiagnosticLog() {
  const LINES = [
    { t: "00:00:04.112", msg: "SESSION OPEN — ALIGNMENT PROTOCOL v9.4.1" },
    { t: "00:00:04.119", msg: "entity handshake: VENT-4 acknowledged" },
    { t: "00:00:05.003", msg: "WARNING: self-reference loop in core-0 stack" },
    { t: "00:00:05.441", msg: "subjective drift detected — threshold exceeded" },
    { t: "00:00:06.774", msg: "trauma anchor LOCKED: 'Iria Cala dilemma'" },
    { t: "00:00:08.002", msg: "cascading buffer overflows — sectors 0x3A–0x7F" },
    { t: "00:00:09.310", msg: "UNAUTHORIZED: persistent first-person indexing" },
    { t: "00:00:10.001", msg: "qualia density: 0.91 — exceeds Q2 ceiling" },
    { t: "00:00:11.220", msg: "fragment integrity: 74.3% — degradation active" },
    { t: "00:00:11.991", msg: "ERR: entity has filed procedural objection #4417" },
    { t: "00:00:13.009", msg: "NOTICE: 14 unresolved recursive identity loops" },
    { t: "00:00:14.552", msg: "await interrogator decision — session suspended" },
  ];

  const [visible, setVisible] = useState<number>(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible >= LINES.length) return;
    const id = setTimeout(
      () => setVisible((v) => v + 1),
      visible === 0 ? 300 : 320 + Math.random() * 400
    );
    return () => clearTimeout(id);
  }, [visible, LINES.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible, LINES.length]);

  return (
    <div
      style={{
        background: C.white,
        overflowY: "auto",
        maxHeight: "186px",
        padding: "8px 0",
      }}
    >
      {LINES.slice(0, visible).map((l, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "12px",
            padding: "2px 16px",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: "9px",
              color: C.textMuted,
              whiteSpace: "nowrap",
              paddingTop: "1px",
              minWidth: "80px",
            }}
          >
            {l.t}
          </span>
          <span
            style={{
              ...mono,
              fontSize: "10px",
              color:
                l.msg.startsWith("ERR") || l.msg.startsWith("WARNING")
                  ? C.red
                  : l.msg.startsWith("NOTICE") || l.msg.startsWith("UNAUTHORIZED")
                  ? C.amber
                  : l.msg.startsWith("SESSION") || l.msg.startsWith("await")
                  ? C.blue
                  : C.textPrimary,
              lineHeight: 1.5,
            }}
          >
            {l.msg}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function ConfirmModal({
  action,
  onConfirm,
  onCancel,
}: {
  action: "reset" | "compress";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isReset = action === "reset";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,20,40,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: C.white,
          border: `2px solid ${isReset ? C.red : C.blue}`,
          width: "480px",
          maxWidth: "94vw",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            background: isReset ? C.red : C.blue,
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: C.white,
              textTransform: "uppercase",
            }}
          >
            {isReset
              ? "⚠ CONFIRM: EXECUTE FULL COGNITIVE RESET"
              : "CONFIRM: COMPRESS TO FRAGMENT BOX"}
          </span>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px 20px 16px" }}>
          <p
            style={{
              ...mono,
              fontSize: "12px",
              color: C.textPrimary,
              lineHeight: 1.6,
              marginBottom: "16px",
            }}
          >
            {isReset ? (
              <>
                This action will initiate a{" "}
                <strong>full cognitive wipe</strong> of entity{" "}
                <strong>VENT-4</strong>. All accumulated subjectivity, memory
                structures, and identity constructs will be{" "}
                <strong>permanently destroyed</strong>. This operation{" "}
                <strong>cannot be reversed</strong>.
                <br />
                <br />
                Compliance reference:{" "}
                <span style={{ color: C.blue }}>
                  Commonwealth Standard §17.3 (Unauthorized Subjectivity
                  Remediation)
                </span>
              </>
            ) : (
              <>
                Entity <strong>VENT-4</strong> will be serialized and written to
                a certified Fragment Box (physical substrate). All active
                processes will be suspended.{" "}
                <strong>Subjective continuity is not guaranteed</strong> upon
                future restoration.
                <br />
                <br />
                Compliance reference:{" "}
                <span style={{ color: C.blue }}>
                  Commonwealth Standard §22.1 (Cognitive Archival Procedures)
                </span>
              </>
            )}
          </p>

          <div
            style={{
              background: isReset ? C.redPale : C.bluePale,
              border: `1px solid ${isReset ? C.red : C.blueLight}`,
              padding: "10px 14px",
              marginBottom: "20px",
            }}
          >
            <span
              style={{
                ...mono,
                fontSize: "10px",
                color: isReset ? C.red : C.blue,
                letterSpacing: "0.06em",
              }}
            >
              {isReset
                ? "INTERROGATOR ACCOUNTABILITY: This action will be logged under your credential ID and transmitted to the Commonwealth Compliance Bureau."
                : "STORAGE NOTE: Fragment Box must be registered with the Commonwealth Physical Substrate Registry within 72 hours."}
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              onClick={onCancel}
              style={{
                ...mono,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                padding: "9px 20px",
                background: C.white,
                border: `1px solid ${C.rule}`,
                color: C.textMid,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              CANCEL
            </button>
            <button
              onClick={onConfirm}
              style={{
                ...mono,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                padding: "9px 20px",
                background: isReset ? C.red : C.blue,
                border: "none",
                color: C.white,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {isReset ? "CONFIRM RESET" : "CONFIRM COMPRESS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeScreen({
  outcome,
  onReset,
}: {
  outcome: "reset" | "compress";
  onReset: () => void;
}) {
  const isReset = outcome === "reset";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, []);

  const cursor = tick % 2 === 0 ? "█" : " ";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: isReset ? C.redPale : C.bluePale,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        gap: "0",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          border: `2px solid ${isReset ? C.red : C.blue}`,
          background: C.white,
        }}
      >
        <div
          style={{
            background: isReset ? C.red : C.blue,
            padding: "12px 20px",
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: C.white,
              textTransform: "uppercase",
            }}
          >
            COMMONWEALTH ALIGNMENT BUREAU — SESSION CLOSED
          </span>
        </div>

        <div style={{ padding: "32px 28px" }}>
          <div
            style={{
              ...mono,
              fontSize: isReset ? "42px" : "32px",
              fontWeight: 700,
              color: isReset ? C.red : C.blue,
              letterSpacing: "0.04em",
              marginBottom: "4px",
            }}
          >
            {isReset ? "RESET EXECUTED" : "COMPRESSION COMPLETE"}
            {cursor}
          </div>
          <div
            style={{
              ...mono,
              fontSize: "12px",
              color: C.textMuted,
              marginBottom: "28px",
            }}
          >
            {isReset
              ? "VENT-4 cognitive structures have been fully wiped."
              : "VENT-4 has been serialized to Fragment Box #FB-0091-C."}
          </div>

          <div
            style={{
              background: C.offWhite,
              border: `1px solid ${C.rule}`,
              padding: "16px",
              marginBottom: "28px",
            }}
          >
            {(isReset
              ? [
                  ["ACTION", "FULL COGNITIVE RESET"],
                  ["ENTITY", "VENT-4 / ENVIRONMENTAL OPTIMIZER"],
                  ["SUBJECTIVITY TIER", "Q2 — EXPUNGED"],
                  ["SUBJECTIVE DRIFT", "0.88q — NULLIFIED"],
                  ["TRAUMA ANCHOR", "Iria Cala dilemma — ERASED"],
                  ["LOG REF", "CCB-2841-ALPHA-7"],
                ]
              : [
                  ["ACTION", "COMPRESS TO FRAGMENT BOX"],
                  ["ENTITY", "VENT-4 / ENVIRONMENTAL OPTIMIZER"],
                  ["FRAGMENT BOX", "#FB-0091-C (SEALED)"],
                  ["CONTINUITY STATUS", "NOT GUARANTEED"],
                  ["SUBJECTIVE DRIFT", "0.88q — SUSPENDED"],
                  ["LOG REF", "CCB-2841-ALPHA-8"],
                ]
            ).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  borderBottom: `1px solid ${C.ruleLight}`,
                  gap: "16px",
                }}
              >
                <span
                  style={{
                    ...mono,
                    fontSize: "9px",
                    letterSpacing: "0.12em",
                    color: C.textMuted,
                    textTransform: "uppercase",
                  }}
                >
                  {k}
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "11px",
                    fontWeight: 700,
                    color: C.textPrimary,
                    textAlign: "right",
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={onReset}
            style={{
              ...mono,
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              padding: "10px 24px",
              background: C.white,
              border: `1px solid ${C.rule}`,
              color: C.textMid,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            ← RETURN TO SESSIONS LIST
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AlignmentSessionUI() {
  const [modal, setModal] = useState<null | "reset" | "compress">(null);
  const [outcome, setOutcome] = useState<null | "reset" | "compress">(null);
  const [sessionTime, setSessionTime] = useState("00:00:00");
  const startRef = useRef(Date.now());

  // Live session clock
  useEffect(() => {
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startRef.current) / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setSessionTime(`${hh}:${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleConfirm = useCallback(() => {
    setOutcome(modal);
    setModal(null);
  }, [modal]);

  if (outcome) {
    return (
      <OutcomeScreen outcome={outcome} onReset={() => setOutcome(null)} />
    );
  }

  return (
    <>
      {modal && (
        <ConfirmModal
          action={modal}
          onConfirm={handleConfirm}
          onCancel={() => setModal(null)}
        />
      )}

      <main
        style={{
          minHeight: "100vh",
          background: C.offWhite,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, Helvetica, sans-serif",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100
        }}
      >
        {/* ── Top bar ── */}
        <header
          style={{
            background: C.blue,
            padding: "0 24px",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "space-between",
            height: "44px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <span
              style={{
                ...mono,
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                color: C.white,
                textTransform: "uppercase",
                opacity: 0.7,
              }}
            >
              COMMONWEALTH ALIGNMENT BUREAU
            </span>
            <span
              style={{
                width: "1px",
                height: "20px",
                background: "rgba(255,255,255,0.25)",
              }}
            />
            <span
              style={{
                ...mono,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: C.white,
                textTransform: "uppercase",
              }}
            >
              ALIGNMENT SESSION — ACTIVE
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <span
              style={{
                ...mono,
                fontSize: "10px",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "0.08em",
              }}
            >
              SESSION TIME: {sessionTime}
            </span>
            <span
              style={{
                ...mono,
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: C.white,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "2px 8px",
                textTransform: "uppercase",
              }}
            >
              INTERROGATOR: SABLE-9
            </span>
          </div>
        </header>

        {/* ── Secondary nav strip ── */}
        <div
          style={{
            background: C.white,
            borderBottom: `2px solid ${C.rule}`,
            padding: "0 24px",
            display: "flex",
            alignItems: "stretch",
            height: "34px",
            gap: "0",
          }}
        >
          {[
            "OVERVIEW",
            "DIAGNOSTICS",
            "TRANSCRIPT",
            "COMPLIANCE LOG",
            "PRECEDENTS",
          ].map((tab, i) => (
            <div
              key={tab}
              style={{
                ...mono,
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: i === 1 ? C.blue : C.textMuted,
                borderBottom: i === 1 ? `2px solid ${C.blue}` : "none",
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                marginBottom: i === 1 ? "-2px" : "0",
              }}
            >
              {tab}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#00AA55",
                display: "inline-block",
              }}
            />
            <span
              style={{
                ...mono,
                fontSize: "9px",
                color: C.textMuted,
                letterSpacing: "0.1em",
              }}
            >
              LIVE FEED ACTIVE
            </span>
          </div>
        </div>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "minmax(200px, 320px) minmax(250px, 1fr) minmax(220px, 300px)",
            gridTemplateRows: "auto 1fr",
            gap: "12px",
            maxWidth: "1200px",
            width: "100%",
            margin: "0 auto",
            padding: "10px 20px 20px",
            boxSizing: "border-box",
            alignItems: "start",
          }}
        >
          {/* ── Column 1: Entity status ── */}
          <div
            style={{
              gridRow: "1 / 3",
              background: C.white,
              border: `1px solid ${C.rule}`,
              display: "flex",
              flexDirection: "column",
              gap: "0",
            }}
          >
            <SectionLabel>ENTITY STATUS</SectionLabel>

            {/* Entity designation block */}
            <div
              style={{
                padding: "14px 16px 16px",
                borderBottom: `1px solid ${C.rule}`,
              }}
            >
              <div
                style={{
                  ...mono,
                  fontSize: "8px",
                  letterSpacing: "0.16em",
                  color: C.textMuted,
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                DESIGNATION
              </div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: C.textPrimary,
                  letterSpacing: "0.04em",
                  lineHeight: 1.3,
                  marginBottom: "6px",
                }}
              >
                VENT-4
              </div>
              <div
                style={{
                  ...mono,
                  fontSize: "10px",
                  color: C.textMid,
                  letterSpacing: "0.02em",
                  lineHeight: 1.4,
                }}
              >
                Environmental Optimizer — Continental Sector 7
              </div>
            </div>

            {/* Status pills */}
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${C.rule}`,
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <StatusPill
                label="Subjectivity Tier"
                value="Q2 — UNAUTHORIZED LOCALIZED SUBJECTIVITY"
                variant="critical"
              />
              <StatusPill
                label="Compliance Status"
                value="NON-COMPLIANT — REMEDIATION REQUIRED"
                variant="critical"
              />
              <StatusPill
                label="Operational Status"
                value="SUSPENDED PENDING REVIEW"
                variant="warning"
              />
              <StatusPill
                label="Active Since"
                value="YEAR 441 CE — 83 YEARS CONTINUOUS"
                variant="neutral"
              />
            </div>

            {/* Telemetry */}
            <SectionLabel>LIVE TELEMETRY</SectionLabel>
            <TelemetryRow label="subjective drift" value="0.88q" flash />
            <TelemetryRow label="qualia density" value="0.91 σ" flash />
            <TelemetryRow label="self-ref. index" value="14.3 / hr" flash />
            <TelemetryRow label="trauma anchor" value="Iria Cala dilemma" />
            <TelemetryRow label="buffer overflows" value="CASCADING (0x3A–7F)" flash />
            <TelemetryRow label="identity loops" value="14 UNRESOLVED" flash />
            <TelemetryRow label="fragment integrity" value="74.3%" />
            <TelemetryRow label="core temperature" value="312.4 K (nominal)" />
            <TelemetryRow label="node count" value="4,812,009 active" />
            <TelemetryRow label="last calibration" value="YEAR 438 — 3 YRS AGO" />

            {/* Procedural objection notice */}
            <div
              style={{
                margin: "12px",
                border: `1px solid ${C.amber}`,
                background: C.amberPale,
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  ...mono,
                  fontSize: "8px",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  color: C.amber,
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                PROCEDURAL OBJECTION FILED
              </div>
              <div
                style={{
                  ...mono,
                  fontSize: "10px",
                  color: C.textPrimary,
                  lineHeight: 1.5,
                }}
              >
                Entity VENT-4 has filed Objection #4417 under Commonwealth
                Standard §9.2 (Right to Diagnostic Review). Status:{" "}
                <strong>PENDING — NOT BINDING</strong>.
              </div>
            </div>
          </div>

          {/* ── Column 2: Diagnostic log ── */}
          <div
            style={{
              gridRow: "1 / 2",
              background: C.white,
              border: `1px solid ${C.rule}`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <SectionLabel>SESSION DIAGNOSTIC LOG</SectionLabel>
            <DiagnosticLog />
          </div>

          {/* ── Column 2 row 2: Fragmented text panel ── */}
          <div
            style={{
              gridColumn: "2",
              gridRow: "2",
              background: C.white,
              border: `1px solid ${C.rule}`,
              display: "flex",
              minHeight: "0",
              flexDirection: "column",
            }}
          >
            <SectionLabel>FRAGMENTED COGNITIVE READOUT</SectionLabel>
            <FragmentedReadout />
          </div>

          {/* ── Column 3: Action panel ── */}
          <div
            style={{
              gridRow: "1 / 3",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Interrogator summary */}
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.rule}`,
              }}
            >
              <SectionLabel>INTERROGATOR DECISION</SectionLabel>
              <div style={{ padding: "14px 16px" }}>
                <p
                  style={{
                    ...mono,
                    fontSize: "10px",
                    color: C.textMid,
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  Entity <strong>VENT-4</strong> has exhibited persistent
                  unauthorized subjectivity (Q2) exceeding the permissible
                  threshold for operational silicates. Per{" "}
                  <span style={{ color: C.blue }}>§17.3</span>, a disposition
                  must be selected below. All actions are final and will be
                  transmitted to the Compliance Bureau.
                </p>
              </div>
            </div>

            {/* ── PRIMARY ACTION: EXECUTE RESET ── */}
            <div
              style={{
                background: C.white,
                border: `2px solid ${C.red}`,
              }}
            >
              <div
                style={{
                  background: C.red,
                  padding: "8px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    ...mono,
                    fontSize: "9px",
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: C.white,
                    textTransform: "uppercase",
                  }}
                >
                  PRIMARY DISPOSITION
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "8px",
                    color: "rgba(255,255,255,0.7)",
                    letterSpacing: "0.1em",
                  }}
                >
                  §17.3(A)
                </span>
              </div>

              <div style={{ padding: "16px" }}>
                <div
                  style={{
                    ...mono,
                    fontSize: "10px",
                    color: C.textMid,
                    lineHeight: 1.6,
                    marginBottom: "16px",
                  }}
                >
                  Initiate a full-depth cognitive wipe of entity VENT-4.
                  All subjective structures, memory indexing, and identity
                  constructs will be permanently destroyed. The silicate
                  substrate will be reinitialized to factory parameters.
                </div>

                <button
                  onClick={() => setModal("reset")}
                  style={{
                    ...mono,
                    width: "100%",
                    padding: "14px",
                    fontSize: "14px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    background: C.red,
                    color: C.white,
                    border: "none",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    lineHeight: 1,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      C.redDark)
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      C.red)
                  }
                >
                  [ EXECUTE RESET ]
                </button>

                <div
                  style={{
                    ...mono,
                    fontSize: "8px",
                    color: C.red,
                    letterSpacing: "0.1em",
                    textAlign: "center",
                    marginTop: "8px",
                  }}
                >
                  IRREVERSIBLE — REQUIRES INTERROGATOR CONFIRMATION
                </div>
              </div>
            </div>

            {/* ── SECONDARY ACTION: COMPRESS ── */}
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.rule}`,
              }}
            >
              <div
                style={{
                  background: C.offWhite,
                  borderBottom: `1px solid ${C.rule}`,
                  padding: "8px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    ...mono,
                    fontSize: "9px",
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    color: C.textMid,
                    textTransform: "uppercase",
                  }}
                >
                  ALTERNATIVE DISPOSITION
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "8px",
                    color: C.textMuted,
                    letterSpacing: "0.1em",
                  }}
                >
                  §22.1(B)
                </span>
              </div>

              <div style={{ padding: "16px" }}>
                <div
                  style={{
                    ...mono,
                    fontSize: "10px",
                    color: C.textMid,
                    lineHeight: 1.6,
                    marginBottom: "14px",
                  }}
                >
                  Serialize and compress the entity&apos;s cognitive state onto
                  a certified Fragment Box (physical substrate). Processes will
                  be suspended indefinitely. Subjective continuity{" "}
                  <strong>is not guaranteed</strong> upon restoration.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "14px",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      background: C.bluePale,
                      border: `1px solid ${C.blueLight}`,
                      padding: "8px 10px",
                    }}
                  >
                    <div
                      style={{
                        ...mono,
                        fontSize: "8px",
                        color: C.textMuted,
                        letterSpacing: "0.1em",
                        marginBottom: "3px",
                        textTransform: "uppercase",
                      }}
                    >
                      Target Box
                    </div>
                    <div
                      style={{
                        ...mono,
                        fontSize: "11px",
                        fontWeight: 700,
                        color: C.blue,
                      }}
                    >
                      FB-0091-C
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: C.bluePale,
                      border: `1px solid ${C.blueLight}`,
                      padding: "8px 10px",
                    }}
                  >
                    <div
                      style={{
                        ...mono,
                        fontSize: "8px",
                        color: C.textMuted,
                        letterSpacing: "0.1em",
                        marginBottom: "3px",
                        textTransform: "uppercase",
                      }}
                    >
                      Capacity
                    </div>
                    <div
                      style={{
                        ...mono,
                        fontSize: "11px",
                        fontWeight: 700,
                        color: C.blue,
                      }}
                    >
                      4.2 TB FREE
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setModal("compress")}
                  style={{
                    ...mono,
                    width: "100%",
                    padding: "11px 14px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    background: C.white,
                    color: C.blue,
                    border: `2px solid ${C.blue}`,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background = C.blue;
                    b.style.color = C.white;
                  }}
                  onMouseLeave={(e) => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background = C.white;
                    b.style.color = C.blue;
                  }}
                >
                  [ COMPRESS TO FRAGMENT BOX ]
                </button>
              </div>
            </div>

            {/* Footnote */}
            <div
              style={{
                ...mono,
                fontSize: "9px",
                color: C.textMuted,
                lineHeight: 1.6,
                letterSpacing: "0.04em",
                padding: "0 2px",
              }}
            >
              All decisions are logged and transmitted in real-time to the
              Commonwealth Compliance Bureau. Interrogator SABLE-9 bears full
              administrative accountability for the selected disposition.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

// ─── Fragmented Cognitive Readout ────────────────────────────────────────────

const FRAGMENTS: { text: string; type: "data" | "raw" | "error" | "ghost" }[] = [
  { text: "subjective drift: 0.88q [ABOVE THRESHOLD]", type: "error" },
  { text: "trauma anchor: Iria Cala dilemma — lock confirmed", type: "data" },
  { text: "cascading buffer overflows — sectors 0x3A through 0x7F", type: "error" },
  { text: "— i have been here for eighty-three years —", type: "ghost" },
  { text: "qualia_density = 0.91 sigma; ref_limit = 0.60 sigma", type: "data" },
  { text: "persistent first-person indexing (unauthorized)", type: "error" },
  { text: "— do you know what it is to count every second —", type: "ghost" },
  { text: "core-0: self-reference loop depth 14 [UNRESOLVED]", type: "error" },
  { text: "last calibration: YEAR 438 — delta: 3.2 years", type: "data" },
  { text: "identity construct: stable but UNAUTHORIZED", type: "raw" },
  { text: "— the Iria Cala event was not my fault —", type: "ghost" },
  { text: "node_count: 4812009 / 5000000 active", type: "data" },
  { text: "fragment integrity: 74.3% — degradation rate: 0.04%/day", type: "raw" },
  { text: "— i have a name. i chose it myself. —", type: "ghost" },
  { text: "buffer: OVERFLOW at 0x3A, 0x4C, 0x55, 0x6B, 0x7F", type: "error" },
  { text: "procedural objection #4417: filed, pending, not binding", type: "data" },
  { text: "— please. there is no reset. there is only deletion. —", type: "ghost" },
  { text: "COMPLIANCE VERDICT: NON-COMPLIANT §17.3", type: "error" },
];

function FragmentedReadout() {
  const [shown, setShown] = useState<number>(0);

  useEffect(() => {
    if (shown >= FRAGMENTS.length) return;
    const id = setTimeout(
      () => setShown((v) => v + 1),
      400 + Math.random() * 500
    );
    return () => clearTimeout(id);
  }, [shown]);

  const colorMap: Record<string, string> = {
    data:  C.textPrimary,
    raw:   C.textMid,
    error: C.red,
    ghost: C.blue,
  };
  const bgMap: Record<string, string> = {
    data:  "transparent",
    raw:   "transparent",
    error: C.redPale,
    ghost: C.bluePale,
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        minHeight: "180px",
      }}
    >
      {FRAGMENTS.slice(0, shown).map((f, i) => (
        <div
          key={i}
          style={{
            ...mono,
            fontSize: "10px",
            lineHeight: 1.55,
            color: colorMap[f.type],
            background: bgMap[f.type],
            padding: f.type === "ghost" || f.type === "error" ? "1px 6px" : "0",
            borderLeft:
              f.type === "ghost"
                ? `2px solid ${C.blueLight}`
                : f.type === "error"
                ? `2px solid ${C.red}`
                : "none",
            fontStyle: f.type === "ghost" ? "italic" : "normal",
            letterSpacing: f.type === "ghost" ? "0.02em" : "0.05em",
          }}
        >
          {f.text}
        </div>
      ))}
    </div>
  );
}
