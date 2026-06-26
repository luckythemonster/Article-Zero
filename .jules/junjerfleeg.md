## 2024-06-26 - Pre-computed math lookup table
**Learning:** `Math.cos` and `Math.sin` are relatively slow when called repeatedly in hot loops. For calculations with fixed numbers of angles (like `computeCone` in `VisionCone.ts`), we can reduce time by computing the angle vectors once and caching them.
**Action:** Always consider lookup tables for expensive calculations that have fixed domain space, specifically in hot inner loops of game engines or renderers.
