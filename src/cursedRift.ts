// Cursed Rift event roulette — six random outcomes when the player steps onto a Cursed Rift.

import {
  BLOOD_ANVIL_ATK_BONUS,
  BLOOD_ANVIL_HP_COST_FRACTION,
  ECHO_GEODE_AMBUSH_CHANCE,
  ECHO_GEODE_AMBUSH_TURNS,
  ECHO_GEODE_ECHOES_PER_TURN,
  ECHO_GEODE_MAX_TURNS,
  LICH_PROJECTION_MAX_HP_COST,
  RIFT_SHOP_OFFER_COUNT,
  RIFT_SHOP_PRICES,
  SKILLS,
  createEnemy,
  pickRandomUnheldRelics,
  relicName,
  rollCursedRiftEvent,
  rollLateTierWeapon,
  weaknessOf,
} from './content';
import { totalAtk, totalDef } from './inventory';
import { isWalkableAt } from './mapgen';
import { skillLevel, MAX_SKILL_LEVEL } from './shop';
import { logLine } from './turns';
import { awardEchoes } from './echoes';
import { saveGame } from './persistence';
import { playBossTelegraphSfx, playEquipSfx, playErrorSound, playPurchaseSfx, playSkillUnlockSfx, playUnlockSfx } from './audio';
import type { CursedRiftEvent, Enemy, GameState } from './types';

/** Free walkable tiles around (x, y) — orthogonal + diagonal, not the player's own tile or an enemy's. */
function freeAdjacentTiles(state: GameState, x: number, y: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkableAt(state, nx, ny)) continue;
      if (nx === state.run.playerX && ny === state.run.playerY) continue;
      if (state.dungeon.enemies.some((e) => e.x === nx && e.y === ny)) continue;
      spots.push({ x: nx, y: ny });
    }
  }
  return spots;
}

/** Spawns up to `count` awake `kind` enemies on free tiles adjacent to the player (an ambush). */
function spawnAdjacentAmbush(state: GameState, kind: Enemy['kind'], count: number, idPrefix: string): void {
  const spots = freeAdjacentTiles(state, state.run.playerX, state.run.playerY);
  for (let i = 0; i < count && spots.length > 0; i++) {
    const idx = Math.floor(Math.random() * spots.length);
    const spot = spots.splice(idx, 1)[0];
    const enemy = createEnemy(kind, `${idPrefix}-${i}`, spot.x, spot.y);
    enemy.awake = true;
    state.dungeon.enemies.push(enemy);
  }
}

/** A mirror of the player's own stats — Cursed Rift's Paradox Mirror event. */
function spawnShadowWarden(state: GameState): void {
  const spot = freeAdjacentTiles(state, state.run.playerX, state.run.playerY)[0];
  if (!spot) return;
  const element = state.run.equippedWeapon?.element ?? 'PHYSICAL';
  const enemy = createEnemy('BONE_KNIGHT', `shadow-warden-${state.run.currentFloor}-${spot.x}-${spot.y}`, spot.x, spot.y);
  enemy.maxHp = state.run.maxHp;
  enemy.hp = state.run.maxHp;
  enemy.attack = totalAtk(state);
  enemy.defense = totalDef(state);
  enemy.element = element;
  enemy.weakness = weaknessOf(element);
  enemy.awake = true;
  enemy.auraColor = '#9b30ff';
  enemy.isShadowWarden = true;
  state.dungeon.enemies.push(enemy);
}

/** Rolls one of the 6 events and applies its immediate setup (Rift Shop offers, Paradox Mirror's spawn). */
export function triggerCursedRiftEvent(state: GameState): void {
  const riftX = state.dungeon.riftX!;
  const riftY = state.dungeon.riftY!;
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;

  const kind = rollCursedRiftEvent();
  const event: CursedRiftEvent = { kind, riftX, riftY, shopOffers: [], shopPurchases: 0, geodeTurnsMined: 0 };

  if (kind === 'rift_shop') {
    event.shopOffers = pickRandomUnheldRelics(state.run.relics, RIFT_SHOP_OFFER_COUNT);
  } else if (kind === 'paradox_mirror') {
    spawnShadowWarden(state);
  }

  state.run.cursedRiftEvent = event;
  state.ui.currentScreen = 'CURSED_RIFT';
}

/** Leaves the Rift Shop, or acknowledges an info-only event. The event's effects (if any) already happened. */
export function closeCursedRiftEvent(state: GameState): void {
  state.run.cursedRiftEvent = null;
  state.ui.currentScreen = 'GAME';
}

/** Event 1: buys one Relic from the Rift Shop offer at the current escalating price (50/150/300). */
export function buyRiftShopRelic(state: GameState, effect: string): void {
  const event = state.run.cursedRiftEvent;
  if (!event || event.kind !== 'rift_shop') return;
  const offerIdx = event.shopOffers.indexOf(effect);
  if (offerIdx === -1) return;
  const price = RIFT_SHOP_PRICES[Math.min(event.shopPurchases, RIFT_SHOP_PRICES.length - 1)];
  if (state.persistent.echoes < price) {
    playErrorSound();
    return;
  }
  state.persistent.echoes -= price;
  event.shopOffers.splice(offerIdx, 1);
  event.shopPurchases += 1;
  state.run.relics.push(effect);
  logLine(state, `The Rift takes ${price} Echoes — Relic acquired: ${relicName(effect)}!`);
  playUnlockSfx();
  saveGame(state);
}

/** Event 2: sacrifices 50% of current HP for +2 permanent ATK on the equipped weapon. */
export function resolveBloodAnvil(state: GameState, accept: boolean): void {
  if (accept && state.run.equippedWeapon) {
    const cost = Math.floor(state.run.currentHp * BLOOD_ANVIL_HP_COST_FRACTION);
    state.run.currentHp = Math.max(1, state.run.currentHp - cost);
    state.run.equippedWeapon.atk += BLOOD_ANVIL_ATK_BONUS;
    state.run.equippedWeapon.upgradeBonus = (state.run.equippedWeapon.upgradeBonus ?? 0) + BLOOD_ANVIL_ATK_BONUS;
    logLine(state, `The Anvil drinks ${cost} HP — ${state.run.equippedWeapon.name} is permanently sharper (+${BLOOD_ANVIL_ATK_BONUS} ATK).`);
    playEquipSfx();
  } else if (accept) {
    logLine(state, 'You have no weapon for the Anvil to sharpen.');
    playErrorSound();
  } else {
    logLine(state, 'You step back from the Anvil.');
  }
  closeCursedRiftEvent(state);
  saveGame(state);
}

/** Event 3: sacrifices 1 Potion for +1 level on a random active skill (capped at MAX_SKILL_LEVEL). */
export function resolveFrozenWatchwarden(state: GameState, accept: boolean): void {
  if (accept) {
    const potionIdx = state.run.inventory.findIndex((i) => i.kind === 'POTION');
    const candidates = state.run.activeSkills.filter((id) => id && skillLevel(state, id) < MAX_SKILL_LEVEL);
    if (potionIdx === -1 || candidates.length === 0) {
      logLine(state, 'The Watchwarden cannot be thawed — no Potion to spare, or nothing left to teach.');
      playErrorSound();
    } else {
      state.run.inventory.splice(potionIdx, 1);
      const skillId = candidates[Math.floor(Math.random() * candidates.length)];
      state.persistent.skills[skillId] = skillLevel(state, skillId) + 1;
      logLine(state, `The Watchwarden thaws — ${SKILLS[skillId].name} reaches Lv${state.persistent.skills[skillId]}!`);
      playSkillUnlockSfx();
    }
  } else {
    logLine(state, 'You leave the Watchwarden frozen.');
  }
  closeCursedRiftEvent(state);
  saveGame(state);
}

/** Event 5, accept: -10 Max HP for a guaranteed Late-Tier weapon chest on the Rift tile. Decline: 2 Bone-Knights ambush. */
export function resolveLichProjection(state: GameState, accept: boolean): void {
  const event = state.run.cursedRiftEvent;
  if (!event) return;
  if (accept) {
    state.run.maxHp = Math.max(1, state.run.maxHp - LICH_PROJECTION_MAX_HP_COST);
    state.run.currentHp = Math.min(state.run.currentHp, state.run.maxHp);
    const weapon = rollLateTierWeapon(`lich-chest-${state.run.currentFloor}-${event.riftX}-${event.riftY}`);
    state.dungeon.items.push({ item: weapon, x: event.riftX, y: event.riftY, chestLoot: true });
    logLine(state, `The bargain is struck — ${LICH_PROJECTION_MAX_HP_COST} Max HP for a gilded chest.`);
    playPurchaseSfx();
  } else {
    spawnAdjacentAmbush(state, 'BONE_KNIGHT', 2, `lich-ambush-${state.run.currentFloor}`);
    logLine(state, 'The Lich laughs — Bone-Knights answer his call!');
    playBossTelegraphSfx();
  }
  closeCursedRiftEvent(state);
  saveGame(state);
}

/** Event 6: one click of "Mine" inside the Rift modal — entirely self-contained, no map presence.
 *  Stops immediately (modal closes) on an ambush or once fully mined; the player can't mine further either way. */
export function mineEchoGeode(state: GameState): void {
  const event = state.run.cursedRiftEvent;
  if (!event || event.kind !== 'echo_geode') return;

  event.geodeTurnsMined += 1;
  awardEchoes(state, ECHO_GEODE_ECHOES_PER_TURN, 'Echo Geode');

  if (ECHO_GEODE_AMBUSH_TURNS.includes(event.geodeTurnsMined) && Math.random() < ECHO_GEODE_AMBUSH_CHANCE) {
    spawnAdjacentAmbush(state, 'BONE_GRUNT', 1, `geode-ambush-${state.run.currentFloor}-${event.geodeTurnsMined}`);
    logLine(state, "The Geode's vibrations draw an ambush — mining halted!");
    closeCursedRiftEvent(state);
    return;
  }

  if (event.geodeTurnsMined >= ECHO_GEODE_MAX_TURNS) {
    logLine(state, 'The Echo Geode crumbles, fully mined.');
    closeCursedRiftEvent(state);
    return;
  }

  logLine(state, `You mine the Geode (${event.geodeTurnsMined}/${ECHO_GEODE_MAX_TURNS}).`);
  saveGame(state);
}
