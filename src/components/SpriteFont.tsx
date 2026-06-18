import { useMemo } from "react";

export interface FontChar {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

export interface FontData {
  info: { face: string; size: number };
  common: { lineHeight: number; base: number; scaleW: number; scaleH: number };
  chars: FontChar[];
}

interface SpriteFontProps {
  text: string;
  fontData: FontData | null;
  textureUrl: string;
  className?: string;
  letterSpacing?: number;
}

export default function SpriteFont({ text, fontData, textureUrl, className = "", letterSpacing = 0 }: SpriteFontProps) {
  const charMap = useMemo(() => {
    if (!fontData) return new Map<number, FontChar>();
    return new Map(fontData.chars.map((c) => [c.id, c]));
  }, [fontData]);

  if (!fontData || text.length === 0) {
    return <div className={`sprite-font ${className}`} aria-hidden="true" />;
  }

  const chars = Array.from(text);
  let currentX = 0;

  const charElements = chars.map((char, index) => {
    const code = char.charCodeAt(0);
    const glyph = charMap.get(code);

    if (!glyph) {
      // Space or missing character fallback
      const spaceWidth = charMap.get(32)?.xadvance || fontData.info.size / 2;
      currentX += spaceWidth + letterSpacing;
      return null;
    }

    const xPos = currentX + glyph.xoffset;
    const yPos = glyph.yoffset;

    currentX += glyph.xadvance + letterSpacing;

    return (
      <div
        key={`${index}-${char}`}
        style={{
          position: "absolute",
          left: `${xPos}px`,
          top: `${yPos}px`,
          width: `${glyph.width}px`,
          height: `${glyph.height}px`,
          backgroundImage: `url(${textureUrl})`,
          backgroundPosition: `-${glyph.x}px -${glyph.y}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    );
  });

  return (
    <div
      className={`sprite-font ${className}`}
      style={{
        position: "relative",
        height: `${fontData.common.lineHeight}px`,
        width: `${currentX}px`, // Total width calculated
        transformOrigin: "top left",
      }}
      aria-hidden="true"
    >
      {charElements}
    </div>
  );
}
