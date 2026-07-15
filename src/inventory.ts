// Inventory, equipment & consumables (GDD Sections 3, 6, 7). Pure state
// logic — src/menus.ts owns the HTML overlay and dispatches into these.

import { PLAYER_BASE_ATK, PLAYER_BASE_DEF } from './types';
import type { Accessory, GameState, Weapon } from './types';
import { spendTurn, logLine } from './turns';
import { rollChestItem } from './content';
import { awardEchoes } from './echoes';
import { playAnchorSfx, playEquipSfx, playPickupSfx, playPotionSfx, playTimeShardSfx, playUnequipSfx } from './audio';
import { notifyFloatingText } from './floatingText';

export const INVENTORY_CAP = 10;

/** 7-tile taxicab wake radius (GDD Section 7): only *awake* enemies count. */
const THREAT_RADIUS = 7;

function accessoryDefBonus(acc: Accessory | null): number {
  return acc?.passive === 'def_plus_2' ? 2 : 0;
}

function accessoryHpBonus(acc: Accessory | null): number {
  return acc?.passive === 'max_hp_plus_10' ? 10 : 0;
}

export function totalAtk(state: GameState): number {
  return PLAYER_BASE_ATK + (state.run.equippedWeapon?.atk ?? 0);
}

export function totalDef(state: GameState): number {
  const brace = state.run.braced ? 1 : 0;
  return PLAYER_BASE_DEF + accessoryDefBonus(state.run.equippedAccessory) + brace;
}

export function isThreatNearby(state: GameState): boolean {
  const { playerX, playerY } = state.run;
  return state.dungeon.enemies.some(
    (e) => e.awake && Math.abs(e.x - playerX) + Math.abs(e.y - playerY) <= THREAT_RADIUS,
  );
}

/** Context-sensitive turn cost: free out of combat, 1 turn near an awake
 * enemy — except the Bone Dagger, always free to swap. */
function chargeInventoryAction(state: GameState, freeAlways: boolean): void {
  if (freeAlways || !isThreatNearby(state)) return;
  spendTurn(state);
  logLine(state, 'DANGER — that action cost a turn.');
}

function applyMaxHpDelta(state: GameState, delta: number): void {
  state.run.maxHp += delta;
  state.run.currentHp = Math.min(state.run.currentHp, state.run.maxHp);
}

/** Adds every WorldItem standing at (x, y) to the inventory, removing each from the floor.
 * A tile can hold more than one drop (e.g. a kill's item plus a separately-rolled Time Shard).
 * Anchors and Time Shards are instant effects and never occupy a slot (Section 7).
 * Chest-loot items (Section 7 Dynamic Chest Loot) are rerolled from gameplay RNG
 * here, at pickup time, so contents vary loop to loop while position stays seeded. */
export function pickupItemsAt(state: GameState, x: number, y: number): void {
  for (;;) {
    const idx = state.dungeon.items.findIndex((wi) => wi.x === x && wi.y === y);
    if (idx === -1) return;
    const worldItem = state.dungeon.items[idx];
    const item = worldItem.item;

    if (item.kind === 'ANCHOR') {
      state.dungeon.items.splice(idx, 1);
      state.run.anchorsCollected += 1;
      awardEchoes(state, 5, 'Anchor collected');
      logLine(state, 'Temporal Anchor secured!');
      playAnchorSfx();
      continue;
    }

    if (item.kind === 'TIME_SHARD') {
      state.dungeon.items.splice(idx, 1);
      state.run.turnsRemaining += item.value;
      logLine(state, `Time Shard! +${item.value} Turns.`);
      playTimeShardSfx();
      notifyFloatingText(x, y, `+${item.value} TURNS`, 'turns');
      continue;
    }

    if (state.run.inventory.length >= INVENTORY_CAP) {
      logLine(state, 'Inventory full.');
      return;
    }
    state.dungeon.items.splice(idx, 1);
    const finalItem = worldItem.chestLoot ? rollChestItem(Math.random, state.run.currentFloor, item.id) : item;
    state.run.inventory.push(finalItem);
    logLine(state, `Picked up ${finalItem.name}.`);
    playPickupSfx();
  }
}

function equipWeapon(state: GameState, invIndex: number, weapon: Weapon): void {
  const freeAlways = weapon.passive === 'free_swap' || state.run.equippedWeapon?.passive === 'free_swap';
  state.run.inventory.splice(invIndex, 1);
  const prior = state.run.equippedWeapon;
  state.run.equippedWeapon = weapon;
  if (prior) state.run.inventory.push(prior);
  chargeInventoryAction(state, freeAlways);
  logLine(state, `Equipped ${weapon.name}.`);
  playEquipSfx();
}

function equipAccessory(state: GameState, invIndex: number, accessory: Accessory): void {
  state.run.inventory.splice(invIndex, 1);
  const prior = state.run.equippedAccessory;
  applyMaxHpDelta(state, -accessoryHpBonus(prior));
  state.run.equippedAccessory = accessory;
  applyMaxHpDelta(state, accessoryHpBonus(accessory));
  if (prior) state.run.inventory.push(prior);
  chargeInventoryAction(state, false);
  logLine(state, `Equipped ${accessory.name}.`);
  playEquipSfx();
}

/** Equips the WEAPON or ACCESSORY at this inventory slot, swapping any prior gear back in. */
export function equipItem(state: GameState, invIndex: number): void {
  const item = state.run.inventory[invIndex];
  if (!item) return;
  if (item.kind === 'WEAPON') equipWeapon(state, invIndex, item as Weapon);
  else if (item.kind === 'ACCESSORY') equipAccessory(state, invIndex, item as Accessory);
}

export function unequipWeapon(state: GameState): void {
  const weapon = state.run.equippedWeapon;
  if (!weapon) return;
  if (state.run.inventory.length >= INVENTORY_CAP) {
    logLine(state, 'Inventory full — cannot unequip.');
    return;
  }
  state.run.equippedWeapon = null;
  state.run.inventory.push(weapon);
  chargeInventoryAction(state, weapon.passive === 'free_swap');
  logLine(state, `Unequipped ${weapon.name}.`);
  playUnequipSfx();
}

export function unequipAccessory(state: GameState): void {
  const accessory = state.run.equippedAccessory;
  if (!accessory) return;
  if (state.run.inventory.length >= INVENTORY_CAP) {
    logLine(state, 'Inventory full — cannot unequip.');
    return;
  }
  applyMaxHpDelta(state, -accessoryHpBonus(accessory));
  state.run.equippedAccessory = null;
  state.run.inventory.push(accessory);
  chargeInventoryAction(state, false);
  logLine(state, `Unequipped ${accessory.name}.`);
  playUnequipSfx();
}

/** Consumes the POTION at this inventory slot, healing by its value (capped at maxHp). */
export function usePotion(state: GameState, invIndex: number): void {
  const item = state.run.inventory[invIndex];
  if (!item || item.kind !== 'POTION') return;
  state.run.inventory.splice(invIndex, 1);
  state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + item.value);
  chargeInventoryAction(state, false);
  logLine(state, `Used ${item.name}, healed ${item.value} HP.`);
  playPotionSfx();
}
