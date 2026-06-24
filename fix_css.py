import re

with open('src/index.css', 'r') as f:
    content = f.read()

# First replace .wall-terminal and .wall-terminal__content
wt_css = '''
.wall-terminal {
  position: relative;
  width: 960px; /* Base chassis width */
  height: 640px; /* Base chassis height */
  color: #e6f0f2;
  display: flex;
  justify-content: center;
  align-items: center;
  transform-origin: center center;
  margin: auto;

  --wt-bg:          #0a0800;
  --wt-bg-panel:    #0a0800;
  --wt-bg-inset:    #000000;
  --wt-grid:        rgba(235, 209, 74, 0.05);
  --wt-line:        #2a2000;
  --wt-line-bright: #3a2800;
  --wt-green:       #ebd14a;
  --wt-green-dim:   #9a8023;
  --wt-amber:       #ffb44d;
  --wt-amber-dim:   #9a6a23;
  --wt-red:         #ff4d52;
  --wt-text:        #e6f0f2;
  --wt-text-dim:    #809a93;
  --wt-radius:      6px;
}

@media (max-width: 960px) {
  .wall-terminal {
    transform: scale(calc(100vw / 960));
  }
}

.wall-terminal__chassis-base {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

.wall-terminal__screen-overlay {
  position: absolute;
  top: 130px;
  left: 236px;
  width: 488px;
  height: 488px;
  pointer-events: none;
  z-index: 5;
  opacity: 0.15;
  mix-blend-mode: screen;
}

.wall-terminal__grid-bg {
  position: absolute;
  top: 130px;
  left: 236px;
  width: 488px;
  height: 488px;
  pointer-events: none;
  z-index: 0;
}

.wall-terminal__content {
  position: absolute;
  top: 140px;
  left: 246px;
  width: 468px;
  height: 448px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  overflow-y: auto;
}

'''

start_idx = content.find('.wall-terminal {')
end_idx = content.find('/* ---- Header ---------------------------------------------------------- */')

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + wt_css + content[end_idx:]

with open('src/index.css', 'w') as f:
    f.write(content)

print("done")
