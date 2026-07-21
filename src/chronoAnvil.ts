import { showConfirm } from './menus';
import { logLine } from './turns';
import { playBlockedSfx, playEquipSfx } from './audio';
import { triggerScreenShake } from './animation';
import { notifyFloatingText } from './floatingText';
import { createWeapon, rollLateTierWeapon, rollSameTierWeapon } from './content';
import { reforgeWeapon } from './inventory';
import { effectiveTileAt, TILE } from './mapgen';
import type { GameState } from './types';

/** Offers the equipped weapon to the Chrono Anvil for a 4-outcome gamble. */
export function triggerChronoAnvil(state: GameState, x: number, y: number): void {
  if (effectiveTileAt(state, x, y) !== TILE.CHRONO_ANVIL) return;
  if (!state.run.equippedWeapon) {
    showConfirm(state, 'You have nothing to forge.', () => {
      state.ui.currentScreen = 'GAME';
    });
    return;
  }
  
  showConfirm(state, 'Offer your weapon to the Anvil? The chronal forge is unpredictable.', () => {
    state.ui.currentScreen = 'GAME';
    const floor = state.run.currentFloor;
    const id = `f${floor}-anvil-${x}-${y}`;
    const roll = Math.random();
    
    if (roll < 0.2) {
      // Jackpot
      const forged = rollLateTierWeapon(id);
      reforgeWeapon(state, forged);
      notifyFloatingText(x, y, 'FLAWLESS FORGE!', 'crit');
      logLine(state, 'JACKPOT! The Anvil forges a masterpiece!');
      triggerScreenShake();
      playEquipSfx();
    } else if (roll < 0.4) {
      // Upgrade
      if (state.run.equippedWeapon) {
        state.run.equippedWeapon.upgradeBonus = (state.run.equippedWeapon.upgradeBonus ?? 0) + 2;
        state.run.equippedWeapon.atk += 2;
      }
      notifyFloatingText(x, y, 'RESONANCE INCREASED', 'immune');
      logLine(state, 'UPGRADE! Your weapon feels sharper.');
      playEquipSfx();
    } else if (roll < 0.8) {
      // Sidegrade
      const forged = rollSameTierWeapon(state.run.equippedWeapon!, id);
      reforgeWeapon(state, forged);
      notifyFloatingText(x, y, 'REFORGED', 'damage');
      logLine(state, 'SIDEGRADE. The Anvil returns an equivalent weapon.');
      playEquipSfx();
    } else {
      // Catastrophe
      const forged = createWeapon('SHATTERED_SCRAP', id);
      reforgeWeapon(state, forged);
      notifyFloatingText(x, y, 'SHATTERED...', 'corrupted');
      logLine(state, 'CATASTROPHE! Your weapon shatters into scrap.');
      triggerScreenShake();
      playBlockedSfx();
    }
    
    state.dungeon.tiles[y][x] = TILE.FLOOR;
  });
}
