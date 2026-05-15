// Settings persistence — extracted from the old SettingsMenu component.

import { dialogueRouter } from "../engine/DialogueRouter";
import { ambientHum } from "../audio/AmbientHum";

export interface SettingsState {
  humCap: number;
  reducedMotion: boolean;
  textScale: number;
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

export function saveSettings(s: SettingsState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function applySettings(s: SettingsState): void {
  ambientHum.setMax(s.humCap);
  dialogueRouter.setMode(s.llmEnabled ? "LLM" : "SCRIPTED");
  dialogueRouter.setApiKey(s.apiKey || null);
  document.documentElement.style.setProperty("--text-scale", String(s.textScale));
  document.body.dataset.reducedMotion = s.reducedMotion ? "true" : "false";
}
