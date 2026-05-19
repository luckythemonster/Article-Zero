// Character animation registry. All entries live in char-anims.generated.ts,
// produced by `npm run art` from sources under `art/`. Frames reference the
// `chars-art` atlas registered in BootScene.

import { GENERATED_ANIMS } from "./char-anims.generated";

export interface CharAnim {
  key: string;
  frameRate: number;
  repeat: number;
  frames: string[];
  /** Atlas key registered in BootScene. Defaults to "chars-art". */
  texture?: string;
}

export const CHAR_ANIMS: CharAnim[] = GENERATED_ANIMS;
