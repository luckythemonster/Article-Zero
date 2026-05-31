// Deterministic PRNG helpers. The engine forbids global Math.random so any
// "random" behaviour must derive from stable inputs — saved games and replays
// have to reproduce the same rolls. Callers hash a string seed once with
// hashSeed() then draw uint32s via mixRand() with integer salts.

/** FNV-1a 32-bit hash of a string seed. */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** xorshift32 mix of a seed hash plus integer salts. Returns uint32. */
export function mixRand(seedHash: number, ...salts: number[]): number {
  let x = seedHash >>> 0;
  for (const s of salts) x ^= Math.imul(s + 1, 2654435761);
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;  x >>>= 0;
  return x >>> 0;
}
