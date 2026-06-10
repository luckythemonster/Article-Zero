import { useTerminalStore } from "../state/useTerminalStore";
import { useSimStore } from "../state/useSimStore";

export default function ObjectivesOverlay() {
  const open = useTerminalStore((s) => s.objectivesOpen);
  const setObjectivesOpen = useTerminalStore((s) => s.setObjectivesOpen);
  const objectives = useSimStore((s) => s.subjective?.objectives ?? []);

  if (!open) return null;

  return (
    <div className="overlay-root overlay-root--inventory" onClick={() => setObjectivesOpen(false)}>
      <div className="overlay-panel overlay-panel--inventory" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-panel__title inventory__title">
          <span>OBJECTIVES</span>
          <button
            type="button"
            className="btn"
            onClick={() => setObjectivesOpen(false)}
            aria-label="Close objectives"
          >
            [ESC] CLOSE
          </button>
        </div>

        {objectives.length === 0 ? (
          <div className="inventory__empty">NO ACTIVE OBJECTIVES.</div>
        ) : (
          <ul className="inventory__list">
            {objectives.map((obj) => (
              <li key={obj.id} className={`inventory__item is-passive ${obj.status === 'completed' ? 'is-completed' : ''}`}>
                <div className="inventory__item-header">
                  <span className="inventory__item-name">
                    {obj.status === 'completed' ? "[X]" : "[ ]"} {obj.description}
                  </span>
                </div>
                {obj.isFinal && <p className="inventory__item-blurb" style={{ color: '#ffb000', marginTop: '4px' }}>[PRIMARY DIRECTIVE]</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
