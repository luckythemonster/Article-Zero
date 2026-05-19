// BeepBox v9 runtime synth — chase-track-shaped.
//
// Consumes a `format: "BeepBox"` JSON dump (see `public/audio/music/chase.json`)
// and renders it through Web Audio. The implementation deliberately targets
// the subset of features the NW-SMAC-01 chase track exercises:
//
//   - FM voice (4 operators, two algorithms: "(1 2)←3←4" and "(1 2 3)←4")
//     with feedback on operator 1
//   - additive harmonics voice (sums 28 partials weighted by the channel
//     harmonics array)
//   - drumset voice (one prebuilt noise buffer per drum, shaped by the
//     drum's spectrum and filter envelope)
//   - low-pass note filter
//   - peak eq filter
//   - reverb (synthetic exponentially-decaying noise IR via ConvolverNode)
//   - chorus (two short-delay taps with LFO modulation)
//
// Out of scope for the chase track: Picked-String voice, "tremolo5"/"twang N"
// envelope shapes are reduced to a simple fast-attack exponential decay,
// pitch-bend on multi-point notes is treated as held pitch (the chase JSON
// uses pitchBend only in two ornamental places — close enough), and
// `unison: "hum"` on the harmonics drone is rendered as a single voice.
//
// Pitch convention: BeepBox stores pitches as semitones from C0; we add a
// fixed octave offset so the track plays in a sensible range. The "key" /
// "scale" fields are ignored (the encoded note numbers already imply the
// final pitches the composer wanted, modulo a global transpose).

import { getSharedContext } from "./audio-context";

const PITCH_BASE_MIDI = 12; // pitch 0 → MIDI 12 (C0)
const TICKS_PER_BEAT_FALLBACK = 8;
const BEATS_PER_BAR_FALLBACK = 8;
const LOOK_AHEAD_S = 0.5;
const SCHEDULE_INTERVAL_MS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Parsed song shape (subset of BeepBox v9)

interface FilterSpec {
  type: "low-pass" | "high-pass" | "peak";
  cutoffHz: number;
  linearGain: number;
}

interface OperatorSpec {
  frequency: string; // e.g. "~1×", "2×", "11×"
  amplitude: number;
}

type InstrumentSpec =
  | {
      type: "FM";
      volume: number;
      algorithm: string;
      feedbackAmplitude: number;
      operators: OperatorSpec[];
      eqFilter: FilterSpec[];
      noteFilter: FilterSpec[];
      reverb?: number;
      chorus?: number;
    }
  | {
      type: "harmonics";
      volume: number;
      harmonics: number[];
      eqFilter: FilterSpec[];
      noteFilter: FilterSpec[];
      reverb?: number;
      chorus?: number;
    }
  | {
      type: "drumset";
      volume: number;
      drums: Array<{ spectrum: number[]; filterEnvelope: string }>;
      reverb?: number;
    };

interface NotePoint {
  tick: number;
  pitchBend: number;
  volume: number;
}

interface ParsedNote {
  pitches: number[];
  startTick: number;
  endTick: number;
  volume: number;
}

interface ChannelSpec {
  type: "pitch" | "drum";
  instrument: InstrumentSpec;
  patterns: ParsedNote[][];
  sequence: number[];
}

interface ParsedSong {
  bpm: number;
  ticksPerBeat: number;
  beatsPerBar: number;
  loopBars: number;
  channels: ChannelSpec[];
}

interface BeepBoxJson {
  format: string;
  version: number;
  beatsPerMinute?: number;
  ticksPerBeat?: number;
  beatsPerBar?: number;
  loopBars?: number;
  channels: Array<{
    type: "pitch" | "drum";
    instruments: unknown[];
    patterns: Array<{ notes: unknown[] }>;
    sequence: number[];
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser

function parseInstrument(raw: unknown): InstrumentSpec | null {
  const r = raw as { type?: string };
  if (!r || typeof r !== "object" || typeof r.type !== "string") return null;
  const inst = r as Record<string, unknown>;
  const vol = (inst.volume as number | undefined) ?? 80;
  const eqFilter = (inst.eqFilter as FilterSpec[] | undefined) ?? [];
  const noteFilter = (inst.noteFilter as FilterSpec[] | undefined) ?? [];
  if (inst.type === "FM") {
    return {
      type: "FM",
      volume: vol,
      algorithm: (inst.algorithm as string) ?? "(1 2)←3←4",
      feedbackAmplitude: (inst.feedbackAmplitude as number) ?? 0,
      operators: (inst.operators as OperatorSpec[]) ?? [],
      eqFilter,
      noteFilter,
      reverb: inst.reverb as number | undefined,
      chorus: inst.chorus as number | undefined,
    };
  }
  if (inst.type === "harmonics") {
    return {
      type: "harmonics",
      volume: vol,
      harmonics: (inst.harmonics as number[]) ?? [],
      eqFilter,
      noteFilter,
      reverb: inst.reverb as number | undefined,
      chorus: inst.chorus as number | undefined,
    };
  }
  if (inst.type === "drumset") {
    return {
      type: "drumset",
      volume: vol,
      drums: (inst.drums as Array<{ spectrum: number[]; filterEnvelope: string }>) ?? [],
      reverb: inst.reverb as number | undefined,
    };
  }
  return null;
}

function parsePattern(raw: { notes: unknown[] }): ParsedNote[] {
  const out: ParsedNote[] = [];
  for (const n of raw.notes as Array<{
    pitches: number[];
    points: NotePoint[];
  }>) {
    if (!n.points || n.points.length < 2) continue;
    const startTick = n.points[0].tick;
    const endTick = n.points[n.points.length - 1].tick;
    const volume = n.points[0].volume / 100;
    out.push({
      pitches: n.pitches.slice(),
      startTick,
      endTick,
      volume,
    });
  }
  return out;
}

export function parseSong(raw: BeepBoxJson): ParsedSong {
  const channels: ChannelSpec[] = [];
  for (const ch of raw.channels) {
    const inst = parseInstrument(ch.instruments[0]);
    if (!inst) continue;
    channels.push({
      type: ch.type,
      instrument: inst,
      patterns: ch.patterns.map(parsePattern),
      sequence: ch.sequence.slice(),
    });
  }
  return {
    bpm: raw.beatsPerMinute ?? 120,
    ticksPerBeat: raw.ticksPerBeat ?? TICKS_PER_BEAT_FALLBACK,
    beatsPerBar: raw.beatsPerBar ?? BEATS_PER_BAR_FALLBACK,
    loopBars: raw.loopBars ?? 1,
    channels,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice rendering helpers

function pitchToFreq(pitch: number): number {
  const midi = pitch + PITCH_BASE_MIDI;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function operatorFreqMul(spec: string): number {
  // BeepBox encodes operator frequency as a textual ratio. We map the ones
  // used by the chase track. Unknown forms fall back to 1×.
  const cleaned = spec.replace("×", "").trim();
  if (cleaned.startsWith("~")) {
    // Slightly-detuned variant — BeepBox uses it for the lead.
    const n = parseFloat(cleaned.slice(1));
    return Number.isFinite(n) ? n * 1.003 : 1.003;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 1;
}

function applyFilter(ctx: AudioContext, f: FilterSpec): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  if (f.type === "low-pass") node.type = "lowpass";
  else if (f.type === "high-pass") node.type = "highpass";
  else node.type = "peaking";
  node.frequency.value = f.cutoffHz;
  if (node.type === "peaking") {
    node.gain.value = 20 * Math.log10(Math.max(0.1, f.linearGain));
    node.Q.value = 1;
  } else {
    node.Q.value = Math.max(0.0001, f.linearGain);
  }
  return node;
}

function buildReverbIr(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
  }
  return buf;
}

/** A chorus is implemented as two short, LFO-modulated delays summed into the
 *  output. `depth` is 0..1 (mapped from BeepBox's 0..100 "chorus" value). */
function buildChorus(ctx: AudioContext, depth: number): {
  input: AudioNode;
  output: AudioNode;
  dispose: () => void;
} {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1 - depth * 0.4;
  wet.gain.value = depth * 0.6;
  input.connect(dry).connect(output);

  const lfoNodes: OscillatorNode[] = [];
  for (let i = 0; i < 2; i++) {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.012 + i * 0.007;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.4 + i * 0.2;
    lfoGain.gain.value = 0.005;
    lfo.connect(lfoGain).connect(delay.delayTime);
    lfo.start();
    input.connect(delay).connect(wet);
    lfoNodes.push(lfo);
  }
  wet.connect(output);

  return {
    input,
    output,
    dispose: () => {
      for (const l of lfoNodes) {
        try {
          l.stop();
        } catch {
          // already stopped
        }
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect chain (per-channel)

interface ChannelChain {
  input: AudioNode;
  dispose: () => void;
}

function buildChannelChain(
  ctx: AudioContext,
  inst: InstrumentSpec,
  master: AudioNode,
): ChannelChain {
  const head = ctx.createGain();
  let tail: AudioNode = head;

  const ownedFilters: BiquadFilterNode[] = [];
  if ("noteFilter" in inst) {
    for (const f of inst.noteFilter) {
      const node = applyFilter(ctx, f);
      tail.connect(node);
      tail = node;
      ownedFilters.push(node);
    }
    for (const f of inst.eqFilter) {
      const node = applyFilter(ctx, f);
      tail.connect(node);
      tail = node;
      ownedFilters.push(node);
    }
  }

  const volGain = ctx.createGain();
  // BeepBox volume is 0..100; we attenuate further for headroom across 4 channels.
  volGain.gain.value = (inst.volume / 100) * 0.18;
  tail.connect(volGain);
  tail = volGain;

  let chorusDispose: (() => void) | null = null;
  if ("chorus" in inst && inst.chorus && inst.chorus > 0) {
    const ch = buildChorus(ctx, inst.chorus / 100);
    tail.connect(ch.input);
    tail = ch.output;
    chorusDispose = ch.dispose;
  }

  if ("reverb" in inst && inst.reverb && inst.reverb > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = buildReverbIr(ctx, 1.5);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const mix = ctx.createGain();
    dry.gain.value = 1 - inst.reverb / 200;
    wet.gain.value = inst.reverb / 200;
    tail.connect(dry).connect(mix);
    tail.connect(conv).connect(wet).connect(mix);
    tail = mix;
  }

  tail.connect(master);

  return {
    input: head,
    dispose: () => {
      chorusDispose?.();
      try {
        head.disconnect();
      } catch {
        // ignore
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice scheduling

interface VoiceHandle {
  stop(when: number): void;
}

function scheduleFmNote(
  ctx: AudioContext,
  inst: Extract<InstrumentSpec, { type: "FM" }>,
  chain: AudioNode,
  freq: number,
  start: number,
  end: number,
  volume: number,
): VoiceHandle {
  // Two operator topologies are supported (the chase track uses both):
  //   "(1 2)←3←4":   op4 → op3 → (op1, op2); op1 & op2 are carriers.
  //   "(1 2 3)←4":   op4 → (op1, op2, op3); op1/op2/op3 are carriers.
  const fanCarriers = inst.algorithm.includes("(1 2 3)");
  const carriers: Array<{ osc: OscillatorNode; gain: GainNode }> = [];

  const op = (idx: number, base: number) => {
    const osc = ctx.createOscillator();
    const opSpec = inst.operators[idx];
    osc.frequency.value = base * operatorFreqMul(opSpec?.frequency ?? "1×");
    return osc;
  };
  const o1 = op(0, freq);
  const o2 = op(1, freq);
  const o3 = op(2, freq);
  const o4 = op(3, freq);

  const modGain = (idx: number): GainNode => {
    const g = ctx.createGain();
    const amp = inst.operators[idx]?.amplitude ?? 0;
    // Map BeepBox's 0..15 amplitude to a usable FM index (Hz of deviation).
    g.gain.value = (amp / 15) * 1500;
    return g;
  };

  if (fanCarriers) {
    // op4 modulates op1, op2, op3 — fan-out
    const m4 = modGain(3);
    o4.connect(m4);
    m4.connect(o1.frequency);
    m4.connect(o2.frequency);
    m4.connect(o3.frequency);
    o4.start(start);
    o4.stop(end + 0.05);
    for (const c of [o1, o2, o3]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(volume, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, end + 0.05);
      c.connect(g).connect(chain);
      c.start(start);
      c.stop(end + 0.05);
      carriers.push({ osc: c, gain: g });
    }
    // op4 is modulator only — do NOT route to chain
  } else {
    // op4 → op3 → (op1, op2)
    const m4 = modGain(3);
    o4.connect(m4).connect(o3.frequency);
    o4.start(start);
    o4.stop(end + 0.05);

    const m3a = modGain(2);
    const m3b = modGain(2);
    o3.connect(m3a).connect(o1.frequency);
    o3.connect(m3b).connect(o2.frequency);
    o3.start(start);
    o3.stop(end + 0.05);

    for (const c of [o1, o2]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(volume, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, end + 0.05);
      c.connect(g).connect(chain);
      c.start(start);
      c.stop(end + 0.05);
      carriers.push({ osc: c, gain: g });
    }
  }

  return {
    stop(when: number) {
      for (const c of carriers) {
        try {
          c.gain.gain.cancelScheduledValues(when);
          c.gain.gain.setTargetAtTime(0, when, 0.01);
          c.osc.stop(when + 0.1);
        } catch {
          // already stopped
        }
      }
    },
  };
}

function scheduleHarmonicsNote(
  ctx: AudioContext,
  inst: Extract<InstrumentSpec, { type: "harmonics" }>,
  chain: AudioNode,
  freq: number,
  start: number,
  end: number,
  volume: number,
): VoiceHandle {
  const oscs: OscillatorNode[] = [];
  const sumGain = ctx.createGain();
  sumGain.gain.setValueAtTime(0, start);
  sumGain.gain.linearRampToValueAtTime(volume * 0.05, start + 0.05);
  sumGain.gain.setTargetAtTime(0.001, end - 0.05, 0.1);
  sumGain.connect(chain);

  let activeCount = 0;
  for (let h = 0; h < Math.min(inst.harmonics.length, 16); h++) {
    const weight = inst.harmonics[h] / 100;
    if (weight <= 0) continue;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * (h + 1);
    if (osc.frequency.value > 18000) {
      continue;
    }
    const g = ctx.createGain();
    g.gain.value = weight / (h + 1);
    osc.connect(g).connect(sumGain);
    osc.start(start);
    osc.stop(end + 0.1);
    oscs.push(osc);
    activeCount++;
    if (activeCount > 10) break;
  }

  return {
    stop(when: number) {
      try {
        sumGain.gain.cancelScheduledValues(when);
        sumGain.gain.setTargetAtTime(0, when, 0.02);
      } catch {
        // ignore
      }
      for (const o of oscs) {
        try {
          o.stop(when + 0.15);
        } catch {
          // already stopped
        }
      }
    },
  };
}

function buildDrumBuffer(
  ctx: AudioContext,
  spectrum: number[],
  filterEnvelope: string,
): AudioBuffer {
  // Synthesise a short noise burst whose spectral envelope follows the
  // drum's `spectrum` row (30 bands, low-to-high). Then we taper it with
  // a decay shaped by `filterEnvelope` ("twang N", "decay N", "flare N").
  const durSec = 0.4;
  const len = Math.floor(ctx.sampleRate * durSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  // Build a 30-band oscillator bank summed into the buffer offline.
  // Each band's amplitude is its spectrum value (0..100). Phases randomised.
  const bands = spectrum.length;
  const bandWeights = spectrum.map((v) => v / 100);
  const bandFreqs: number[] = [];
  for (let b = 0; b < bands; b++) {
    // Logarithmic spread from ~80 Hz to ~12 kHz.
    bandFreqs.push(80 * Math.pow(150, b / (bands - 1)));
  }
  const phases = bandFreqs.map(() => Math.random() * Math.PI * 2);

  let decayRate = 18;
  if (filterEnvelope.startsWith("twang")) {
    const n = parseInt(filterEnvelope.slice(5).trim(), 10);
    decayRate = 6 + (Number.isFinite(n) ? n : 1) * 8;
  } else if (filterEnvelope.startsWith("decay")) {
    const n = parseInt(filterEnvelope.slice(5).trim(), 10);
    decayRate = 3 + (Number.isFinite(n) ? n : 1) * 3;
  } else if (filterEnvelope.startsWith("flare")) {
    decayRate = 12;
  }

  const dt = 1 / ctx.sampleRate;
  for (let i = 0; i < len; i++) {
    const t = i * dt;
    const env = Math.exp(-decayRate * t);
    let sample = 0;
    for (let b = 0; b < bands; b++) {
      sample += bandWeights[b] * Math.sin(2 * Math.PI * bandFreqs[b] * t + phases[b]);
    }
    // Mix with a touch of white noise for grit.
    sample += (Math.random() * 2 - 1) * 0.15;
    data[i] = sample * env * 0.04;
  }
  return buf;
}

interface DrumKit {
  buffers: AudioBuffer[];
  dispose: () => void;
}

function buildDrumKit(
  ctx: AudioContext,
  inst: Extract<InstrumentSpec, { type: "drumset" }>,
): DrumKit {
  const buffers = inst.drums.map((d) =>
    buildDrumBuffer(ctx, d.spectrum, d.filterEnvelope),
  );
  return { buffers, dispose: () => {} };
}

function scheduleDrumNote(
  ctx: AudioContext,
  kit: DrumKit,
  chain: AudioNode,
  drumIdx: number,
  start: number,
  volume: number,
): VoiceHandle {
  const buf = kit.buffers[drumIdx];
  if (!buf) return { stop: () => {} };
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(chain);
  src.start(start);
  return {
    stop(when: number) {
      try {
        src.stop(when);
      } catch {
        // already stopped
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Player

export class BeepBoxPlayer {
  private ctx: AudioContext;
  private song: ParsedSong;
  private master: GainNode;
  private chains: ChannelChain[] = [];
  private drumKits = new Map<number, DrumKit>();
  private playing = false;
  private scheduleTimer: number | null = null;
  private nextNoteTime = 0;
  private nextTick = 0;
  private activeVoices: Array<{ end: number; handle: VoiceHandle }> = [];

  constructor(ctx: AudioContext, song: ParsedSong, destination: AudioNode) {
    this.ctx = ctx;
    this.song = song;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(destination);

    for (let i = 0; i < song.channels.length; i++) {
      const ch = song.channels[i];
      const chain = buildChannelChain(ctx, ch.instrument, this.master);
      this.chains.push(chain);
      if (ch.instrument.type === "drumset") {
        this.drumKits.set(i, buildDrumKit(ctx, ch.instrument));
      }
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  fadeIn(seconds = 0.5): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(1, now + seconds);
  }

  fadeOut(seconds = 0.5): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + seconds);
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.nextTick = 0;
    this.fadeIn();
    this.schedule();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.scheduleTimer !== null) {
      window.clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    const cutoff = this.ctx.currentTime + 0.05;
    for (const v of this.activeVoices) v.handle.stop(cutoff);
    this.activeVoices = [];
    this.fadeOut();
  }

  dispose(): void {
    this.stop();
    for (const ch of this.chains) ch.dispose();
    for (const kit of this.drumKits.values()) kit.dispose();
    try {
      this.master.disconnect();
    } catch {
      // ignore
    }
  }

  private schedule(): void {
    if (!this.playing) return;
    const tickDur = 60 / (this.song.bpm * this.song.ticksPerBeat);
    const ticksPerBar = this.song.beatsPerBar * this.song.ticksPerBeat;
    const totalTicks = this.song.loopBars * ticksPerBar;
    const horizon = this.ctx.currentTime + LOOK_AHEAD_S;

    while (this.nextNoteTime < horizon) {
      const tickInLoop = this.nextTick % totalTicks;
      const bar = Math.floor(tickInLoop / ticksPerBar);
      const tickInBar = tickInLoop % ticksPerBar;

      // Visit every channel at this tick — start any note whose startTick
      // matches. Notes spanning multiple ticks are scheduled at start only.
      for (let ci = 0; ci < this.song.channels.length; ci++) {
        const ch = this.song.channels[ci];
        const seqIdx = ch.sequence[bar];
        if (seqIdx === undefined || seqIdx === 0) continue;
        const pattern = ch.patterns[seqIdx - 1];
        if (!pattern) continue;
        for (const note of pattern) {
          if (note.startTick !== tickInBar) continue;
          const startAt = this.nextNoteTime;
          const endAt = startAt + (note.endTick - note.startTick) * tickDur;
          this.startNote(ci, ch, note, startAt, endAt);
        }
      }

      this.nextNoteTime += tickDur;
      this.nextTick++;
    }

    // GC stopped voices.
    const now = this.ctx.currentTime;
    this.activeVoices = this.activeVoices.filter((v) => v.end > now - 0.2);

    this.scheduleTimer = window.setTimeout(
      () => this.schedule(),
      SCHEDULE_INTERVAL_MS,
    );
  }

  private startNote(
    channelIdx: number,
    ch: ChannelSpec,
    note: ParsedNote,
    start: number,
    end: number,
  ): void {
    const chain = this.chains[channelIdx].input;
    if (ch.type === "drum") {
      const kit = this.drumKits.get(channelIdx);
      if (!kit) return;
      const drumIdx = note.pitches[0] ?? 0;
      const handle = scheduleDrumNote(this.ctx, kit, chain, drumIdx, start, note.volume);
      this.activeVoices.push({ end, handle });
      return;
    }
    for (const p of note.pitches) {
      const freq = pitchToFreq(p);
      let handle: VoiceHandle;
      if (ch.instrument.type === "FM") {
        handle = scheduleFmNote(this.ctx, ch.instrument, chain, freq, start, end, note.volume);
      } else if (ch.instrument.type === "harmonics") {
        handle = scheduleHarmonicsNote(
          this.ctx,
          ch.instrument,
          chain,
          freq,
          start,
          end,
          note.volume,
        );
      } else {
        continue;
      }
      this.activeVoices.push({ end, handle });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: fetch + parse + construct in one call.

export async function loadAndCreate(
  url: string,
  destination?: AudioNode,
): Promise<BeepBoxPlayer | null> {
  const ctx = getSharedContext();
  if (!ctx) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const raw = (await res.json()) as BeepBoxJson;
  if (raw.format !== "BeepBox") {
    throw new Error(`not a BeepBox file: format=${raw.format}`);
  }
  const song = parseSong(raw);
  return new BeepBoxPlayer(ctx, song, destination ?? ctx.destination);
}
