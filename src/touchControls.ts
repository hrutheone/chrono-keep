// Virtual D-Pad/action buttons for mobile.

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
  'skill-c': 'c',
  'skill-v': 'v',
  // Opens the Menu directly on a specific tab.
  'open-status': 'u',
  'open-inv': 'i',
  'open-skill': 'k',
};

// Move buttons fire keydown/keyup pair for repeat-on-hold.
const MOVE_KEYS = new Set(['move-up', 'move-down', 'move-left', 'move-right']);

function fireKey(key: string, type: 'keydown' | 'keyup' = 'keydown'): void {
  window.dispatchEvent(new KeyboardEvent(type, { key }));
}

/** Installs touch controls. */
export function installTouchControls(): void {
  const root = document.querySelector<HTMLElement>('#touch-controls');
  if (!root) return;

  let suppressClickUntil = 0;

  root.querySelectorAll<HTMLButtonElement>('[data-touch-key]').forEach((btn) => {
    const touchKey = btn.dataset.touchKey ?? '';
    const key = BUTTON_KEYS[touchKey];
    if (!key) return;

    if (MOVE_KEYS.has(touchKey)) {
      // Press/release pair without click fallback.
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

    // Guard against synthetic clicks.
    btn.addEventListener('click', () => {
      if (Date.now() < suppressClickUntil) return;
      fireKey(key);
    });
  });

  // Prevent browser default touch actions.
  root.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
}
