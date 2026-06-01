#!/usr/bin/env node
// Slice the revised wall-terminal UI sheet
// (`art/ui/wall-terminal/source.png`) into individual sprites under
// `public/assets/ui/wall-terminal/`. One-off; rerun if the source changes.
//
// Slice coordinates were derived empirically by scanning alpha bands; see the
// plan file for the original sheet layout.

import { Jimp } from "jimp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "art", "ui", "wall-terminal", "source.png");
const OUT = path.resolve(__dirname, "..", "public", "assets", "ui", "wall-terminal");

const SLICES = [
  // Keypad atlases — 3 cols x 4 rows of keys. Crop the bbox; the natural
  // gaps stay so the same coordinates work for CSS background-position.
  { name: "keypad-amber.png", x: 440, y: 8, w: 204, h: 128 },
  { name: "keypad-red.png",   x: 702, y: 8, w: 204, h: 128 },

  // Arrow buttons. Left column = idle, right column = pressed.
  { name: "arrow-up-idle.png",      x: 315, y: 507, w: 30, h: 30 },
  { name: "arrow-up-pressed.png",   x: 429, y: 507, w: 30, h: 30 },
  { name: "arrow-down-idle.png",    x: 315, y: 586, w: 30, h: 30 },
  { name: "arrow-down-pressed.png", x: 429, y: 586, w: 30, h: 30 },

  // EMERGENCY badge states.
  { name: "emergency-lit.png",  x: 312, y: 670, w: 43, h: 16 },
  { name: "emergency-dim.png",  x: 312, y: 708, w: 43, h: 16 },

  // Reference: assembled panels (for `art/ui/wall-terminal/` only).
  { name: "ref-panel-keypad.png", x: 142, y: 170, w: 255, h: 249, ref: true },
  { name: "ref-panel-empty.png",  x: 6,   y: 547, w: 256, h: 249, ref: true },
  { name: "ref-panel-map.png",    x: 308, y: 791, w: 255, h: 249, ref: true },
];

const img = await Jimp.read(SRC);

for (const s of SLICES) {
  const clone = img.clone();
  clone.crop({ x: s.x, y: s.y, w: s.w, h: s.h });
  const dir = s.ref
    ? path.resolve(__dirname, "..", "art", "ui", "wall-terminal")
    : OUT;
  const file = path.join(dir, s.name);
  await clone.write(file);
  console.log("wrote", path.relative(path.resolve(__dirname, ".."), file));
}
