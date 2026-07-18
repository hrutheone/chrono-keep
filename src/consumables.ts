// Tactical Consumables (GDD Section 6E, Phase 8): always 1 turn to use, in or
// out of combat — unlike Potions' context-sensitive 0/1-turn rule — unless
// Alchemist's Belt makes both categories free (Section 6D/7). Throwables
// (Liquid Fire Flask, Shock Grenade) reuse Section 8's "aim along facing"
// directional Skill Targeting Logic rather than building a second targeting
// system, same as Cleave/Static Shift.

import { applyEnemyStatus, applyPlayerStatus } from './combat';
import { hasAlchemistsBelt } from './inventory';
import { awardEchoes } from './echoes';
import { isWalkableAt, TILE } from './mapgen';
import { resolvePlayerTurn } from './turnController';
import { logLine } from './turns';
import type { Consumable, GameState } from './types';

type Facing = GameState['run']['facing'];
const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.dungeon.width && y >= 0 && y < state.dungeon.height;
}

function walkableAt(state: GameState, x: number, y: number): boolean {
  return isWalkableAt(state, x, y);
}

/** Farthest walkable tile up to `range` along facing — the player's own tile
 * if nothing further is reachable (a wall right in front, say). */
function throwTarget(state: GameState, range: number): { x: number; y: number } {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  let x = state.run.playerX;
  let y = state.run.playerY;
  for (let i = 1; i <= range; i++) {
    const nx = state.run.playerX + dx * i;
    const ny = state.run.playerY + dy * i;
    if (!walkableAt(state, nx, ny)) break;
    x = nx;
    y = ny;
  }
  return { x, y };
}

function placeExpiringTile(state: GameState, x: number, y: number, turnsLeft: number, tileType: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) {
    existing.turnsLeft = turnsLeft;
    existing.tileType = tileType;
  } else {
    state.dungeon.expiringTiles.push({ x, y, turnsLeft, tileType });
  }
}

function effectThrowFireHazard(state: GameState, item: Consumable): void {
  const { x, y } = throwTarget(state, item.value);
  placeExpiringTile(state, x, y, 4, TILE.FIRE_HAZARD);
  logLine(state, 'The Liquid Fire Flask shatters and ignites!');
}

function effectThrowShockGrenade(state: GameState, item: Consumable): void {
  const { x, y } = throwTarget(state, item.value);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx === state.run.playerX && ty === state.run.playerY) {
        applyPlayerStatus(state, 'STUN', 1);
        continue;
      }
      const enemy = state.dungeon.enemies.find((e) => e.x === tx && e.y === ty);
      if (enemy) applyEnemyStatus(enemy, 'STUN', 1);
    }
  }
  logLine(state, 'The Shock Grenade detonates!');
}

function effectIceBarricade(state: GameState, item: Consumable): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const x = state.run.playerX + dx;
  const y = state.run.playerY + dy;
  if (!inBounds(state, x, y) || (x === state.run.playerX && y === state.run.playerY)) {
    logLine(state, 'No room to draw the rune.');
    return;
  }
  placeExpiringTile(state, x, y, item.value, TILE.WALL);
  logLine(state, 'An Ice-Barricade rises ahead of you!');
}

function effectRestoreStamina(state: GameState): void {
  state.run.currentStamina = state.run.maxStamina;
  logLine(state, 'Stamina Draught — fully restored!');
}

function effectQuicksilver(state: GameState, item: Consumable): void {
  state.run.quicksilverCharges += item.value;
  logLine(state, `Quicksilver surges — your next ${item.value} actions are free.`);
}

function effectRecall(state: GameState): void {
  state.run.playerX = state.dungeon.spawnX;
  state.run.playerY = state.dungeon.spawnY;
  logLine(state, 'The Recall Rune pulls you back to the entrance.');
}

function effectEchoGeode(state: GameState, item: Consumable): void {
  awardEchoes(state, item.value, 'Echo Geode');
}

function effectWhetstone(state: GameState): void {
  state.run.whetstoneCharge = true;
  logLine(state, 'The Whetstone sharpens your next strike.');
}

const EFFECTS: Record<string, (state: GameState, item: Consumable) => void> = {
  throw_fire_hazard: effectThrowFireHazard,
  throw_shock_grenade: effectThrowShockGrenade,
  ice_barricade: effectIceBarricade,
  restore_stamina: effectRestoreStamina,
  quicksilver: effectQuicksilver,
  recall: effectRecall,
  echo_geode: effectEchoGeode,
  whetstone: effectWhetstone,
};

/** Uses the CONSUMABLE at this inventory slot: always 1 turn (Section 6E/7),
 * in or out of combat, unless Alchemist's Belt makes it free. Returns the
 * resolvePlayerTurn() promise (or a resolved no-op when free) so
 * programmatic callers can await full resolution. */
export function useConsumable(state: GameState, invIndex: number): Promise<void> {
  const item = state.run.inventory[invIndex];
  if (!item || item.kind !== 'CONSUMABLE') return Promise.resolve();
  const consumable = item as Consumable;
  const effect = EFFECTS[consumable.effect];
  if (!effect) return Promise.resolve();

  // Phase 18 Inventory Stacking: decrement in place; only clear the slot
  // once the stack empties.
  const remaining = (consumable.count ?? 1) - 1;
  if (remaining > 0) consumable.count = remaining;
  else state.run.inventory.splice(invIndex, 1);
  effect(state, consumable);
  logLine(state, `Used ${consumable.name}.`);

  if (hasAlchemistsBelt(state)) return Promise.resolve();
  return resolvePlayerTurn(state, 'item');
}
