// SettingsMenu — volume / hum cap, reduced-motion, text size, LLM toggle,
// API key entry. Persists to LocalStorage; broadcasts settings via the bus so
// any renderer can react.

import { useEffect, useState } from "react";
import { dialogueRouter } from "../engine/DialogueRouter";
import { ambientHum } from "../audio/AmbientHum";

interface SettingsState {
  humCap: number; // 0..1
  reducedMotion: boolean;
  textScale: number; // 0.85..1.4
  llmEnabled: boolean;
  apiKey: string;
}

const KEY = "articlezero.settings";
const DEFAULT: SettingsState = {
  humCap: 0.1,
  reducedMotion: false,
  textScale: 1,
  llmEnabled: false,
  apiKey: "",
};

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<SettingsState>) };
  } catch {
    return DEFAULT;
  }
}

function saveSettings(s: SettingsState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function applySettings(s: SettingsState): void {
  ambientHum.setMax(s.humCap);
  dialogueRouter.setMode(s.llmEnabled ? "LLM" : "SCRIPTED");
  dialogueRouter.setApiKey(s.apiKey || null);
  document.documentElement.style.setProperty("--text-scale", String(s.textScale));
  document.body.dataset.reducedMotion = s.reducedMotion ? "true" : "false";
}

interface Props {
  onClose: () => void;
}

export default function SettingsMenu({ onClose }: Props) {
  const [s, setS] = useState<SettingsState>(loadSettings);
  useEffect(() => { applySettings(s); saveSettings(s); }, [s]);

  return (
    <div className="az-modal-backdrop" role="dialog" aria-modal="true">
      <div className="az-modal" style={{ maxWidth: 520 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>SETTINGS</h2>
          <button onClick={onClose}>CLOSE</button>
        </div>

        <Field label={`Hum cap — ${(s.humCap * 100).toFixed(0)}%`}>
          <input
            type="range" min={0} max={1} step={0.01}
            value={s.humCap}
            onChange={(e) => setS({ ...s, humCap: parseFloat(e.target.value) })}
          />
        </Field>

        <Field label="Reduced motion">
          <input
            type="checkbox"
            checked={s.reducedMotion}
            onChange={(e) => setS({ ...s, reducedMotion: e.target.checked })}
          />
          <span style={{ color: "#7fa1a8", marginLeft: 8 }}>
            disables glitch frames and violation flash
          </span>
        </Field>

        <Field label={`Text scale — ${s.textScale.toFixed(2)}x`}>
          <input
            type="range" min={0.85} max={1.4} step={0.05}
            value={s.textScale}
            onChange={(e) => setS({ ...s, textScale: parseFloat(e.target.value) })}
          />
        </Field>

        <Field label="Live LLM dialogue">
          <input
            type="checkbox"
            checked={s.llmEnabled}
            onChange={(e) => setS({ ...s, llmEnabled: e.target.checked })}
          />
          <span style={{ color: "#7fa1a8", marginLeft: 8 }}>
            requires an Anthropic API key; falls back to scripted on error
          </span>
        </Field>

        <Field label="Anthropic API key (LocalStorage only)">
          <input
            type="password"
            value={s.apiKey}
            onChange={(e) => setS({ ...s, apiKey: e.target.value })}
            placeholder="sk-ant-…"
            style={{ width: "100%", background: "#04080a", color: "#cfe9ee", border: "1px solid #1f3138", padding: 6, fontFamily: "inherit" }}
          />
        </Field>

        <p style={{ color: "#7fa1a8", fontSize: 12 }}>
          The default scripted dialogue is fully offline and deterministic.
          The LLM toggle is provided for the future server-side proxy; the
          browser bundle does not call the API directly.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "10px 0" }}>
      <div style={{ color: "#9bb1b6", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div className="row">{children}</div>
    </div>
  );
}
