// Music playback via the real BeepBox synth engine (npm `beepbox`).
//
// The song files in `public/audio/music/*.json` are `format: "BeepBox",
// version: 9` dumps — exactly what `Song.fromJsonObject` consumes — so the
// genuine synth renders the compositions as authored (picked-string voices,
// pitch bends, real envelope shapes, unison, every FM algorithm), rather than
// the approximation the previous hand-rolled player produced.
//
// The `Synth` owns its own AudioContext (separate from the shared context used
// by SFX/footsteps/ambient). Calling `play()` creates and resumes that context,
// so both call sites — TitleScreen (plays on a user gesture) and MusicBridge
// (plays mid-gameplay, after the page is already "warm") — satisfy the browser
// autoplay policy without extra plumbing.

import { Song, Synth } from "beepbox";

// Master music level (0..1). The synth has its own limiter, so this just sets
// where music sits underneath the sound effects. Tune by ear.
const MUSIC_VOLUME = 0.5;
const FADE_STEP_MS = 25;

export class BeepBoxPlayer {
  private synth: Synth;
  private fadeTimer: number | null = null;

  constructor(song: Song) {
    this.synth = new Synth(song);
    this.synth.loopRepeatCount = -1; // loop the song's loop region forever
    this.synth.volume = 0; // start silent; play() fades in
  }

  get isPlaying(): boolean {
    return this.synth.playing;
  }

  play(): void {
    if (this.synth.playing) {
      // Already running (e.g. play() during a fade-out) — just fade back in.
      this.fadeIn();
      return;
    }
    this.synth.snapToStart();
    this.synth.volume = 0;
    this.synth.play(); // creates + resumes the synth's own AudioContext
    this.fadeIn();
  }

  stop(): void {
    if (!this.synth.playing) return;
    this.fadeOut(0.4, () => {
      this.synth.pause();
    });
  }

  fadeIn(seconds = 0.5): void {
    this.rampVolume(MUSIC_VOLUME, seconds);
  }

  fadeOut(seconds = 0.5, onDone?: () => void): void {
    this.rampVolume(0, seconds, onDone);
  }

  dispose(): void {
    this.clearFade();
    try {
      this.synth.pause();
    } catch {
      // already stopped
    }
  }

  private clearFade(): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private rampVolume(target: number, seconds: number, onDone?: () => void): void {
    this.clearFade();
    const start = this.synth.volume;
    const steps = Math.max(1, Math.round((seconds * 1000) / FADE_STEP_MS));
    let i = 0;
    this.fadeTimer = window.setInterval(() => {
      i++;
      this.synth.volume = start + (target - start) * (i / steps);
      if (i >= steps) {
        this.synth.volume = target;
        this.clearFade();
        onDone?.();
      }
    }, FADE_STEP_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: fetch + parse + construct in one call.

export async function loadAndCreate(url: string): Promise<BeepBoxPlayer | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const json = (await res.json()) as { format?: string };
  if (json.format !== "BeepBox") {
    throw new Error(`not a BeepBox file: format=${json.format}`);
  }
  const song = new Song();
  song.fromJsonObject(json);
  return new BeepBoxPlayer(song);
}
