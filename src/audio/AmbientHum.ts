// AmbientHum — 37 Hz drone + 74 Hz harmonic. Intensity scales with substrate
// resonance. Started on first user gesture (autoplay policies). Subliminal by
// design; the slider in Settings is a *cap*, not a baseline.

const PRIMARY_HZ = 37;
const HARMONIC_HZ = 74;
const LFO_HZ = 0.06;
const FILTER_HZ = 120;
const FILTER_Q = 0.4;
const BASE_GAIN = 0.1;

class AmbientHum {
  private gain: GainNode | null = null;
  private started = false;
  private maxGain = BASE_GAIN;

  start(): void {
    if (this.started) return;
    if (typeof window === "undefined") return;
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = W.AudioContext || W.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const out = ctx.createGain();
    out.gain.value = BASE_GAIN;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = FILTER_HZ;
    filter.Q.value = FILTER_Q;

    const primary = ctx.createOscillator();
    primary.type = "sine";
    primary.frequency.value = PRIMARY_HZ;

    const harmonic = ctx.createOscillator();
    harmonic.type = "sine";
    harmonic.frequency.value = HARMONIC_HZ;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = LFO_HZ;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = BASE_GAIN * 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(out.gain);

    primary.connect(filter);
    harmonic.connect(filter);
    filter.connect(out);
    out.connect(ctx.destination);

    primary.start();
    harmonic.start();
    lfo.start();

    this.gain = out;
    this.started = true;
  }

  setIntensity(resonance0to100: number): void {
    if (!this.gain) return;
    const factor = Math.min(1, Math.max(0, resonance0to100 / 100));
    const target = this.maxGain + factor * this.maxGain * 1.8;
    this.gain.gain.value = Math.min(target, this.maxGain * 2.8);
  }

  setMax(max: number): void {
    this.maxGain = Math.max(0, Math.min(1, max));
    if (this.gain) this.gain.gain.value = this.maxGain;
  }
}

export const ambientHum = new AmbientHum();
