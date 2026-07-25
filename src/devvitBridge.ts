// The only module that talks to a Devvit host via postMessage — main.ts/state.ts/
// persistence.ts stay platform-agnostic so the engine keeps working standalone.
import { loadRunSnapshot } from './persistence';
import type { GameState } from './types';

const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

export interface HostIdentity {
  userId: string;
  username: string;
}

interface InitStateMessage {
  type: 'CK_INIT_STATE';
  persistent: GameState['persistent'] | null;
  turnCount: number;
  user: HostIdentity;
}

interface SaveHardMessage {
  type: 'CK_SAVE_HARD';
  persistent: GameState['persistent'];
  turnCount: number;
}

let hostUser: HostIdentity | null = null;

export function getHostUser(): HostIdentity | null {
  return hostUser;
}

/**
 * Requests the Devvit host's hard-save + identity, reconciles it against the local
 * soft-save's turnCount, and applies whichever is newer to `state`. No-ops when not
 * running inside a host frame (standalone dev server / build).
 */
export function initDevvitBridge(state: GameState): void {
  if (!isEmbedded) return;

  window.addEventListener('message', (ev) => {
    const data = ev.data as Partial<InitStateMessage> | undefined;
    if (!data || data.type !== 'CK_INIT_STATE') return;
    hostUser = data.user ?? null;

    const localTurnCount = loadRunSnapshot()?.turnCount ?? -1;
    const hostTurnCount = data.turnCount ?? -1;
    // A higher local turnCount means the same device is resuming mid-floor — main.ts's
    // normal boot path already loaded that snapshot, so leave it alone. Otherwise the
    // host's hard save is the newest thing we have.
    if (hostTurnCount > localTurnCount && data.persistent) {
      state.persistent = data.persistent;
    }
  });

  window.parent.postMessage({ type: 'CK_REQUEST_INIT' }, '*');
}

/**
 * Sends current progress to the Devvit host at a structural save boundary (floor
 * transition/warp, Hub return, Anchor placement, Save & Quit). No-ops outside a host frame.
 */
export function reportHardSave(state: GameState): void {
  if (!isEmbedded) return;
  const message: SaveHardMessage = {
    type: 'CK_SAVE_HARD',
    persistent: state.persistent,
    turnCount: state.run.turnCount,
  };
  window.parent.postMessage(message, '*');
}
