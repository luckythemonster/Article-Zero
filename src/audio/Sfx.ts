// SFX player. Two backends, one surface:
//   • jsfxr — defs.txt is fetched once, every named param block is
//     pre-rendered to an AudioBuffer at load. Synth one-shots.
//   • wav  — index.json is fetched once at preload, but each clip's
//     AudioBuffer is fetched + decoded lazily on first play (same
//     pattern as Footsteps.ts). Supports looping via play(name,
//     { loop: true }) → LoopHandle.
// Dispatch by name: jsfxr first, then wav. Slugs are dotted
// (alarm.biohazard) and jsfxr names are bare words (Alarm, Scan), so
// collisions are structurally impossible.

import { getSharedContext } from "./audio-context";
import { parseJsfxrDump, renderAll } from "./jsfxr";
import { GLITCH_INDEX_URL, type GlitchEntry } from "./glitch-manifest";

const DEFS_URL = "/audio/sfx/defs.txt";

interface PlayOpts {
  volume?: number;
  pan?: number;
  loop?: boolean;
}

export interface LoopHandle {
  stop(): void;
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
  wavIndexLoaded: boolean;
  wavIndexError: string | null;
  wavCached: number;
  wavPending: number;
  wavLastError: string | null;
  wavByName: Record<string, number>;
  activeLoops: number;
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private maxGain = 0.5;
  private buffers: Record<string, AudioBuffer> | null = null;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private loadError: string | null = null;

  private wavIndex: Record<string, GlitchEntry> | null = null;
  private wavIndexLoading: Promise<void> | null = null;
  private wavIndexLoaded = false;
  private wavIndexError: string | null = null;
  private wavBuffers = new Map<string, AudioBuffer>();
  private wavPending = new Map<string, Promise<AudioBuffer | null>>();
  private wavLastError: string | null = null;
  private wavByName: Record<string, number> = {};
  private activeLoops = 0;

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

  /** Kick off the def fetch + render and the wav index fetch. Safe to
   *  call before the audio context unlocks — `ensure()` will retry on
   *  the first play() that follows a user gesture. */
  preload(): void {
    void this.load();
    void this.loadWavIndex();
  }

  private loadWavIndex(): Promise<void> {
    if (this.wavIndexLoaded || this.wavIndexLoading) {
      return this.wavIndexLoading ?? Promise.resolve();
    }
    this.wavIndexLoading = (async () => {
      try {
        const res = await fetch(GLITCH_INDEX_URL);
        if (!res.ok) {
          this.wavIndexError = `fetch ${GLITCH_INDEX_URL} → ${res.status}`;
          return;
        }
        const list = (await res.json()) as GlitchEntry[];
        const map: Record<string, GlitchEntry> = {};
        for (const entry of list) map[entry.name] = entry;
        this.wavIndex = map;
        this.wavIndexLoaded = true;
      } catch (err) {
        this.wavIndexError = err instanceof Error ? err.message : String(err);
      } finally {
        this.wavIndexLoading = null;
      }
    })();
    return this.wavIndexLoading;
  }

  private async loadWavBuffer(entry: GlitchEntry): Promise<AudioBuffer | null> {
    const cached = this.wavBuffers.get(entry.name);
    if (cached) return cached;
    const inflight = this.wavPending.get(entry.name);
    if (inflight) return inflight;
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const p = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(entry.file);
        if (!res.ok) {
          this.wavLastError = `fetch ${entry.file} → ${res.status}`;
          return null;
        }
        const bytes = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(bytes);
        this.wavBuffers.set(entry.name, buf);
        return buf;
      } catch (err) {
        this.wavLastError = `${entry.file}: ${err instanceof Error ? err.message : String(err)}`;
        return null;
      } finally {
        this.wavPending.delete(entry.name);
      }
    })();
    this.wavPending.set(entry.name, p);
    return p;
  }

  /** Names available after preload completes. Empty until then. */
  names(): string[] {
    return this.buffers ? Object.keys(this.buffers) : [];
  }

  setMax(v: number): void {
    this.maxGain = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.maxGain;
  }

  play(name: string, opts: PlayOpts = {}): LoopHandle | null {
    this.statPlays++;
    this.byName[name] = (this.byName[name] ?? 0) + 1;
    this.lastName = name;
    if (!this.ensure() || !this.ctx || !this.master) return null;

    // jsfxr path: bare-word names like "Alarm", "Scan", "APEX-19".
    if (this.loaded && this.buffers && this.buffers[name]) {
      return this.fire(name, opts);
    }
    if (!this.loaded) {
      // The jsfxr fetch is in flight or hasn't started. If the name is
      // a known wav slug we route there; otherwise wait for jsfxr.
      if (this.wavIndex && this.wavIndex[name]) {
        return this.playWav(name, opts);
      }
      void this.load().then(() => this.fire(name, opts));
      return null;
    }

    // jsfxr loaded but name not found there — try wav.
    return this.playWav(name, opts);
  }

  private playWav(name: string, opts: PlayOpts): LoopHandle | null {
    if (!this.wavIndexLoaded && !this.wavIndex) {
      // For one-shots we can fire-and-forget after the index loads.
      // Loops need a handle the caller can stop pre-decode — defer.
      if (opts.loop) return this.deferredLoop(name, opts);
      void this.loadWavIndex().then(() => this.playWav(name, opts));
      return null;
    }
    const entry = this.wavIndex?.[name];
    if (!entry) return null;
    this.wavByName[name] = (this.wavByName[name] ?? 0) + 1;
    const cached = this.wavBuffers.get(name);
    if (cached) return this.fireWav(entry, cached, opts);
    const wantLoop = opts.loop ?? entry.loop;
    if (wantLoop) return this.deferredLoop(name, opts, entry);
    // Lazy first-touch fetch + decode for a one-shot. Returning null
    // here means the very first play of a clip is silent; subsequent
    // plays use the cached buffer.
    void this.loadWavBuffer(entry).then((buf) => {
      if (buf) this.fireWav(entry, buf, opts);
    });
    return null;
  }

  /** Stub handle returned when a loop is requested before its buffer
   *  is decoded. The async loader checks the cancelled flag; if the
   *  caller already stopped before decode finished, we skip firing.
   *  Otherwise we fire and the handle's stop() rebinds to the real
   *  BufferSource. */
  private deferredLoop(
    name: string,
    opts: PlayOpts,
    knownEntry?: GlitchEntry,
  ): LoopHandle {
    let cancelled = false;
    let real: LoopHandle | null = null;
    const handle: LoopHandle = {
      stop: () => {
        cancelled = true;
        real?.stop();
      },
    };
    const start = async () => {
      if (!knownEntry) {
        await this.loadWavIndex();
        knownEntry = this.wavIndex?.[name];
      }
      if (!knownEntry || cancelled) return;
      this.wavByName[name] = (this.wavByName[name] ?? 0) + 1;
      const buf = this.wavBuffers.get(name) ?? (await this.loadWavBuffer(knownEntry));
      if (!buf || cancelled) return;
      real = this.fireWav(knownEntry, buf, opts);
    };
    void start();
    return handle;
  }

  private fire(name: string, opts: PlayOpts): LoopHandle | null {
    if (!this.ctx || !this.master || !this.buffers) return null;
    const buf = this.buffers[name];
    if (!buf) return null;
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
    return null;
  }

  private fireWav(entry: GlitchEntry, buf: AudioBuffer, opts: PlayOpts): LoopHandle | null {
    if (!this.ctx || !this.master) return null;
    const ctx = this.ctx;
    const master = this.master;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, opts.volume ?? entry.defaultVolume));
    src.connect(gain);
    gain.connect(master);
    const loop = opts.loop ?? entry.loop;
    src.loop = loop;
    src.start();
    this.statFires++;
    if (!loop) return null;
    this.activeLoops++;
    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        try { src.stop(); } catch { /* already stopped */ }
        try { src.disconnect(); } catch { /* noop */ }
        try { gain.disconnect(); } catch { /* noop */ }
        this.activeLoops--;
      },
    };
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
      wavIndexLoaded: this.wavIndexLoaded,
      wavIndexError: this.wavIndexError,
      wavCached: this.wavBuffers.size,
      wavPending: this.wavPending.size,
      wavLastError: this.wavLastError,
      wavByName: { ...this.wavByName },
      activeLoops: this.activeLoops,
    };
  }
}

export const sfx = new Sfx();
