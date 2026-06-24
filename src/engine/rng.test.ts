import { describe, it, expect } from 'vitest';
import { hashSeed, mixRand } from './rng';

describe('hashSeed', () => {
  it('is deterministic', () => {
    const s = 'level-1-seed';
    expect(hashSeed(s)).toBe(hashSeed(s));
  });

  it('produces different hashes for different strings', () => {
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('handles empty strings', () => {
    // FNV-1a 32-bit offset basis is 2166136261
    expect(hashSeed('')).toBe(2166136261);
  });

  it('returns a valid uint32', () => {
    const h = hashSeed('hello world');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('mixRand', () => {
  it('is deterministic with the same inputs', () => {
    const seed = hashSeed('test-seed');
    expect(mixRand(seed, 1, 2, 3)).toBe(mixRand(seed, 1, 2, 3));
  });

  it('produces different outputs for different sets of salts', () => {
    const seed = hashSeed('test-seed');
    const out1 = mixRand(seed, 1, 2, 3);
    const out2 = mixRand(seed, 1, 2, 4);
    const out3 = mixRand(seed, 10, 20);

    expect(out1).not.toBe(out2);
    expect(out1).not.toBe(out3);
    expect(out2).not.toBe(out3);
  });

  it('produces the same output for same salts but different order due to XOR commutative property', () => {
    // Note: since the current implementation does x ^= f(s) for each salt s,
    // it is commutative with respect to the salts array. This is an expected
    // behavior with XOR and simple independent salt mapping.
    const seed = hashSeed('test-seed');
    const out1 = mixRand(seed, 1, 2, 3);
    const out2 = mixRand(seed, 1, 3, 2);

    expect(out1).toBe(out2);
  });

  it('produces different outputs for different seeds with same salts', () => {
    const seed1 = hashSeed('seed1');
    const seed2 = hashSeed('seed2');
    expect(mixRand(seed1, 1, 2)).not.toBe(mixRand(seed2, 1, 2));
  });

  it('works with no salts', () => {
    const seed = hashSeed('no-salts');
    const out = mixRand(seed);
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThanOrEqual(0xffffffff);
  });

  it('works with a zero seedHash', () => {
    const out = mixRand(0, 10, 20);
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThanOrEqual(0xffffffff);
  });

  it('always returns a valid uint32', () => {
    const seed = hashSeed('uint32-test');
    for (let i = 0; i < 100; i++) {
      const out = mixRand(seed, i, i * 2);
      expect(Number.isInteger(out)).toBe(true);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
