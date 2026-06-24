import re

with open('src/index.css', 'r') as f:
    content = f.read()

# I removed the .wall-terminal__map and legend blocks previously. Those actually need to stay because the map feature still exists, it's just inside the newly designed terminal content block.
# Let me grab them from a previous state and restore them

map_css = '''
.wall-terminal__map {
  --wt-tile-size: 18px;
  --wt-tile-gap: 2px;
  --wt-tile-empty: #080600;
  --wt-tile-wall: #3a2a00;
  --wt-tile-floor: #1a1500;
  --wt-tile-player: var(--wt-green);
  --wt-tile-hazard: var(--wt-red);
  --wt-tile-objective: var(--wt-amber);

  display: grid;
  grid-auto-rows: var(--wt-tile-size);
  gap: var(--wt-tile-gap);
  padding: 0.75rem;
  background-color: var(--wt-bg-inset);
  border: 1px solid var(--wt-line);
  border-radius: 4px;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.8);
}
.wall-terminal__tile {
  width: var(--wt-tile-size);
  height: var(--wt-tile-size);
  background-color: var(--wt-tile-empty);
  border: 1px solid var(--wt-line);
  border-radius: 2px;
}
.wall-terminal__tile--wall        { background-color: var(--wt-tile-wall); border-color: var(--wt-line-bright); }
.wall-terminal__tile--floor       { background-color: var(--wt-tile-floor); }
.wall-terminal__tile--door-open   { background: #4a3a00; border: 1px solid #b89a2f; }
.wall-terminal__tile--door-closed { background: #2e2a00; border: 1px solid #8a7a2f; }
.wall-terminal__tile--door-locked { background: #201a00; border: 1px solid #605a2f; }
.wall-terminal__tile--light-on    { background: #4e3a00; outline: 1px solid #e0b82f; }
.wall-terminal__tile--light-off   { background: #201a00; outline: 1px solid #504010; }
.wall-terminal__tile--switch      { background: #3e2a00; outline: 1px solid #d0aa2f; }
.wall-terminal__tile--terminal    { background: #2c2000; outline: 1px solid #9a7a2f; }
.wall-terminal__tile--vent        { background: #2a2000; outline: 1px solid #60502f; }
.wall-terminal__tile--locker      { background: #252018; outline: 1px solid #806040; }
.wall-terminal__tile--chasm       { background: #060a0c; }
.wall-terminal__tile--player      { background-color: var(--wt-tile-player); box-shadow: 0 0 8px rgba(235, 209, 74, 0.7); }
.wall-terminal__tile--hazard      { background-color: var(--wt-tile-hazard); box-shadow: 0 0 6px rgba(255, 77, 82, 0.6); }
.wall-terminal__tile--objective   { background-color: var(--wt-tile-objective); box-shadow: 0 0 6px rgba(255, 180, 77, 0.6); }

.wall-terminal__tile--clickable {
  cursor: pointer;
  transition: outline 0.1s;
}
.wall-terminal__tile--clickable:hover {
  outline: 2px solid white;
}

/* --- Legend --- */
.wall-terminal__map-legend {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.7rem;
  justify-content: center;
}
.wall-terminal__legend-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: #8da4b0;
}
.wall-terminal__legend-item::before {
  content: "";
  display: block;
  width: 12px;
  height: 12px;
}
.wall-terminal__legend--switch::before    { background: #3e2a00; outline: 1px solid #d0aa2f; }
.wall-terminal__legend--door-closed::before { background: #2e2a00; border: 1px solid #8a7a2f; }
.wall-terminal__legend--door-locked::before { background: #201a00; border: 1px solid #605a2f; }
.wall-terminal__legend--light-on::before  { background: #4e3a00; outline: 1px solid #e0b82f; }
.wall-terminal__legend--player::before    { background: var(--wt-tile-player); box-shadow: 0 0 8px rgba(235, 209, 74, 0.7); }

/* Climate arrows */
.wall-terminal__arrow {
  width: 48px;
  height: 48px;
  border: none;
  background-color: transparent;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  cursor: pointer;
  opacity: 0.8;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wt-text);
}
.wall-terminal__arrow--up::before {
  content: "▲";
  font-size: 1.5rem;
  color: var(--wt-amber);
}
.wall-terminal__arrow--down::before {
  content: "▼";
  font-size: 1.5rem;
  color: var(--wt-amber);
}

.wall-terminal__arrow:hover {
  opacity: 1;
}
.wall-terminal__arrow:active {
  transform: scale(0.95);
}


.hvac__room {
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  min-height: 70px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}
'''

content = content.replace('/* ── Glitch Overlay ──────────────────────────────────────────────────────── */', map_css + '\n/* ── Glitch Overlay ──────────────────────────────────────────────────────── */')

with open('src/index.css', 'w') as f:
    f.write(content)

print("done")
