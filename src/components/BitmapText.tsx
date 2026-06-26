import { useState, useEffect } from "react";

export interface BitmapFont {
  info: {
    face: string;
    size: number;
    bold: number;
    italic: number;
    charset: string;
    unicode: number;
    stretchH: number;
    smooth: number;
    aa: number;
    padding: [number, number, number, number];
    spacing: [number, number];
    outline: number;
  };
  common: {
    lineHeight: number;
    base: number;
    scaleW: number;
    scaleH: number;
    pages: number;
    packed: number;
    alphaChnl: number;
    redChnl: number;
    greenChnl: number;
    blueChnl: number;
  };
  pages: { id: number; file: string }[];
  chars: Record<string, {
    x: number;
    y: number;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    page: number;
    chnl: number;
  }>;
  kernings: Record<string, number>;
}

export async function loadFntFile(url: string): Promise<BitmapFont> {
  const response = await fetch(url);
  const text = await response.text();
  const font: BitmapFont = {
    info: {} as any,
    common: {} as any,
    pages: [],
    chars: {},
    kernings: {},
  };

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;

    // Simple key-value parser for angelcode fnt
    // Example: char id=32 x=0 y=0 width=0 height=0 xoffset=0 yoffset=53 xadvance=26 page=0 chnl=15
    const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (!parts) continue;
    const type = parts[0];

    const props: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf('=');
      if (eq > 0) {
        props[parts[i].substring(0, eq)] = parts[i].substring(eq + 1).replace(/(^"|"$)/g, '');
      }
    }

    if (type === 'char') {
      font.chars[String.fromCharCode(parseInt(props.id, 10))] = {
        x: parseInt(props.x, 10),
        y: parseInt(props.y, 10),
        width: parseInt(props.width, 10),
        height: parseInt(props.height, 10),
        xoffset: parseInt(props.xoffset, 10),
        yoffset: parseInt(props.yoffset, 10),
        xadvance: parseInt(props.xadvance, 10),
        page: parseInt(props.page, 10),
        chnl: parseInt(props.chnl, 10),
      };
    } else if (type === 'kerning') {
      const k1 = String.fromCharCode(parseInt(props.first, 10));
      const k2 = String.fromCharCode(parseInt(props.second, 10));
      font.kernings[`${k1}${k2}`] = parseInt(props.amount, 10);
    } else if (type === 'info') {
      font.info = {
        face: props.face,
        size: parseInt(props.size, 10),
        bold: parseInt(props.bold, 10),
        italic: parseInt(props.italic, 10),
        charset: props.charset,
        unicode: parseInt(props.unicode, 10),
        stretchH: parseInt(props.stretchH, 10),
        smooth: parseInt(props.smooth, 10),
        aa: parseInt(props.aa, 10),
        padding: props.padding.split(',').map(Number) as any,
        spacing: props.spacing.split(',').map(Number) as any,
        outline: parseInt(props.outline, 10)
      };
    } else if (type === 'common') {
      font.common = {
        lineHeight: parseInt(props.lineHeight, 10),
        base: parseInt(props.base, 10),
        scaleW: parseInt(props.scaleW, 10),
        scaleH: parseInt(props.scaleH, 10),
        pages: parseInt(props.pages, 10),
        packed: parseInt(props.packed, 10),
        alphaChnl: parseInt(props.alphaChnl, 10),
        redChnl: parseInt(props.redChnl, 10),
        greenChnl: parseInt(props.greenChnl, 10),
        blueChnl: parseInt(props.blueChnl, 10)
      };
    } else if (type === 'page') {
      font.pages.push({
        id: parseInt(props.id, 10),
        file: props.file
      });
    }
  }

  return font;
}

export async function loadXmlFile(url: string): Promise<BitmapFont> {
  const response = await fetch(url);
  const text = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  const font: BitmapFont = {
    info: {} as any,
    common: {} as any,
    pages: [],
    chars: {},
    kernings: {},
  };

  const infoEl = xmlDoc.getElementsByTagName('info')[0];
  if (infoEl) {
    font.info.size = parseInt(infoEl.getAttribute('size') || '0', 10);
    font.info.face = infoEl.getAttribute('face') || '';
  }

  const commonEl = xmlDoc.getElementsByTagName('common')[0];
  if (commonEl) {
    font.common.lineHeight = parseInt(commonEl.getAttribute('lineHeight') || '0', 10);
    font.common.base = parseInt(commonEl.getAttribute('base') || '0', 10);
    font.common.scaleW = parseInt(commonEl.getAttribute('scaleW') || '0', 10);
    font.common.scaleH = parseInt(commonEl.getAttribute('scaleH') || '0', 10);
  }

  const pageEls = xmlDoc.getElementsByTagName('page');
  for (let i = 0; i < pageEls.length; i++) {
    font.pages.push({
      id: parseInt(pageEls[i].getAttribute('id') || '0', 10),
      file: pageEls[i].getAttribute('file') || ''
    });
  }

  const charEls = xmlDoc.getElementsByTagName('char');
  for (let i = 0; i < charEls.length; i++) {
    const el = charEls[i];
    const id = parseInt(el.getAttribute('id') || '0', 10);
    font.chars[String.fromCharCode(id)] = {
      x: parseInt(el.getAttribute('x') || '0', 10),
      y: parseInt(el.getAttribute('y') || '0', 10),
      width: parseInt(el.getAttribute('width') || '0', 10),
      height: parseInt(el.getAttribute('height') || '0', 10),
      xoffset: parseInt(el.getAttribute('xoffset') || '0', 10),
      yoffset: parseInt(el.getAttribute('yoffset') || '0', 10),
      xadvance: parseInt(el.getAttribute('xadvance') || '0', 10),
      page: parseInt(el.getAttribute('page') || '0', 10),
      chnl: parseInt(el.getAttribute('chnl') || '15', 10)
    };
  }

  const kerningEls = xmlDoc.getElementsByTagName('kerning');
  for (let i = 0; i < kerningEls.length; i++) {
    const el = kerningEls[i];
    const first = parseInt(el.getAttribute('first') || '0', 10);
    const second = parseInt(el.getAttribute('second') || '0', 10);
    const amount = parseInt(el.getAttribute('amount') || '0', 10);
    font.kernings[`${String.fromCharCode(first)}${String.fromCharCode(second)}`] = amount;
  }

  return font;
}

const fontCache: Record<string, BitmapFont> = {};

interface BitmapTextProps {
  text: string;
  fontUrl: string;
  imageUrl: string;
  scale?: number;
  color?: string;
  className?: string;
}

export function BitmapText({ text, fontUrl, imageUrl, scale = 1, color, className }: BitmapTextProps) {
  const [font, setFont] = useState<BitmapFont | null>(null);

  useEffect(() => {
    if (fontCache[fontUrl]) {
      setFont(fontCache[fontUrl]);
      return;
    }

    const load = fontUrl.endsWith('.xml') ? loadXmlFile : loadFntFile;
    load(fontUrl).then(f => {
      fontCache[fontUrl] = f;
      setFont(f);
    });
  }, [fontUrl]);

  if (!font) return null; // loading

  const chars = text.split('');
  const charsData = [];
  let currentX = 0;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const charData = font.chars[c];
    if (!charData) {
      if (c === ' ') {
         // fallback space
         const spaceAdvance = font.chars['A'] ? font.chars['A'].xadvance : font.info.size / 2;
         currentX += spaceAdvance * scale;
      }
      continue;
    }

    let kerning = 0;
    if (i < chars.length - 1) {
      const nextC = chars[i + 1];
      const kernKey = `${c}${nextC}`;
      if (font.kernings[kernKey]) {
        kerning = font.kernings[kernKey];
      }
    }

    charsData.push({
      char: c,
      data: charData,
      renderX: currentX + charData.xoffset * scale,
      renderY: charData.yoffset * scale
    });

    currentX += (charData.xadvance + kerning) * scale;
  }

  // Calculate bounding box
  const totalWidth = currentX;
  const totalHeight = font.common.lineHeight * scale;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: `${totalWidth}px`,
        height: `${totalHeight}px`,
        display: 'inline-block'
      }}
    >
      {charsData.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${c.renderX}px`,
            top: `${c.renderY}px`,
            width: `${c.data.width * scale}px`,
            height: `${c.data.height * scale}px`,
            backgroundImage: `url('${imageUrl}')`,
            backgroundPosition: `-${c.data.x * scale}px -${c.data.y * scale}px`,
            backgroundSize: `${font.common.scaleW * scale}px ${font.common.scaleH * scale}px`,
            backgroundRepeat: 'no-repeat',
            ...(color && color !== 'white' ? { filter: `drop-shadow(0px 1000px 0 ${color})`, transform: 'translateY(-1000px)' } : {})
          }}
        />
      ))}

    </div>
  );
}
