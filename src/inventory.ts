// Inventory logic.

import { PLAYER_BASE_ATK, PLAYER_BASE_DEF } from './types';
import type { Accessory, GameState, Item, Weapon } from './types';
import { FREE_SWAP_PASSIVES, POTION_FIXED_TURN_COST, itemMeltValue, rollChestItem } from './content';
import { spendTurn, logLine } from './turns';
import { awardEchoes } from './echoes';
import { playAnchorSfx, playEquipSfx, playPickupSfx, playPotionSfx, playPurchaseSfx, playTimeShardSfx, playUnequipSfx, playUnlockSfx } from './audio';
import { notifyFloatingText } from './floatingText';

// Matches the 5x5 grid in menus.ts/style.css's .inventory-grid.
export const INVENTORY_CAP = 25;

/** 7-tile wake radius. */
const THREAT_RADIUS = 7;

// Accessory passives.
const DEF_BONUS: Partial<Record<string, number>> = {
  def_plus_2: 2,
  berserker: -2,
  paladin: 3,
};
const HP_BONUS: Partial<Record<string, number>> = {
  max_hp_plus_10: 10,
  paladin: -10,
};
const ATK_BONUS: Partial<Record<string, number>> = {
  berserker: 4,
};
const STAM_BONUS: Partial<Record<string, number>> = {
  max_stam_plus_3: 3,
};

// Weapon modifiers.
const WEAPON_DEF_BONUS: Partial<Record<string, number>> = { def_minus_1_equipped: -1, def_plus_1_equipped: 1 };
const WEAPON_HP_BONUS: Partial<Record<string, number>> = { max_hp_minus_10_equipped: -10 };

// Inventory Stats.
export function weaponDefBonus(weapon: Weapon | null): number {
  return WEAPON_DEF_BONUS[weapon?.passive ?? ''] ?? 0;
}

export function weaponHpBonus(weapon: Weapon | null): number {
  return WEAPON_HP_BONUS[weapon?.passive ?? ''] ?? 0;
}

// Live stat maths.
export function accessoryDefBonus(acc: Accessory | null): number {
  return DEF_BONUS[acc?.passive ?? ''] ?? 0;
}

export function accessoryHpBonus(acc: Accessory | null): number {
  return HP_BONUS[acc?.passive ?? ''] ?? 0;
}

export function accessoryAtkBonus(acc: Accessory | null): number {
  return ATK_BONUS[acc?.passive ?? ''] ?? 0;
}

export function accessoryStamBonus(acc: Accessory | null): number {
  return STAM_BONUS[acc?.passive ?? ''] ?? 0;
}

// --- Multi-slot accessory helpers ---
export type AccessorySlotNum = 1 | 2 | 3;
type AccessorySlotField = 'equippedAccessory' | 'equippedAccessory2' | 'equippedAccessory3';

function accessorySlotField(slot: AccessorySlotNum): AccessorySlotField {
  return slot === 1 ? 'equippedAccessory' : slot === 2 ? 'equippedAccessory2' : 'equippedAccessory3';
}

function accessorySlotUnlocked(state: GameState, slot: AccessorySlotNum): boolean {
  if (slot === 1) return true;
  if (slot === 2) return state.persistent.accessorySlot2Unlocked;
  return state.persistent.accessorySlot3Unlocked;
}

function firstEmptyUnlockedAccessorySlot(state: GameState): AccessorySlotNum | null {
  for (const slot of [1, 2, 3] as AccessorySlotNum[]) {
    if (accessorySlotUnlocked(state, slot) && !state.run[accessorySlotField(slot)]) return slot;
  }
  return null;
}

/** All currently-equipped accessories (any unlocked slot), simultaneously active. */
export function equippedAccessories(state: GameState): Accessory[] {
  return [state.run.equippedAccessory, state.run.equippedAccessory2, state.run.equippedAccessory3].filter(
    (a): a is Accessory => a != null,
  );
}

export function hasAccessoryPassive(state: GameState, passive: string): boolean {
  return equippedAccessories(state).some((a) => a.passive === passive);
}

/** Removes (destroys, does not return to inventory) the first equipped accessory with this passive. */
export function consumeAccessoryWithPassive(state: GameState, passive: string): Accessory | null {
  for (const slot of [1, 2, 3] as AccessorySlotNum[]) {
    const field = accessorySlotField(slot);
    const acc = state.run[field];
    if (acc && acc.passive === passive) {
      applyMaxHpDelta(state, -accessoryHpBonus(acc));
      applyMaxStamDelta(state, -accessoryStamBonus(acc));
      state.run[field] = null;
      return acc;
    }
  }
  return null;
}

/** Elemental damage bonuses. */
const ELEMENT_SYNERGY_BONUS: Partial<Record<string, number>> = {
  fire_synergy: 2,
  volt_synergy: 2,
  frost_synergy: 2,
};
const ELEMENT_SYNERGY_PASSIVE: Record<string, string | undefined> = {
  FIRE: 'fire_synergy',
  VOLT: 'volt_synergy',
  FROST: 'frost_synergy',
};

export function elementSynergyBonus(state: GameState, element: string): number {
  return equippedAccessories(state).reduce((sum, acc) => {
    if (ELEMENT_SYNERGY_PASSIVE[element] !== acc.passive) return sum;
    return sum + (ELEMENT_SYNERGY_BONUS[acc.passive] ?? 0);
  }, 0);
}

// Giant's Anvil relic.
export const GIANTS_ANVIL_ATK = 5;

export function totalAtk(state: GameState): number {
  const relicBonus = state.run.relics.includes('giants_anvil') ? GIANTS_ANVIL_ATK : 0;
  const accAtk = equippedAccessories(state).reduce((sum, acc) => sum + accessoryAtkBonus(acc), 0);
  return (
    PLAYER_BASE_ATK +
    state.persistent.baseAtkUpgrade +
    (state.run.equippedWeapon?.atk ?? 0) +
    accAtk +
    state.run.tempAtkBonus +
    relicBonus
  );
}

export function totalDef(state: GameState): number {
  const brace = state.run.braced ? 1 : 0;
  const accDef = equippedAccessories(state).reduce((sum, acc) => sum + accessoryDefBonus(acc), 0);
  return PLAYER_BASE_DEF + accDef + weaponDefBonus(state.run.equippedWeapon) + state.run.tempDefBonus + brace;
}

export function isThreatNearby(state: GameState): boolean {
  const { playerX, playerY } = state.run;
  return state.dungeon.enemies.some(
    (e) => e.awake && Math.abs(e.x - playerX) + Math.abs(e.y - playerY) <= THREAT_RADIUS,
  );
}

/** Context-sensitive turn cost. */
function chargeInventoryAction(state: GameState, freeAlways: boolean): void {
  if (freeAlways || !isThreatNearby(state)) return;
  spendTurn(state);
  logLine(state, 'DANGER — that action cost a turn.');
}

function applyMaxHpDelta(state: GameState, delta: number): void {
  state.run.maxHp += delta;
  state.run.currentHp = Math.min(state.run.currentHp, state.run.maxHp);
}

function applyMaxStamDelta(state: GameState, delta: number): void {
  state.run.maxStamina += delta;
  state.run.currentStamina = Math.min(state.run.currentStamina, state.run.maxStamina);
}

/** Alchemist's Belt check. */
export function hasAlchemistsBelt(state: GameState): boolean {
  return hasAccessoryPassive(state, 'alchemist_belt');
}

/** Grant item. */
function grantItem(state: GameState, x: number, y: number, item: Item, chestLoot: boolean): boolean {
  if (item.kind === 'POTION' || item.kind === 'CONSUMABLE') {
    const stack = state.run.inventory.find((i) => i.name === item.name);
    if (stack) {
      stack.count = (stack.count ?? 1) + 1;
      logLine(state, `Picked up ${item.name} (x${stack.count}).`);
      playPickupSfx();
      return true;
    }
  }
  if (state.run.inventory.length >= INVENTORY_CAP) {
    logLine(state, 'Inventory full.');
    // Return to pool if full.
    state.dungeon.items.push({ item, x, y, chestLoot });
    return false;
  }
  state.run.inventory.push(item);
  logLine(state, `Picked up ${item.name}.`);
  playPickupSfx();
  return true;
}

/** Pickup items at position. */
export function pickupItemsAt(state: GameState, x: number, y: number): void {
  for (;;) {
    const idx = state.dungeon.items.findIndex((wi) => wi.x === x && wi.y === y);
    if (idx === -1) return;
    const worldItem = state.dungeon.items[idx];
    const item = worldItem.item;

    if (item.kind === 'ANCHOR') {
      state.dungeon.items.splice(idx, 1);
      const nextBiomeStart = Math.min(91, Math.floor(state.run.currentFloor / 10) * 10 + 1);
      if (!state.persistent.unlockedAnchors.includes(nextBiomeStart)) {
        state.persistent.unlockedAnchors.push(nextBiomeStart);
        state.persistent.unlockedAnchors.sort((a, b) => a - b);
        playUnlockSfx();
      }
      awardEchoes(state, 25, 'Anchor collected');
      logLine(state, `Temporal Anchor secured! Floor ${nextBiomeStart} unlocked.`);
      playAnchorSfx();
      continue;
    }

    if (item.kind === 'TIME_SHARD') {
      state.dungeon.items.splice(idx, 1);
      // Time-Eater's Jaw relic.
      const gain = state.run.relics.includes('time_eaters_jaw') ? 8 : item.value;
      state.run.turnsRemaining += gain;
      logLine(state, `Time Shard! +${gain} Turns.`);
      playTimeShardSfx();
      notifyFloatingText(x, y, `+${gain} TURNS`, 'turns');
      continue;
    }

    if (item.kind === 'RELIC') {
      state.dungeon.items.splice(idx, 1);
      const effect = item.effect!;
      if (state.run.relics.includes(effect)) {
        // Duplicate Relic bonus.
        awardEchoes(state, 10, 'duplicate Relic');
        logLine(state, `Already carrying ${item.name} — +10 Echoes instead.`);
      } else {
        state.run.relics.push(effect);
        logLine(state, `Relic acquired: ${item.name}!`);
        playUnlockSfx();
      }
      continue;
    }

    state.dungeon.items.splice(idx, 1);
    let finalItem = worldItem.chestLoot ? rollChestItem(Math.random, state.run.currentFloor, item.id) : item;
    // Alchemist's Satchel relic reroll.
    if (worldItem.chestLoot && finalItem.kind === 'POTION' && state.run.relics.includes('alchemists_satchel') && Math.random() < 0.5) {
      finalItem = rollChestItem(Math.random, state.run.currentFloor, `${item.id}-satchel-reroll`);
    }
    // Handle RELIC drop.
    if (finalItem.kind === 'RELIC') {
      state.dungeon.items.push({ item: finalItem, x, y, chestLoot: false });
      continue;
    }

    if (!grantItem(state, x, y, finalItem, worldItem.chestLoot ?? false)) return;

    // Golden Scarab bonus item.
    if (worldItem.chestLoot && state.run.relics.includes('golden_scarab')) {
      const bonus = rollChestItem(Math.random, state.run.currentFloor, `${item.id}-scarab`);
      if (bonus.kind === 'RELIC') state.dungeon.items.push({ item: bonus, x, y, chestLoot: false });
      else grantItem(state, x, y, bonus, false);
    }
  }
}

/** Melt inventory item for Echoes. */
export function meltItem(state: GameState, invIndex: number): void {
  const item = state.run.inventory[invIndex];
  if (!item) return;
  state.run.inventory.splice(invIndex, 1);
  chargeInventoryAction(state, false);
  const units = item.count && item.count > 1 ? item.count : 1;
  // Award echoes.
  awardEchoes(state, itemMeltValue(item) * units, units > 1 ? `melted ${item.name} x${units}` : `melted ${item.name}`);
  playPurchaseSfx();
}

function equipWeapon(state: GameState, invIndex: number, weapon: Weapon): void {
  const freeAlways =
    FREE_SWAP_PASSIVES.has(weapon.passive) || FREE_SWAP_PASSIVES.has(state.run.equippedWeapon?.passive ?? '');
  state.run.inventory.splice(invIndex, 1);
  const prior = state.run.equippedWeapon;
  applyMaxHpDelta(state, -weaponHpBonus(prior));
  state.run.equippedWeapon = weapon;
  applyMaxHpDelta(state, weaponHpBonus(weapon));
  if (prior) state.run.inventory.push(prior);
  chargeInventoryAction(state, freeAlways);
  logLine(state, `Equipped ${weapon.name}.`);
  playEquipSfx();
}

/** Stashes a weapon into the (unlockable) second weapon slot — the bench slot, not usable in combat until swapped active. */
export function equipWeaponSlot2(state: GameState, invIndex: number): void {
  if (!state.persistent.weaponSlot2Unlocked) return;
  const item = state.run.inventory[invIndex];
  if (!item || item.kind !== 'WEAPON') return;
  const weapon = item as Weapon;
  const freeAlways =
    FREE_SWAP_PASSIVES.has(weapon.passive) || FREE_SWAP_PASSIVES.has(state.run.equippedWeapon2?.passive ?? '');
  state.run.inventory.splice(invIndex, 1);
  const prior = state.run.equippedWeapon2;
  state.run.equippedWeapon2 = weapon;
  if (prior) state.run.inventory.push(prior);
  chargeInventoryAction(state, freeAlways);
  logLine(state, `Stashed ${weapon.name} (Slot 2).`);
  playEquipSfx();
}

/** Swaps the active weapon with the benched Slot 2 weapon. */
export function swapActiveWeapon(state: GameState): void {
  if (!state.persistent.weaponSlot2Unlocked) return;
  const active = state.run.equippedWeapon;
  const bench = state.run.equippedWeapon2;
  if (!active && !bench) return;
  applyMaxHpDelta(state, -weaponHpBonus(active));
  state.run.equippedWeapon = bench;
  state.run.equippedWeapon2 = active;
  applyMaxHpDelta(state, weaponHpBonus(state.run.equippedWeapon));
  chargeInventoryAction(state, false);
  logLine(state, state.run.equippedWeapon ? `Swapped to ${state.run.equippedWeapon.name}.` : 'Weapon holstered — unarmed.');
  playEquipSfx();
}

function equipAccessory(state: GameState, invIndex: number, accessory: Accessory): void {
  const slot = firstEmptyUnlockedAccessorySlot(state) ?? 1;
  const field = accessorySlotField(slot);
  state.run.inventory.splice(invIndex, 1);
  const prior = state.run[field];
  applyMaxHpDelta(state, -accessoryHpBonus(prior));
  applyMaxStamDelta(state, -accessoryStamBonus(prior));
  state.run[field] = accessory;
  applyMaxHpDelta(state, accessoryHpBonus(accessory));
  applyMaxStamDelta(state, accessoryStamBonus(accessory));
  if (prior) state.run.inventory.push(prior);
  chargeInventoryAction(state, false);
  logLine(state, `Equipped ${accessory.name}${slot > 1 ? ` (Slot ${slot})` : ''}.`);
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
  applyMaxHpDelta(state, -weaponHpBonus(weapon));
  state.run.equippedWeapon = null;
  state.run.inventory.push(weapon);
  chargeInventoryAction(state, FREE_SWAP_PASSIVES.has(weapon.passive));
  logLine(state, `Unequipped ${weapon.name}.`);
  playUnequipSfx();
}

export function unequipWeapon2(state: GameState): void {
  const weapon = state.run.equippedWeapon2;
  if (!weapon) return;
  if (state.run.inventory.length >= INVENTORY_CAP) {
    logLine(state, 'Inventory full — cannot unequip.');
    return;
  }
  state.run.equippedWeapon2 = null;
  state.run.inventory.push(weapon);
  chargeInventoryAction(state, FREE_SWAP_PASSIVES.has(weapon.passive));
  logLine(state, `Unequipped ${weapon.name} (Slot 2).`);
  playUnequipSfx();
}

export function unequipAccessorySlot(state: GameState, slot: AccessorySlotNum): void {
  const field = accessorySlotField(slot);
  const accessory = state.run[field];
  if (!accessory) return;
  if (state.run.inventory.length >= INVENTORY_CAP) {
    logLine(state, 'Inventory full — cannot unequip.');
    return;
  }
  applyMaxHpDelta(state, -accessoryHpBonus(accessory));
  applyMaxStamDelta(state, -accessoryStamBonus(accessory));
  state.run[field] = null;
  state.run.inventory.push(accessory);
  chargeInventoryAction(state, false);
  logLine(state, `Unequipped ${accessory.name}.`);
  playUnequipSfx();
}

/** Consume potion. */
export function usePotion(state: GameState, invIndex: number): void {
  const item = state.run.inventory[invIndex];
  if (!item || item.kind !== 'POTION') return;

  // Alchemist's Satchel multiplier.
  const satchelMult = state.run.relics.includes('alchemists_satchel') ? 2 : 1;

  let healed = 0;
  switch (item.effect) {
    case 'heal_percent_max':
    case 'heal_percent_max_cleanse':
      healed = Math.round((state.run.maxHp * item.value * satchelMult) / 100);
      state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + healed);
      if (item.effect === 'heal_percent_max_cleanse') {
        state.run.status = 'NONE';
        state.run.statusTurns = 0;
      }
      break;
    case 'permanent_max_hp':
      applyMaxHpDelta(state, item.value);
      break;
    default: // 'heal_flat'
      healed = item.value * satchelMult;
      state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + healed);
  }

  const remaining = (item.count ?? 1) - 1;
  if (remaining > 0) item.count = remaining;
  else state.run.inventory.splice(invIndex, 1);

  const free = hasAlchemistsBelt(state);
  const fixedCost = POTION_FIXED_TURN_COST[item.name];
  if (fixedCost !== undefined && !free) {
    for (let i = 0; i < fixedCost; i++) spendTurn(state);
  } else {
    chargeInventoryAction(state, free);
  }

  if (item.effect === 'permanent_max_hp') logLine(state, `Used ${item.name} — +${item.value} Max HP.`);
  else if (item.effect === 'heal_percent_max_cleanse') logLine(state, `Used ${item.name}, healed ${healed} HP and cleansed Status.`);
  else logLine(state, `Used ${item.name}, healed ${healed} HP.`);
  playPotionSfx();
}
