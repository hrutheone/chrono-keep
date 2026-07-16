// Virtual on-screen D-Pad/action buttons for mobile portrait play (index.html's
// #touch-controls, shown only under style.css's mobile media query). Rather than
// duplicating movement/skill/menu gating logic, every button dispatches the same
// synthetic keydown event the existing WASD/Space/Q/E/I/K/? listeners in
// movement.ts/skills.ts/menus.ts already consume — touch and keyboard input are
// guaranteed to behave identically because they run through one code path.

const BUTTON_KEYS: Record<string, string> = {
  'move-up': 'w',
  'move-down': 's',
  'move-left': 'a',
  'move-right': 'd',
  brace: ' ',
  'skill-q': 'q',
  'skill-e': 'e',
  'open-inventory': 'i',
  'open-skills': 'k',
  'open-help': '?',
};

function fireKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

/** Wires touchstart (primary — preventDefault stops the browser from zooming,
 * selecting text, or scrolling while the D-Pad is mashed) and click (fallback
 * for mouse/trackpad, e.g. testing a narrow desktop window) on every
 * [data-touch-key] button to its mapped keyboard key. */
export function installTouchControls(): void {
  const root = document.querySelector<HTMLElement>('#touch-controls');
  if (!root) return;

  let suppressClickUntil = 0;

  root.querySelectorAll<HTMLButtonElement>('[data-touch-key]').forEach((btn) => {
    const key = BUTTON_KEYS[btn.dataset.touchKey ?? ''];
    if (!key) return;

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
