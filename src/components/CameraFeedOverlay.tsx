import { useSimStore } from "../state/useSimStore";
import { worldEngine } from "../engine/WorldEngine";

export default function CameraFeedOverlay() {
  const viewingCameraId = useSimStore((s) => s.subjective?.viewingCameraId);

  if (!viewingCameraId) return null;

  return (
    <div className="camera-feed-overlay" style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '24px',
      boxSizing: 'border-box'
    }}>
      {/* Scanning lines / Vignette overlay effect can go here in CSS via className */}

      <div style={{
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: '#ffc107',
        padding: '8px 16px',
        border: '1px solid #ffc107',
        fontFamily: 'monospace',
        fontSize: '18px',
        alignSelf: 'flex-start',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        pointerEvents: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#ff0000', borderRadius: '50%', animation: 'emergency-flash 1s infinite' }} />
          LIVE FEED: {viewingCameraId}
        </div>
      </div>

      <button
        style={{
          alignSelf: 'center',
          backgroundColor: '#1a1a1a',
          color: '#ffc107',
          border: '2px solid #ffc107',
          padding: '12px 24px',
          fontFamily: 'monospace',
          fontSize: '16px',
          cursor: 'pointer',
          pointerEvents: 'auto',
          boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
          transition: 'background-color 0.2s',
          marginTop: 'auto'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#332601'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}
        onClick={() => worldEngine.setViewCameraId(undefined)}
      >
        DISCONNECT CAMERA
      </button>
    </div>
  );
}
