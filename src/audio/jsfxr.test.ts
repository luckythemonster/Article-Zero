import { describe, it, expect } from 'vitest';
import { parseJsfxrDump } from './jsfxr';

describe('jsfxr', () => {
  describe('parseJsfxrDump', () => {
    it('handles JSON parse errors gracefully by skipping malformed blocks', () => {
      const dump = `
good_sound
{
  "wave_type": 0,
  "p_env_attack": 0,
  "p_env_sustain": 0.3,
  "p_env_punch": 0,
  "p_env_decay": 0.4
}

bad_sound
{
  "wave_type": 0,
  "p_env_attack": 0,
  "p_env_sustain": 0.3,
  "p_env_punch": 0,
  "p_env_decay": 0.4,
  MALFORMED JSON HERE
}

another_good_sound
{
  "wave_type": 1,
  "p_env_attack": 0.1,
  "p_env_sustain": 0.1,
  "p_env_punch": 0.1,
  "p_env_decay": 0.1
}
`;

      const result = parseJsfxrDump(dump);

      expect(result).toHaveProperty('good_sound');
      expect(result.good_sound.wave_type).toBe(0);

      expect(result).not.toHaveProperty('bad_sound');

      expect(result).toHaveProperty('another_good_sound');
      expect(result.another_good_sound.wave_type).toBe(1);
    });

    it('handles dump with only malformed blocks', () => {
      const dump = `
bad_sound
{
  INVALID
}
`;
      const result = parseJsfxrDump(dump);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('parses valid sounds correctly', () => {
      const dump = `
test_sound
{
  "wave_type": 2,
  "p_env_attack": 0.5,
  "p_env_sustain": 0.5,
  "p_env_punch": 0.5,
  "p_env_decay": 0.5,
  "p_base_freq": 0.5,
  "p_freq_limit": 0.5,
  "p_freq_ramp": 0.5,
  "p_freq_dramp": 0.5,
  "p_vib_strength": 0.5,
  "p_vib_speed": 0.5,
  "p_arp_mod": 0.5,
  "p_arp_speed": 0.5,
  "p_duty": 0.5,
  "p_duty_ramp": 0.5,
  "p_repeat_speed": 0.5,
  "p_pha_offset": 0.5,
  "p_pha_ramp": 0.5,
  "p_lpf_freq": 0.5,
  "p_lpf_ramp": 0.5,
  "p_lpf_resonance": 0.5,
  "p_hpf_freq": 0.5,
  "p_hpf_ramp": 0.5,
  "sound_vol": 0.5,
  "sample_rate": 44100,
  "sample_size": 8
}
`;
      const result = parseJsfxrDump(dump);
      expect(result).toHaveProperty('test_sound');
      expect(result.test_sound.wave_type).toBe(2);
      expect(result.test_sound.sample_rate).toBe(44100);
    });
  });
});
