# Wall Terminal UI Asset Requirements

Based on the implementation in `src/components/WallTerminal.tsx`, the following visual assets and styling elements are required to build the new GUI for the Wall Terminal.

## 1. General UI / Containers
*   **Overlay Background**: The dimming backdrop behind the terminal (`overlay-root`).
*   **Main Panel Frame**: The base container or background graphic for the terminal itself (`wall-terminal__frame`).
*   **Content Area**: The inner container where information is displayed (`wall-terminal__content`).
*   **Header Section**:
    *   **Title Text**: Styling for the terminal title (e.g., "WALL TERMINAL — [Room ID]", "ENTER CODE") (`wall-terminal__title`).
    *   **Emergency Indicator**: An icon or badge that has two states:
        *   Default/Off (`wall-terminal__emergency`)
        *   Lit/Active (triggered by hazardous atmosphere) (`wall-terminal__emergency--lit`)
*   **Section Labels**: Sub-headers for different parts of the panel (e.g., "ROOM MAP", "CLIMATE") (`wall-terminal__section-label`).
*   **Footer / Buttons**:
    *   **Dismiss/Cancel Button**: A primary action button at the bottom to close or cancel (e.g., "CLOSE (ESC)", "CANCEL (ESC)") (`hvac__dismiss`).

## 2. Room Map View (`view === "MAP"`)
The map is a grid representation of the room, requiring assets or distinct styles for various tile types.

### Map Tiles
*   **Base Tile Shape**: The default background or shape for a single map cell (`wall-terminal__tile`).
*   **Clickable State**: Visual indication (like hover or outline) when a tile is interactive (`wall-terminal__tile--clickable`).
*   **Specific Tile Types**:
    *   **Player Position**: Indicator for where the player is currently located (`wall-terminal__tile--player`).
    *   **Floor**: Empty walkable space (`wall-terminal__tile--floor`).
    *   **Wall**: Impassable terrain (`wall-terminal__tile--wall`).
    *   **Chasm**: Pits or drop-offs (`wall-terminal__tile--chasm`).
    *   **Interactive Objects**:
        *   **Light Switch**: (`wall-terminal__tile--switch`)
        *   **Terminal**: (`wall-terminal__tile--terminal`)
        *   **Vent**: (`wall-terminal__tile--vent`)
        *   **Locker**: (`wall-terminal__tile--locker`)
    *   **Doors**:
        *   **Open Door**: (`wall-terminal__tile--door-open`)
        *   **Closed Door**: (`wall-terminal__tile--door-closed`)
        *   **Locked Door**: (`wall-terminal__tile--door-locked`)
    *   **Lighting**:
        *   **Light On**: (`wall-terminal__tile--light-on`)
        *   **Light Off**: (`wall-terminal__tile--light-off`)

### Map Legend
*   **Legend Container**: Box holding the legend items (`wall-terminal__map-legend`).
*   **Legend Items**: Small icons and text combinations explaining the map symbols:
    *   Switch (SW)
    *   Door Closed (D)
    *   Door Locked (LK)
    *   Light On (LT)
    *   Player (PL)

## 3. Climate Controls (`view === "MAP"`)
Controls for adjusting the room's HVAC settings.

*   **Status Display**: Text styling for current temperature and airflow values (`hvac__room`).
*   **HVAC Mode Buttons**:
    *   **Base Button**: Normal state for mode selection (Auto, Heat, Cool, Off) (`hvac__mode-btn`).
    *   **Active Button**: Highlighted state for the currently selected mode (`is-active`).
*   **Setpoint Adjusters**:
    *   **Up Arrow/Button**: To raise temperature (`wall-terminal__arrow--up`).
    *   **Down Arrow/Button**: To lower temperature (`wall-terminal__arrow--down`).
    *   **Setpoint Value Display**: Text showing the target temperature.

## 4. Keypad / Code Input (`view === "CODE"`)
The view shown when interacting with a code-locked door.

*   **Code Display Area**:
    *   **Background**: Box holding the entered digits (`wall-terminal__display`).
    *   **Empty Character Slot**: Placeholder (e.g., "·") (`wall-terminal__display-char`).
    *   **Filled Character Slot**: An entered digit (`wall-terminal__display-char--filled`).
*   **Keypad Container**:
    *   **Base state**: (`wall-terminal__keypad`)
    *   **Error state**: Visual flash or shake when an incorrect code is entered (`wall-terminal__keypad--error`).
*   **Keypad Buttons**:
    *   **Base Number Key**: For digits 0-9 (`wall-terminal__key`).
    *   **Delete Key**: "DEL" button (`wall-terminal__key--del`).
    *   **Enter/Submit Key**: "ENT" button (`wall-terminal__key--ent`).
    *   **Key Label**: Typography for the number/text on the key (`wall-terminal__key-label`).
