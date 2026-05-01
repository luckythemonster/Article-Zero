// MobileHudDrawer — bottom-sheet container that wraps the right-rail SidePanel
// content when the touch UI is active. Opens via the MENU touch button;
// closes via tap-outside or the close button.

import SidePanel from "./SidePanel";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenArchive: () => void;
  onOpenSaveLoad: () => void;
  onOpenSettings: () => void;
  onOpenAlignment: () => void;
  onOpenLog: () => void;
  onOpenVent: () => void;
}

export default function MobileHudDrawer(p: Props) {
  if (!p.open) return null;
  return (
    <div className="az-drawer-backdrop" onPointerDown={p.onClose}>
      <div
        className="az-drawer"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="az-drawer-grip" />
        <div className="az-drawer-body">
          <SidePanel
            onOpenArchive={() => { p.onOpenArchive(); p.onClose(); }}
            onOpenSaveLoad={() => { p.onOpenSaveLoad(); p.onClose(); }}
            onOpenSettings={() => { p.onOpenSettings(); p.onClose(); }}
            onOpenAlignment={() => { p.onOpenAlignment(); p.onClose(); }}
            onOpenLog={() => { p.onOpenLog(); p.onClose(); }}
            onOpenVent={() => { p.onOpenVent(); p.onClose(); }}
          />
        </div>
        <button className="az-drawer-close" onPointerDown={p.onClose}>CLOSE</button>
      </div>
    </div>
  );
}
