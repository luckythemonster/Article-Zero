// Shared helper for naming Phaser animation keys derived from
// Ed/Moose multi-keyframe TileDefs. BootScene registers them; GameScene
// plays them. Keep the naming scheme in one place.

export type MooseAnimDirection = "open" | "close";

export function mooseAnimKey(
  textureKey: string,
  tileDefHandle: number,
  direction: MooseAnimDirection,
): string {
  return `${textureKey}_anim_${tileDefHandle}_${direction}`;
}
