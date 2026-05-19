// One-shot SFX player. Fetches the staged jsfxr def file once, renders
// every named sound to an AudioBuffer via src/audio/jsfxr.ts, and plays
// on demand. Same structural pattern as Footsteps.ts — shared
// AudioContext via getSharedContext(), master GainNode for bus volume,
// debug counters for the AUDIO panel.

import { getSharedContext } from "./audio-context";
import { parseJsfxrDump, renderAll } from "./jsfxr";

const DEFS_URL = "/audio/sfx/defs.txt";

interface PlayOpts {
  volume?: number;
  pan?: number;
}

interface SfxStats {
  plays: number;
  fires: number;
  loaded: boolean;
  loadError: string | null;
  cachedBuffers: number;
  masterGain: number;
  names: string[];
  byName: Record<string, number>;
  lastName: string | null;
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private maxGain = 0.5;
  private buffers: Record<string, AudioBuffer> | null = null;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private loadError: string | null = null;

  private statPlays = 0;
  private statFires = 0;
  private byName: Record<string, number> = {};
  private lastName: string | null = null;

  private ensure(): boolean {
    if (this.ctx && this.master) return true;
    const ctx = getSharedContext();
    if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.maxGain;
    this.master.connect(ctx.destination);
    return true;
  }

  private load(): Promise<void> {
    if (this.loaded || this.loading) return this.loading ?? Promise.resolve();
    if (!this.ensure() || !this.ctx) {
      this.loadError = "no audio context";
      return Promise.resolve();
    }
    const ctx = this.ctx;
    this.loading = (async () => {
      try {
        const res = await fetch(DEFS_URL);
        if (!res.ok) {
          this.loadError = `fetch ${DEFS_URL} → ${res.status}`;
          return;
        }
        const text = await res.text();
        const defs = parseJsfxrDump(text);
        if (Object.keys(defs).length === 0) {
          this.loadError = "no defs parsed";
          return;
        }
        this.buffers = renderAll(ctx, defs);
        this.loaded = true;
      } catch (err) {
        this.loadError = err instanceof Error ? err.message : String(err);
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** Kick off the def fetch + render. Safe to call before the audio
   *  context unlocks — `ensure()` will retry on the first play() that
   *  follows a user gesture. */
  preload(): void {
    void this.load();
  }

  /** Names available after preload completes. Empty until then. */
  names(): string[] {
    return this.buffers ? Object.keys(this.buffers) : [];
  }

  setMax(v: number): void {
    this.maxGain = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.maxGain;
  }

  play(name: string, opts: PlayOpts = {}): void {
    this.statPlays++;
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    this.lastName = name;
    if (!this.ensure() || !this.ctx || !this.master) return;
    if (!this.loaded) {
      void this.load().then(() => this.fire(name, opts));
      return;
    }
    this.fire(name, opts);
  }

  private fire(name: string, opts: PlayOpts): void {
    if (!this.ctx || !this.master || !this.buffers) return;
    const buf = this.buffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, opts.volume ?? 1));
    src.connect(gain);
    if (opts.pan !== undefined && typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    src.start();
    this.statFires++;
  }

  getStats(): SfxStats {
    return {
      plays: this.statPlays,
      fires: this.statFires,
      loaded: this.loaded,
      loadError: this.loadError,
      cachedBuffers: this.buffers ? Object.keys(this.buffers).length : 0,
      masterGain: this.maxGain,
      names: this.buffers ? Object.keys(this.buffers) : [],
      byName: { ...this.byName },
      lastName: this.lastName,
    };
  }
}

export const sfx = new Sfx();
