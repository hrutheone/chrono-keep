// Virtual D-Pad/action buttons for mobile. Each button dispatches the same
// synthetic keydown the WASD/Space/Q/E/I listeners already consume, so touch
// and keyboard input run through one code path.

const BUTTON_KEYS: Record<string, string> = {
  'move-up': 'w',
  'move-down': 's',
  'move-left': 'a',
  'move-right': 'd',
  brace: ' ',
  'skill-q': 'q',
  'skill-e': 'e',
  'skill-r': 'r',
  'skill-f': 'f',
  // Opens the unified Menu on its Inventory tab (or closes it if already
  // open); the Menu's own tab row reaches every other section from there.
  'open-menu': 'i',
};

// Move buttons fire a real keydown/keyup pair so movement.ts's DAS timer can
// drive repeat-on-hold; every other button stays single-fire.
const MOVE_KEYS = new Set(['move-up', 'move-down', 'move-left', 'move-right']);

function fireKey(key: string, type: 'keydown' | 'keyup' = 'keydown'): void {
  window.dispatchEvent(new KeyboardEvent(type, { key }));
}

/** Wires touchstart (preventDefault stops zoom/selection/scroll while
 * mashing the D-Pad) and click (mouse/trackpad fallback) on every
 * [data-touch-key] button to its mapped keyboard key. */
export function installTouchControls(): void {
  const root = document.querySelector<HTMLElement>('#touch-controls');
  if (!root) return;

  let suppressClickUntil = 0;

  root.querySelectorAll<HTMLButtonElement>('[data-touch-key]').forEach((btn) => {
    const touchKey = btn.dataset.touchKey ?? '';
    const key = BUTTON_KEYS[touchKey];
    if (!key) return;

    if (MOVE_KEYS.has(touchKey)) {
      // Press/release pair — no click fallback needed since mousedown/mouseup
      // already cover mouse/trackpad, and pairing click with these would
      // double-fire an extra move on release.
      btn.addEventListener('touchstart', (ev) => { ev.preventDefault(); fireKey(key, 'keydown'); }, { passive: false });
      btn.addEventListener('touchend', (ev) => { ev.preventDefault(); fireKey(key, 'keyup'); }, { passive: false });
      btn.addEventListener('touchcancel', () => fireKey(key, 'keyup'));
      btn.addEventListener('mousedown', () => fireKey(key, 'keydown'));
      btn.addEventListener('mouseup', () => fireKey(key, 'keyup'));
      btn.addEventListener('mouseleave', () => fireKey(key, 'keyup'));
      return;
    }

    btn.addEventListener(
      'touchstart',
      (ev) => {
        ev.preventDefault();
        fireKey(key);
        suppressClickUntil = Date.now() + 500;
      },
      { passive: false },
    );

    // Guards against a synthetic click firing right after touchstart on
    // browsers that don't fully suppress it despite preventDefault().
    btn.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      fireKey(key);
    });
  });

  // Belt-and-suspenders: stops iOS Safari's pinch-zoom/long-press callout
  // and text selection anywhere on the control pad while mashing buttons.
  root.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
}
