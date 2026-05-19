// jsfxr-compatible one-shot synth. Renders a parameter set (the format
// produced by sfxr / jsfxr web tools, "oldParams: true" dialect) into a
// mono Float32 sample buffer. We inline the algorithm rather than pulling
// in a dependency for the same reasons BeepBox.ts is inlined: the engine
// is small, stable, and easier to debug than a black box.
//
// Reference: https://github.com/loov/jsfxr (MIT) — algorithm ported and
// adapted to TypeScript. Parameters preserve the original naming so the
// jsfxr web tool's exports drop in unchanged.
//
// Only the "oldParams" dialect is supported (every def in our staging
// file is "oldParams: true"). Square-wave duty-cycle / vibrato / filters
// / phase modulation / arpeggio are all included.
//
// Returned buffers are mono at 44100 Hz so a single AudioContext can play
// them through any number of BufferSource voices.

export interface JsfxrParams {
  oldParams?: boolean;
  wave_type: number; // 0 square, 1 sawtooth, 2 sine, 3 noise
  p_env_attack: number;
  p_env_sustain: number;
  p_env_punch: number;
  p_env_decay: number;
  p_base_freq: number;
  p_freq_limit: number;
  p_freq_ramp: number;
  p_freq_dramp: number;
  p_vib_strength: number;
  p_vib_speed: number;
  p_arp_mod: number;
  p_arp_speed: number;
  p_duty: number;
  p_duty_ramp: number;
  p_repeat_speed: number;
  p_pha_offset: number;
  p_pha_ramp: number;
  p_lpf_freq: number;
  p_lpf_ramp: number;
  p_lpf_resonance: number;
  p_hpf_freq: number;
  p_hpf_ramp: number;
  sound_vol: number;
  sample_rate: number;
  sample_size: number;
  p_vib_delay?: number | null;
}

const TWO_PI = Math.PI * 2;

export function renderJsfxr(params: JsfxrParams): Float32Array {
  // Envelope (samples per phase).
  const envAttack = Math.floor(params.p_env_attack ** 2 * 100000);
  const envSustain = Math.floor(params.p_env_sustain ** 2 * 100000);
  const envDecay = Math.floor(params.p_env_decay ** 2 * 100000);
  const envPunch = params.p_env_punch;

  // Frequency.
  let fperiod = 100 / (params.p_base_freq * params.p_base_freq + 0.001);
  const fmaxperiod = 100 / (params.p_freq_limit * params.p_freq_limit + 0.001);
  let fslide = 1 - params.p_freq_ramp ** 3 * 0.01;
  const fdslide = -(params.p_freq_dramp ** 3) * 0.000001;

  // Square duty.
  let squareDuty = 0.5 - params.p_duty * 0.5;
  const squareSlide = -params.p_duty_ramp * 0.00005;

  // Arpeggio.
  let arpMod: number;
  if (params.p_arp_mod >= 0) arpMod = 1 - params.p_arp_mod ** 2 * 0.9;
  else arpMod = 1 + params.p_arp_mod ** 2 * 10;
  let arpTime = 0;
  let arpLimit = Math.floor((1 - params.p_arp_speed) ** 2 * 20000 + 32);
  if (params.p_arp_speed === 1) arpLimit = 0;

  // Filters.
  let fltp = 0;
  let fltdp = 0;
  let fltw = params.p_lpf_freq ** 3 * 0.1;
  const fltw_d = 1 + params.p_lpf_ramp * 0.0001;
  let fltdmp = 5 / (1 + params.p_lpf_resonance ** 2 * 20) * (0.01 + fltw);
  if (fltdmp > 0.8) fltdmp = 0.8;
  let flthp = params.p_hpf_freq ** 2 * 0.1;
  const flthp_d = 1 + params.p_hpf_ramp * 0.0003;

  // Vibrato.
  let vibPhase = 0;
  const vibSpeed = params.p_vib_speed ** 2 * 0.01;
  const vibAmp = params.p_vib_strength * 0.5;

  // Phaser.
  const phaserBuffer = new Float32Array(1024);
  let phaserIPos = 0;
  let fphase = params.p_pha_offset ** 2 * 1020;
  if (params.p_pha_offset < 0) fphase = -fphase;
  const fdphase = params.p_pha_ramp ** 2 * (params.p_pha_ramp < 0 ? -1 : 1);
  let iphase = Math.abs(Math.floor(fphase));

  // Repeat / re-trigger.
  let repTime = 0;
  let repLimit = Math.floor((1 - params.p_repeat_speed) ** 2 * 20000 + 32);
  if (params.p_repeat_speed === 0) repLimit = 0;

  // Noise table.
  const noiseBuffer = new Float32Array(32);
  for (let i = 0; i < 32; i++) noiseBuffer[i] = Math.random() * 2 - 1;

  // Per-cycle state we may reset on repeat.
  let envStage = 0;
  let envTime = 0;
  let envVol = 0;
  let phase = 0;
  let period = Math.floor(fperiod);
  let fperiodLive = fperiod;
  let fslideLive = fslide;
  let squareDutyLive = squareDuty;
  let arpModLive = arpMod;

  // Output. Cap render at ~10 seconds of mono @ 44100 Hz to keep memory
  // bounded for pathological parameter sets.
  const maxSamples = 44100 * 10;
  const out = new Float32Array(maxSamples);
  let writeIdx = 0;
  const mainVol = 0.05;
  const soundVol = params.sound_vol;

  for (let s = 0; s < maxSamples; s++) {
    // Repeat.
    repTime++;
    if (repLimit !== 0 && repTime >= repLimit) {
      repTime = 0;
      fperiodLive = fperiod;
      fslideLive = fslide;
      squareDutyLive = squareDuty;
      arpTime = 0;
      arpModLive = arpMod;
    }

    // Arpeggio.
    arpTime++;
    if (arpLimit !== 0 && arpTime >= arpLimit) {
      arpLimit = 0;
      fperiodLive *= arpModLive;
    }

    // Frequency slide.
    fslideLive += fdslide;
    fperiodLive *= fslideLive;
    if (fperiodLive > fmaxperiod) {
      fperiodLive = fmaxperiod;
      if (params.p_freq_limit > 0) break;
    }

    // Vibrato.
    let rfperiod = fperiodLive;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = fperiodLive * (1 + Math.sin(vibPhase) * vibAmp);
    }
    period = Math.floor(rfperiod);
    if (period < 8) period = 8;

    squareDutyLive += squareSlide;
    if (squareDutyLive < 0) squareDutyLive = 0;
    if (squareDutyLive > 0.5) squareDutyLive = 0.5;

    // Envelope.
    envTime++;
    if (envStage === 0 && envTime >= envAttack) {
      envStage = 1;
      envTime = 0;
    }
    if (envStage === 1 && envTime >= envSustain) {
      envStage = 2;
      envTime = 0;
    }
    if (envStage === 2 && envTime >= envDecay) {
      // Done.
      break;
    }
    if (envStage === 0) envVol = envAttack === 0 ? 0 : envTime / envAttack;
    else if (envStage === 1) envVol = 1 + (1 - envTime / envSustain) ** 1 * 2 * envPunch;
    else envVol = 1 - envTime / envDecay;

    // Phaser.
    fphase += fdphase;
    iphase = Math.abs(Math.floor(fphase));
    if (iphase > 1023) iphase = 1023;

    // High-pass coefficient slide.
    if (flthp_d !== 0) {
      flthp *= flthp_d;
      if (flthp < 0.00001) flthp = 0.00001;
      if (flthp > 0.1) flthp = 0.1;
    }

    let ssample = 0;
    // 8x oversampling.
    for (let si = 0; si < 8; si++) {
      let sample = 0;
      phase++;
      if (phase >= period) {
        phase = phase % period;
        if (params.wave_type === 3) {
          for (let n = 0; n < 32; n++) noiseBuffer[n] = Math.random() * 2 - 1;
        }
      }
      const fp = phase / period;
      switch (params.wave_type) {
        case 0:
          sample = fp < squareDutyLive ? 0.5 : -0.5;
          break;
        case 1:
          sample = 1 - fp * 2;
          break;
        case 2:
          sample = Math.sin(fp * TWO_PI);
          break;
        case 3:
          sample = noiseBuffer[Math.floor((phase / period) * 32)] ?? 0;
          break;
      }

      // Low-pass.
      const pp = fltp;
      fltw *= fltw_d;
      if (fltw < 0) fltw = 0;
      if (fltw > 0.1) fltw = 0.1;
      if (params.p_lpf_freq !== 1) {
        fltdp += (sample - fltp) * fltw;
        fltdp -= fltdp * fltdmp;
      } else {
        fltp = sample;
        fltdp = 0;
      }
      fltp += fltdp;

      // High-pass.
      let fltphp = fltp - pp;
      fltphp -= fltphp * flthp;
      sample = fltphp;

      // Phaser.
      phaserBuffer[phaserIPos & 1023] = sample;
      sample += phaserBuffer[(phaserIPos - iphase + 1024) & 1023] ?? 0;
      phaserIPos = (phaserIPos + 1) & 1023;

      ssample += sample;
    }
    ssample = (ssample / 8) * mainVol * envVol * soundVol;
    if (ssample > 1) ssample = 1;
    if (ssample < -1) ssample = -1;
    out[writeIdx++] = ssample;
  }

  return out.subarray(0, writeIdx);
}

/** Parse the plaintext jsfxr dump format we ship in
 *  `unmounted assets/added by Lucky/sounds`. Each block is preceded by
 *  a name line, followed by a JSON object spanning multiple lines. The
 *  FORMAT preamble (whose name placeholder is `[sound name]`) is
 *  skipped because the bracketed line is filtered out. Returns name →
 *  params. */
export function parseJsfxrDump(text: string): Record<string, JsfxrParams> {
  const out: Record<string, JsfxrParams> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    // Scan forward to the next opening `{` line. The most recent plain-
    // text line (not FORMAT, not `[…]`, not `}`, not blank) becomes the
    // name we'll attach the block to. If there is none, the block is
    // skipped (this handles the FORMAT preamble cleanly).
    let candidate: string | null = null;
    while (i < lines.length) {
      const t = (lines[i] ?? "").trim();
      if (t === "{") break;
      if (t && !/^format:$/i.test(t) && t !== "}" && !t.startsWith("[")) {
        candidate = t;
      }
      i++;
    }
    if (i >= lines.length) break;
    const buf: string[] = ["{"];
    i++;
    let depth = 1;
    while (i < lines.length && depth > 0) {
      const l = lines[i] ?? "";
      for (const ch of l) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      buf.push(l);
      i++;
    }
    if (!candidate) continue;
    try {
      out[candidate] = JSON.parse(buf.join("\n")) as JsfxrParams;
    } catch {
      // Skip malformed blocks rather than failing the whole parse.
    }
  }
  return out;
}

/** Convenience: parse a dump and pre-render every sound to an AudioBuffer
 *  on the provided context. Useful for the SFX runtime's startup path. */
export function renderAll(
  ctx: AudioContext,
  defs: Record<string, JsfxrParams>,
): Record<string, AudioBuffer> {
  const out: Record<string, AudioBuffer> = {};
  for (const [name, params] of Object.entries(defs)) {
    const samples = renderJsfxr(params);
    const buf = ctx.createBuffer(1, Math.max(1, samples.length), 44100);
    buf.getChannelData(0).set(samples);
    out[name] = buf;
  }
  return out;
}
