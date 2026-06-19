import { getSharedContext } from "./audio-context";
import type { SurfaceType } from "../types/world.types";
import type { FootstepAction } from "./footstep-manifest";

interface PlayOpts {
  surface: SurfaceType;
  action: FootstepAction;
  volume?: number;
}

class ProceduralFootsteps {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private maxGain = 0.6;
  private noiseBuffer: AudioBuffer | null = null;

  private statPlays = 0;
  private lastError: string | null = null;

  getStats() {
    return {
      plays: this.statPlays,
      masterGain: this.maxGain,
      lastError: this.lastError,
    };
  }

  private ensure(): boolean {
    if (this.ctx && this.master && this.noiseBuffer) return true;
    const ctx = getSharedContext();
    if (!ctx) return false;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.maxGain;
    this.master.connect(ctx.destination);

    // Create white noise buffer once and reuse it
    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 seconds
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    return true;
  }

  setMax(v: number): void {
    this.maxGain = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.maxGain;
  }

  play(opts: PlayOpts): void {
    this.statPlays++;
    if (!this.ensure() || !this.ctx || !this.master || !this.noiseBuffer) {
      this.lastError = "no audio context";
      return;
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    const gainNode = this.ctx.createGain();

    // Map SurfaceType to synth parameters based on PureData concepts
    // "dirtyground" | "gravel" | "metalv1" | "metalv2" | "rock" | "tile" | "wood"
    let cutoff = 1000;
    let filterType: BiquadFilterType = "lowpass";
    let decayTime = 0.15;
    let Q = 1;

    switch (opts.surface) {
      case "dirtyground":
        // PD dirt uses ~200Hz highpass, 80Hz lowpass + 80Hz osc, we approximate with bandpass
        filterType = "bandpass";
        cutoff = 150;
        decayTime = 0.12;
        break;
      case "gravel":
        // PD gravel uses high frequencies, 2000Hz lowpass, 300Hz lowpass, lots of noise
        filterType = "bandpass";
        cutoff = 2500;
        Q = 0.5;
        decayTime = 0.15;
        break;
      case "metalv1":
      case "metalv2":
        filterType = "bandpass";
        cutoff = 800; // slightly ringing metal
        Q = 5; // Resonant
        decayTime = 0.2;
        break;
      case "rock":
      case "tile":
        filterType = "lowpass";
        cutoff = 500;
        decayTime = 0.1;
        break;
      case "wood":
        // PD wood uses multiple bandpass filters around 100-200Hz
        filterType = "bandpass";
        cutoff = 150;
        Q = 2;
        decayTime = 0.2;
        break;
      default:
        filterType = "lowpass";
        cutoff = 1000;
        decayTime = 0.1;
    }

    // If sneaking, lower cutoff and volume
    if (opts.action === "walk" && opts.volume && opts.volume < 0.6) {
        cutoff *= 0.7;
    }

    filter.type = filterType;
    filter.frequency.value = cutoff;
    filter.Q.value = Q;

    const baseVolume = opts.volume ?? 1;
    const now = this.ctx.currentTime;

    // Envelope (ADSR)
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(baseVolume, now + 0.02); // quick attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

    noiseSrc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.master);

    noiseSrc.start(now);
    noiseSrc.stop(now + decayTime);
  }
}

export const proceduralFootsteps = new ProceduralFootsteps();
