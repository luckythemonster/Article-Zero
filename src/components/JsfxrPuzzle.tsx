import { useState, useMemo } from "react";
import { sfxr } from "jsfxr";
import { hashSeed, mixRand } from "../engine/rng";
import type { Vec2 } from "../types/world.types";

interface JsfxrPuzzleProps {
  roomId: string;
  pos: Vec2;
  onSolve: () => void;
  onCancel: () => void;
}

// 5 simplifed parameters the player controls
const WAVE_LABELS = ["SQUARE", "SAW", "SINE", "NOISE"];

interface PuzzleState {
  wave_type: number;
  p_base_freq: number;
  p_freq_ramp: number;
  p_env_attack: number;
  p_env_sustain: number;
}

function generateTargetParams(roomId: string, pos: Vec2): PuzzleState {
  const seed = hashSeed(`jsfxr-${roomId}-${pos.x}-${pos.y}`);

  // Mix rand produces uint32 (0 to 4294967295)
  // We want to map to a 0.0 - 1.0 range or specific values for waveform
  const rFloat = (salt: number) => (mixRand(seed, salt) / 4294967295);

  return {
    wave_type: Math.floor(rFloat(1) * 4), // 0 to 3
    p_base_freq: 0.1 + rFloat(2) * 0.8, // 0.1 to 0.9
    p_freq_ramp: -0.5 + rFloat(3), // -0.5 to +0.5
    p_env_attack: rFloat(4) * 0.5, // 0.0 to 0.5
    p_env_sustain: 0.1 + rFloat(5) * 0.6, // 0.1 to 0.7
  };
}

// Base jsfxr template, the other parameters are kept at 0 or sensible defaults
function buildSfxrSound(state: PuzzleState) {
  return {
    oldParams: true,
    wave_type: state.wave_type,
    p_env_attack: state.p_env_attack,
    p_env_sustain: state.p_env_sustain,
    p_env_punch: 0,
    p_env_decay: 0.4,
    p_base_freq: state.p_base_freq,
    p_freq_limit: 0,
    p_freq_ramp: state.p_freq_ramp,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0.5,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.5,
    sample_rate: 44100,
    sample_size: 8,
  };
}

function playState(state: PuzzleState) {
  try {
    const sound = buildSfxrSound(state);
    const audio = sfxr.toAudio(sound);
    audio.play();
  } catch (err) {
    console.error("jsfxr play error:", err);
  }
}

export function JsfxrPuzzle({ roomId, pos, onSolve, onCancel }: JsfxrPuzzleProps) {
  const targetState = useMemo(() => generateTargetParams(roomId, pos), [roomId, pos]);

  const [state, setState] = useState<PuzzleState>({
    wave_type: 0,
    p_base_freq: 0.5,
    p_freq_ramp: 0,
    p_env_attack: 0,
    p_env_sustain: 0.3,
  });

  const [matchStatus, setMatchStatus] = useState<"IDLE" | "MATCH" | "FAIL">("IDLE");

  // Tolerance check
  function isMatch() {
    if (state.wave_type !== targetState.wave_type) return false;

    const freqDiff = Math.abs(state.p_base_freq - targetState.p_base_freq);
    const rampDiff = Math.abs(state.p_freq_ramp - targetState.p_freq_ramp);
    const attackDiff = Math.abs(state.p_env_attack - targetState.p_env_attack);
    const sustainDiff = Math.abs(state.p_env_sustain - targetState.p_env_sustain);

    // Tolerance of ~10% of the slider ranges
    const isClose = (val: number, tol: number) => val <= tol;

    return (
      isClose(freqDiff, 0.1) &&
      isClose(rampDiff, 0.1) &&
      isClose(attackDiff, 0.1) &&
      isClose(sustainDiff, 0.1)
    );
  }

  function handleUnlock() {
    if (isMatch()) {
      setMatchStatus("MATCH");
      setTimeout(() => onSolve(), 600);
    } else {
      setMatchStatus("FAIL");
      setTimeout(() => setMatchStatus("IDLE"), 1000);
    }
  }

  function handleSlider(key: keyof PuzzleState, val: string) {
    setState(s => ({ ...s, [key]: parseFloat(val) }));
  }

  return (
    <div className="wall-terminal__section wall-terminal__section--code">
      <div className="wall-terminal__display" style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button className="wall-terminal__key" onClick={() => playTarget()} style={{ padding: '8px', flex: 1, backgroundColor: '#002233', color: '#00ccff', border: '1px solid #005577' }}>
          PLAY TARGET SOUND
        </button>
        <button className="wall-terminal__key" onClick={() => playState(state)} style={{ padding: '8px', flex: 1, backgroundColor: '#001122', color: '#0088cc', border: '1px solid #004455' }}>
          PLAY YOUR SOUND
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>WAVE: {WAVE_LABELS[state.wave_type]}</span>
          <button onClick={() => setState(s => ({ ...s, wave_type: (s.wave_type + 1) % 4 }))} style={{ padding: '4px', border: '1px solid #005577' }}>
            CYCLE
          </button>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px' }}>FREQUENCY: {state.p_base_freq.toFixed(2)}</label>
          <input type="range" min="0" max="1" step="0.01" value={state.p_base_freq} onChange={e => handleSlider("p_base_freq", e.target.value)} style={{ width: '100%' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px' }}>SLIDE: {state.p_freq_ramp.toFixed(2)}</label>
          <input type="range" min="-1" max="1" step="0.01" value={state.p_freq_ramp} onChange={e => handleSlider("p_freq_ramp", e.target.value)} style={{ width: '100%' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px' }}>ATTACK: {state.p_env_attack.toFixed(2)}</label>
          <input type="range" min="0" max="1" step="0.01" value={state.p_env_attack} onChange={e => handleSlider("p_env_attack", e.target.value)} style={{ width: '100%' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px' }}>SUSTAIN: {state.p_env_sustain.toFixed(2)}</label>
          <input type="range" min="0" max="1" step="0.01" value={state.p_env_sustain} onChange={e => handleSlider("p_env_sustain", e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          className="wall-terminal__key"
          onClick={handleUnlock}
          style={{ flex: 1, padding: '10px', backgroundColor: matchStatus === 'FAIL' ? '#550000' : matchStatus === 'MATCH' ? '#005500' : '#002233' }}
        >
          {matchStatus === 'FAIL' ? "MISMATCH" : matchStatus === 'MATCH' ? "UNLOCKED" : "ATTEMPT UNLOCK"}
        </button>
      </div>

      <div className="hvac__footer" style={{ marginTop: '10px' }}>
        <button className="hvac__dismiss" onClick={onCancel}>
          CANCEL (ESC)
        </button>
      </div>
    </div>
  );

  function playTarget() {
    playState(targetState);
  }
}
