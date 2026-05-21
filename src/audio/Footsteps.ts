// Sample-based footstep player. Lazy-loads the wav pool per (surface, action)
// the first time it's needed; thereafter plays a non-immediate-repeat variant
// at the requested volume. One-shot BufferSources are routed through a master
// gain so callers can cap the bus volume without touching each step.

import { getSharedContext } from "./audio-context";
import { FOOTSTEP_VARIANTS, type FootstepAction } from "./footstep-manifest";
import type { SurfaceType } from "../types/world.types";

interface PlayOpts {
  surface: SurfaceType;
  action: FootstepAction;
  /** Per-step gain 0..1. Master cap still applies. Default 1. */
  volume?: number;
}

class Footsteps {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private maxGain = 0.6;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private lastIdx = new Map<string, number>();
  // Debug counters surfaced by getStats() / the audio debug panel.
  private statPlays = 0;
  private statFires = 0;
  private statLoaded = 0;
  private statLoadFails = 0;
  private lastError: string | null = null;

  getStats(): {
    plays: number;
    fires: number;
    loaded: number;
    loadFails: number;
    cachedBuffers: number;
    masterGain: number;
    lastError: string | null;
  } {
    return {
      plays: this.statPlays,
      fires: this.statFires,
      loaded: this.statLoaded,
      loadFails: this.statLoadFails,
      cachedBuffers: this.buffers.size,
      masterGain: this.maxGain,
      lastError: this.lastError,
    };
  }

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

  setMax(v: number): void {
    this.maxGain = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.maxGain;
  }

  play(opts: PlayOpts): void {
    this.statPlays++;
    if (!this.ensure() || !this.ctx || !this.master) {
      this.lastError = "no audio context";
      return;
    }
    const count = FOOTSTEP_VARIANTS[opts.surface]?.[opts.action];
    if (!count || count <= 0) return;
    const key = `${opts.surface}/${opts.action}`;
    const idx = this.pickIndex(key, count);
    const bufKey = `${key}_${idx}`;
    const buf = this.buffers.get(bufKey);
    if (buf) {
      this.fire(buf, opts.volume ?? 1);
      return;
    }
    // First touch of this variant — kick off a fetch and play once ready.
    // The race-condition risk is bounded: a duplicate fetch for the same key
    // is harmless (decodeAudioData on the same bytes twice).
    void this.load(opts.surface, opts.action, idx).then((b) => {
      if (b) this.fire(b, opts.volume ?? 1);
    });
  }

  /** Play a 440Hz, 200ms sine via WebAudio. Bypasses fetch + decode so it
   *  isolates "is the AudioContext actually producing sound?" from "are the
   *  wav fetches working?". Returns the context state for the debug panel. */
  testTone(): { state: string } {
    if (!this.ensure() || !this.ctx || !this.master) {
      this.lastError = "no audio context";
      return { state: "no-context" };
    }
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 440;
    const g = this.ctx.createGain();
    g.gain.value = 0.3;
    osc.connect(g);
    g.connect(this.master);
    const now = this.ctx.currentTime;
    osc.start(now);
    osc.stop(now + 0.2);
    return { state: this.ctx.state };
  }

  private pickIndex(key: string, count: number): number {
    if (count === 1) return 1;
    const last = this.lastIdx.get(key) ?? 0;
    let next = 1 + Math.floor(Math.random() * count);
    if (next === last) next = 1 + ((next + Math.floor(Math.random() * (count - 1))) % count);
    this.lastIdx.set(key, next);
    return next;
  }

  private async load(
    surface: SurfaceType,
    action: FootstepAction,
    idx: number,
  ): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const bufKey = `${surface}/${action}_${idx}`;
    const cached = this.buffers.get(bufKey);
    if (cached) return cached;
    const inflight = this.pending.get(bufKey);
    if (inflight) return inflight;
    const url = `/audio/footsteps/${surface}/${action}_${String(idx).padStart(2, "0")}.wav`;
    const ctx = this.ctx;
    const p = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          this.lastError = `fetch ${url} → ${res.status}`;
          this.statLoadFails++;
          return null;
        }
        const bytes = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(bytes);
        this.buffers.set(bufKey, buf);
        this.statLoaded++;
        return buf;
      } catch (err) {
        this.lastError = `${url}: ${err instanceof Error ? err.message : String(err)}`;
        this.statLoadFails++;
        return null;
      } finally {
        this.pending.delete(bufKey);
      }
    })();
    this.pending.set(bufKey, p);
    return p;
  }

  private fire(buf: AudioBuffer, volume: number): void {
    if (!this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gain);
    gain.connect(this.master);
    src.start();
    this.statFires++;
  }
}

export const footsteps = new Footsteps();
