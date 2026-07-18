// Inventory, equipment & consumables. Pure state logic — src/menus.ts owns
// the HTML overlay and dispatches into these.

import { PLAYER_BASE_ATK, PLAYER_BASE_DEF } from './types';
import type { Accessory, GameState, Item, Weapon } from './types';
import { FREE_SWAP_PASSIVES, POTION_FIXED_TURN_COST, itemMeltValue, rollChestItem } from './content';
import { spendTurn, logLine } from './turns';
import { awardEchoes } from './echoes';
import { playAnchorSfx, playEquipSfx, playPickupSfx, playPotionSfx, playPurchaseSfx, playTimeShardSfx, playUnequipSfx, playUnlockSfx } from './audio';
import { notifyFloatingText } from './floatingText';

// Matches the 5x5 grid in menus.ts/style.css's .inventory-grid.
export const INVENTORY_CAP = 25;

/** 7-tile taxicab wake radius — only *awake* enemies count. */
const THREAT_RADIUS = 7;

// +/- DEF accessory passives (Iron Ring, and the Berserker's Cuff/Paladin's Mantle trade-off pair).
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

// Weapon-side DEF/Max HP modifiers while equipped (Bone Club/Defender,
// Apocalypse) — the weapon equivalent of the accessory maps above, applied
// the same way in equipWeapon/unequipWeapon below.
const WEAPON_DEF_BONUS: Partial<Record<string, number>> = { def_minus_1_equipped: -1, def_plus_1_equipped: 1 };
const WEAPON_HP_BONUS: Partial<Record<string, number>> = { max_hp_minus_10_equipped: -10 };

// Exported for menus.ts's Inventory Stat Block.
export function weaponDefBonus(weapon: Weapon | null): number {
  return WEAPON_DEF_BONUS[weapon?.passive ?? ''] ?? 0;
}

export function weaponHpBonus(weapon: Weapon | null): number {
  return WEAPON_HP_BONUS[weapon?.passive ?? ''] ?? 0;
}

// Exported for menus.ts's Inventory Stat Block — same lookups equip/unequip
// use for live stat math, so the displayed lines can never drift from reality.
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

/** Kindling Pouch/Capacitor Ring/Permafrost Vial: +2 damage for weapons/skills
 * of the matching element. Read by combat.ts/skills.ts. */
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
  const passive = state.run.equippedAccessory?.passive;
  if (!passive || ELEMENT_SYNERGY_PASSIVE[element] !== passive) return 0;
  return ELEMENT_SYNERGY_BONUS[passive] ?? 0;
}

// Giant's Anvil relic: +5 flat ATK — the trade-off (Dash permanently
// disabled) is enforced in skills.ts's skillStaminaCost instead.
export const GIANTS_ANVIL_ATK = 5;

export function totalAtk(state: GameState): number {
  const relicBonus = state.run.relics.includes('giants_anvil') ? GIANTS_ANVIL_ATK : 0;
  return (
    PLAYER_BASE_ATK +
    state.persistent.baseAtkUpgrade +
    (state.run.equippedWeapon?.atk ?? 0) +
    accessoryAtkBonus(state.run.equippedAccessory) +
    state.run.tempAtkBonus +
    relicBonus
  );
}

export function totalDef(state: GameState): number {
  const brace = state.run.braced ? 1 : 0;
  return (
    PLAYER_BASE_DEF + accessoryDefBonus(state.run.equippedAccessory) + weaponDefBonus(state.run.equippedWeapon) + state.run.tempDefBonus + brace
  );
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

function applyMaxStamDelta(state: GameState, delta: number): void {
  state.run.maxStamina += delta;
  state.run.currentStamina = Math.min(state.run.currentStamina, state.run.maxStamina);
}

/** Alchemist's Belt: using a Potion or Tactical Consumable costs 0 Turns,
 * even mid-combat. */
export function hasAlchemistsBelt(state: GameState): boolean {
  return state.run.equippedAccessory?.passive === 'alchemist_belt';
}

/** Shared tail of a normal (non-Anchor/Time-Shard/Relic) pickup: stacking
 * merge, then the INVENTORY_CAP check, then a push. Pulled out of
 * pickupItemsAt's loop so Golden Scarab's bonus chest item can reuse it.
 * Returns false when the cap blocks the pickup. */
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
    // With nowhere to go — put it back rather than deleting it outright.
    // Chest contents reroll on every pickup attempt anyway, so a rejected
    // attempt re-rolling next time isn't a regression.
    state.dungeon.items.push({ item, x, y, chestLoot });
    return false;
  }
  state.run.inventory.push(item);
  logLine(state, `Picked up ${item.name}.`);
  playPickupSfx();
  return true;
}

/** Adds every WorldItem standing at (x, y) to the inventory, removing each
 * from the floor. A tile can hold more than one drop. Anchors/Time Shards/
 * Relics are instant effects and never occupy a slot. Chest-loot items are
 * rerolled from gameplay RNG here, at pickup time, so contents vary loop to
 * loop while position stays seeded. */
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
      // Time-Eater's Jaw relic: +8 Turns instead of +5 — an override on the
      // fixed base value, not a multiplier.
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
        // Already held — this Relic doesn't stack with itself; a small
        // Echo consolation so the pickup still feels like it did something.
        awardEchoes(state, 10, 'duplicate Relic');
        logLine(state, `Already carrying ${item.name} — +10 Echoes instead.`);
      } else {
        state.run.relics.push(effect);
        logLine(state, `Chronofact acquired: ${item.name}!`);
        playUnlockSfx();
      }
      continue;
    }

    state.dungeon.items.splice(idx, 1);
    let finalItem = worldItem.chestLoot ? rollChestItem(Math.random, state.run.currentFloor, item.id) : item;
    // Alchemist's Satchel relic ("Potion drop rates are halved"): a 50%
    // chance to re-roll a chest's Potion result once, since the pool has no
    // probability knob to literally halve.
    if (worldItem.chestLoot && finalItem.kind === 'POTION' && state.run.relics.includes('alchemists_satchel') && Math.random() < 0.5) {
      finalItem = rollChestItem(Math.random, state.run.currentFloor, `${item.id}-satchel-reroll`);
    }
    // A chest reroll can land on a RELIC — re-dispatch through the instant-
    // pickup path above instead of the slot-occupying logic below.
    if (finalItem.kind === 'RELIC') {
      state.dungeon.items.push({ item: finalItem, x, y, chestLoot: false });
      continue;
    }

    if (!grantItem(state, x, y, finalItem, worldItem.chestLoot ?? false)) return;

    // Golden Scarab relic: chests drop a second item — only for actual chest
    // loot, and only once the primary item found a slot.
    if (worldItem.chestLoot && state.run.relics.includes('golden_scarab')) {
      const bonus = rollChestItem(Math.random, state.run.currentFloor, `${item.id}-scarab`);
      if (bonus.kind === 'RELIC') state.dungeon.items.push({ item: bonus, x, y, chestLoot: false });
      else grantItem(state, x, y, bonus, false);
    }
  }
}

/** Melts the inventory item at this slot for good, converting it to Echoes.
 * Same context-sensitive turn cost as an equip/unequip swap. Per-unit value
 * times the full stack — melting a Potion stack of 2 pays out for both. */
export function meltItem(state: GameState, invIndex: number): void {
  const item = state.run.inventory[invIndex];
  if (!item) return;
  state.run.inventory.splice(invIndex, 1);
  chargeInventoryAction(state, false);
  const units = item.count && item.count > 1 ? item.count : 1;
  // awardEchoes already logs "+N Echoes (reason)." — no separate "Melted ..." line.
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

function equipAccessory(state: GameState, invIndex: number, accessory: Accessory): void {
  state.run.inventory.splice(invIndex, 1);
  const prior = state.run.equippedAccessory;
  applyMaxHpDelta(state, -accessoryHpBonus(prior));
  applyMaxStamDelta(state, -accessoryStamBonus(prior));
  state.run.equippedAccessory = accessory;
  applyMaxHpDelta(state, accessoryHpBonus(accessory));
  applyMaxStamDelta(state, accessoryStamBonus(accessory));
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
  applyMaxHpDelta(state, -weaponHpBonus(weapon));
  state.run.equippedWeapon = null;
  state.run.inventory.push(weapon);
  chargeInventoryAction(state, FREE_SWAP_PASSIVES.has(weapon.passive));
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
  applyMaxStamDelta(state, -accessoryStamBonus(accessory));
  state.run.equippedAccessory = null;
  state.run.inventory.push(accessory);
  chargeInventoryAction(state, false);
  logLine(state, `Unequipped ${accessory.name}.`);
  playUnequipSfx();
}

/** Consumes one from the POTION stack at this inventory slot, applying its
 * `effect` (heal_flat, heal_percent_max, heal_percent_max_cleanse, or Soma
 * Drop's permanent_max_hp). Only clears the slot once the stack empties. */
export function usePotion(state: GameState, invIndex: number): void {
  const item = state.run.inventory[invIndex];
  if (!item || item.kind !== 'POTION') return;

  // Alchemist's Satchel relic doubles a Potion's HP restore — deliberately
  // excludes Soma Drop's permanent_max_hp, which isn't a "heal".
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
