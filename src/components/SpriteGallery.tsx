// Sprite gallery overlay. Toggled by `G`. Renders every currently-mounted
// sprite — atlas frames (CHAR_ANIMS), Moose tileset frames + tile-anims, and
// the held items — so the team can visually inventory what's loaded vs what
// still sits in /unmounted assets/.
//
// Pure React/DOM: reads the atlas JSON + sheet PNGs directly via CSS
// background-position so no Phaser scene is required to render the tiles.

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebugStore } from "../state/useDebugStore";
import { CHAR_ANIMS, type CharAnim } from "../data/char-anims";
import { MOOSE_TILESETS } from "../data/tilesets/registry.generated";
import type { MooseTilesetEntry } from "../data/tilesets/types";
import { UNMOUNTED_FILES, type UnmountedFile } from "../data/unmounted.generated";

const ATLAS_PNG = "/assets/sprite_pack/chars-art.png";
const ATLAS_JSON = "/assets/sprite_pack/chars-art.json";

const ITEMS: { key: string; label: string; url: string }[] = [
  { key: "bypass_drive_north", label: "bypass_drive / north", url: "/assets/items/bypass_drive/north.png" },
  { key: "bypass_drive_east", label: "bypass_drive / east", url: "/assets/items/bypass_drive/east.png" },
  { key: "bypass_drive_south", label: "bypass_drive / south", url: "/assets/items/bypass_drive/south.png" },
  { key: "bypass_drive_west", label: "bypass_drive / west", url: "/assets/items/bypass_drive/west.png" },
];

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasJson {
  frames: Record<string, { frame: FrameRect }>;
}

let atlasPromise: Promise<Record<string, FrameRect>> | null = null;
export function loadAtlasFrames(): Promise<Record<string, FrameRect>> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = fetch(ATLAS_JSON)
    .then((r) => r.json() as Promise<AtlasJson>)
    .then((j) => {
      const out: Record<string, FrameRect> = {};
      for (const [k, v] of Object.entries(j.frames)) out[k] = v.frame;
      return out;
    })
    .catch((err) => {
      console.error("[SpriteGallery] failed to load atlas JSON", err);
      return {};
    });
  return atlasPromise;
}

export function _resetAtlasPromiseForTest() {
  atlasPromise = null;
}

const sheetSizeCache = new Map<string, Promise<{ w: number; h: number }>>();
function loadSheetSize(url: string): Promise<{ w: number; h: number }> {
  const cached = sheetSizeCache.get(url);
  if (cached) return cached;
  const p = new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
  sheetSizeCache.set(url, p);
  return p;
}

// ── SpriteTile: animated single tile rendered via background-position ────────

interface SpriteTileProps {
  sheetUrl: string;
  rects: FrameRect[];
  frameRate: number;
  displayScale?: number;
  label?: string;
}

function SpriteTile({ sheetUrl, rects, frameRate, displayScale = 1, label }: SpriteTileProps) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (rects.length <= 1) return;
    const interval = Math.max(16, Math.round(1000 / Math.max(1, frameRate)));
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % rects.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [rects.length, frameRate]);

  const rect = rects[Math.min(idx, rects.length - 1)];
  if (!rect) {
    return (
      <div style={{ fontSize: 10, color: "#ebd14a", padding: 4 }}>missing frame</div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div
        style={{
          width: rect.w * displayScale,
          height: rect.h * displayScale,
          backgroundColor: "#04070a",
          backgroundImage: `url(${sheetUrl})`,
          backgroundPosition: `-${rect.x * displayScale}px -${rect.y * displayScale}px`,
          backgroundRepeat: "no-repeat",
          backgroundSize:
            displayScale === 1 ? "auto" : `auto ${displayScale * 100}%`,
          imageRendering: "pixelated",
          border: "1px solid #1d2a30",
        }}
      />
      {label && (
        <div style={{ fontSize: 10, color: "#9bb1b6", maxWidth: rect.w * displayScale + 24, textAlign: "center", wordBreak: "break-word" }}>
          {label}
        </div>
      )}
    </div>
  );
}

// ── Character anims section ──────────────────────────────────────────────────

interface AtlasReady {
  frames: Record<string, FrameRect>;
}

function CharacterAnimTile({ atlas, anim }: { atlas: AtlasReady; anim: CharAnim }) {
  const rects = useMemo(() => {
    return anim.frames.map((f) => atlas.frames[f]).filter((r): r is FrameRect => Boolean(r));
  }, [atlas, anim]);
  const shortLabel = anim.key.split("_").slice(1).join("/");
  return (
    <SpriteTile
      sheetUrl={ATLAS_PNG}
      rects={rects}
      frameRate={anim.frameRate}
      label={shortLabel}
    />
  );
}

function CharacterSection({
  atlas,
  charId,
  anims,
}: {
  atlas: AtlasReady;
  charId: string;
  anims: CharAnim[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ borderTop: "1px solid #1d2a30" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "#0a1014",
          border: "none",
          color: "#6ad0a4",
          padding: "6px 10px",
          fontFamily: "inherit",
          fontSize: 12,
          letterSpacing: 1.1,
          cursor: "pointer",
        }}
      >
        [{open ? "−" : "+"}] {charId} <span style={{ color: "#9bb1b6" }}>· {anims.length} anims</span>
      </button>
      {open && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: 10,
            padding: "10px 10px 14px",
          }}
        >
          {anims.map((a) => (
            <CharacterAnimTile key={a.key} atlas={atlas} anim={a} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Tileset section ──────────────────────────────────────────────────────────

function rectForTilesetFrame(
  index: number,
  cols: number,
  t: MooseTilesetEntry,
): FrameRect {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: col * (t.frameWidth + t.spacing),
    y: row * (t.frameHeight + t.spacing),
    w: t.frameWidth,
    h: t.frameHeight,
  };
}

function TilesetSection({ t }: { t: MooseTilesetEntry }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [showAllFrames, setShowAllFrames] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSheetSize(t.path).then((s) => {
      if (alive) setSize(s);
    });
    return () => {
      alive = false;
    };
  }, [t.path]);

  const cols = size
    ? Math.max(1, Math.floor((size.w + t.spacing) / (t.frameWidth + t.spacing)))
    : 0;
  const rows = size
    ? Math.max(1, Math.floor((size.h + t.spacing) / (t.frameHeight + t.spacing)))
    : 0;
  const totalFrames = cols * rows;
  const tileAnims = t.tileAnims ?? [];

  return (
    <section style={{ borderTop: "1px solid #1d2a30" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "#0a1014",
          border: "none",
          color: "#6ad0a4",
          padding: "6px 10px",
          fontFamily: "inherit",
          fontSize: 12,
          letterSpacing: 1.1,
          cursor: "pointer",
        }}
      >
        [{open ? "−" : "+"}] tileset / {t.key}{" "}
        <span style={{ color: "#9bb1b6" }}>
          · {totalFrames || "?"} frames · {tileAnims.length} tileAnims
        </span>
      </button>
      {open && (
        <div style={{ padding: "10px 10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
          {tileAnims.length > 0 && (
            <div>
              <div style={{ color: "#9bb1b6", fontSize: 11, marginBottom: 6 }}>
                tile animations
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                  gap: 10,
                }}
              >
                {tileAnims.map((a) =>
                  cols > 0 ? (
                    <SpriteTile
                      key={a.handle}
                      sheetUrl={t.path}
                      rects={a.frames.map((idx) => rectForTilesetFrame(idx, cols, t))}
                      frameRate={a.frameRate}
                      displayScale={2}
                      label={a.label}
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}

          <div>
            <div
              style={{
                color: "#9bb1b6",
                fontSize: 11,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              all frames {cols > 0 ? `(${cols}×${rows} = ${totalFrames})` : ""}
              <button
                type="button"
                onClick={() => setShowAllFrames((v) => !v)}
                style={btnStyle}
              >
                [{showAllFrames ? "hide" : "show"}]
              </button>
            </div>
            {showAllFrames && cols > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, ${t.frameWidth * 2}px)`,
                  gap: 2,
                }}
              >
                {Array.from({ length: totalFrames }, (_, i) => (
                  <SpriteTile
                    key={i}
                    sheetUrl={t.path}
                    rects={[rectForTilesetFrame(i, cols, t)]}
                    frameRate={1}
                    displayScale={2}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Items section ────────────────────────────────────────────────────────────

function ItemsSection() {
  const [open, setOpen] = useState(true);
  return (
    <section style={{ borderTop: "1px solid #1d2a30" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "#0a1014",
          border: "none",
          color: "#6ad0a4",
          padding: "6px 10px",
          fontFamily: "inherit",
          fontSize: 12,
          letterSpacing: 1.1,
          cursor: "pointer",
        }}
      >
        [{open ? "−" : "+"}] items <span style={{ color: "#9bb1b6" }}>· {ITEMS.length}</span>
      </button>
      {open && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 10,
            padding: "10px 10px 14px",
          }}
        >
          {ITEMS.map((it) => (
            <div key={it.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <img
                src={it.url}
                alt={it.key}
                style={{
                  width: 64,
                  height: 64,
                  imageRendering: "pixelated",
                  border: "1px solid #1d2a30",
                  background: "#04070a",
                }}
              />
              <div style={{ fontSize: 10, color: "#9bb1b6", textAlign: "center" }}>{it.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Unmounted sidebar ────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / (1024 * 1024)).toFixed(1)}M`;
}

function UnmountedSidebar({ files }: { files: UnmountedFile[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, UnmountedFile[]>();
    for (const f of files) {
      const top = f.path.includes("/") ? f.path.split("/")[0] : "(root)";
      const arr = map.get(top) ?? [];
      arr.push(f);
      map.set(top, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid #1d2a30",
        overflowY: "auto",
        background: "#04070a",
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          color: "#ebd14a",
          letterSpacing: 1.1,
          borderBottom: "1px solid #1d2a30",
          position: "sticky",
          top: 0,
          background: "#0a1014",
        }}
      >
        UNMOUNTED · {files.length} files
      </div>
      <div style={{ fontSize: 11 }}>
        {grouped.map(([group, items]) => (
          <div key={group}>
            <div style={{ padding: "6px 10px", color: "#6ad0a4" }}>{group}/</div>
            {items.map((f) => (
              <div
                key={f.path}
                style={{
                  padding: "2px 10px 2px 20px",
                  color: "#9bb1b6",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                }}
                title={f.path}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.path.split("/").slice(1).join("/") || f.path}
                </span>
                <span style={{ color: "#5a6e74", flexShrink: 0 }}>{formatBytes(f.sizeBytes)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Shared button style ──────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  background: "#0a1014",
  border: "1px solid #1d2a30",
  color: "#6ad0a4",
  padding: "2px 8px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

// ── Root ─────────────────────────────────────────────────────────────────────

export default function SpriteGallery(): React.ReactElement | null {
  const visible = useDebugStore((s) => s.gallery);
  if (!visible) return null;
  return <SpriteGalleryBody />;
}

function SpriteGalleryBody(): React.ReactElement {
  const toggle = useDebugStore((s) => s.toggleGallery);
  const [atlas, setAtlas] = useState<AtlasReady | null>(null);
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadAtlasFrames().then((frames) => {
      if (alive) setAtlas({ frames });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Group character anims by the slug before the first underscore.
  const charGroups = useMemo(() => {
    const map = new Map<string, CharAnim[]>();
    for (const a of CHAR_ANIMS) {
      const id = a.key.split("_")[0];
      const arr = map.get(id) ?? [];
      arr.push(a);
      map.set(id, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, []);

  const needle = filter.trim().toLowerCase();
  const filteredCharGroups = useMemo(() => {
    if (!needle) return charGroups;
    return charGroups
      .map(([id, anims]) => {
        if (id.toLowerCase().includes(needle)) return [id, anims] as const;
        const matching = anims.filter((a) => a.key.toLowerCase().includes(needle));
        return [id, matching] as const;
      })
      .filter(([, anims]) => anims.length > 0);
  }, [charGroups, needle]);

  const filteredTilesets = useMemo(() => {
    if (!needle) return MOOSE_TILESETS;
    return MOOSE_TILESETS.filter(
      (t) =>
        t.key.toLowerCase().includes(needle) ||
        t.label.toLowerCase().includes(needle) ||
        (t.tileAnims ?? []).some((a) => a.label.toLowerCase().includes(needle)),
    );
  }, [needle]);

  const charCount = charGroups.length;
  const animCount = CHAR_ANIMS.length;
  const tilesetCount = MOOSE_TILESETS.length;
  const itemCount = ITEMS.length;
  const unmountedCount = UNMOUNTED_FILES.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(5,8,9,0.96)",
        color: "#9bb1b6",
        fontFamily: '"Berkeley Mono", "Courier New", monospace',
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #1d2a30",
          color: "#6ad0a4",
          letterSpacing: 1.2,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ flex: "1 1 auto" }}>
          SPRITE GALLERY · {charCount} chars · {animCount} anims · {tilesetCount} tilesets ·{" "}
          {itemCount} items · {unmountedCount} unmounted · [G] OR [X] TO CLOSE
        </span>
        <input
          ref={filterRef}
          type="text"
          placeholder="filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: "#0a1014",
            border: "1px solid #1d2a30",
            color: "#9bb1b6",
            padding: "2px 6px",
            fontFamily: "inherit",
            fontSize: 12,
            width: 200,
          }}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label="Close sprite gallery"
          className="debug-overlay__close"
        >
          [X]
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <main style={{ flex: 1, overflowY: "auto" }}>
          {!atlas ? (
            <div style={{ padding: 20, color: "#ebd14a" }}>loading atlas…</div>
          ) : (
            <>
              {filteredCharGroups.map(([id, anims]) => (
                <CharacterSection key={id} atlas={atlas} charId={id} anims={anims} />
              ))}
              {filteredTilesets.map((t) => (
                <TilesetSection key={t.key} t={t} />
              ))}
              {(!needle || "items bypass_drive".includes(needle)) && <ItemsSection />}
            </>
          )}
        </main>
        <UnmountedSidebar files={UNMOUNTED_FILES} />
      </div>
    </div>
  );
}
