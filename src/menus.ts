// UI overlays.

import {
  ACCESSORY_EFFECT_LABEL,
  BESTIARY,
  CONSUMABLE_EFFECT_TEXT,
  ENEMY_NAME,
  MONSTER_LORE,
  POTION_FIXED_TURN_COST,
  SKILL_LEVEL_EFFECTS,
  SKILLS,
  WEAPON_EFFECT_LABEL,
  itemMeltValue,
  loreForItem,
  pickRandomUnheldRelic,
  relicEffectText,
  relicLore,
  relicName,
} from './content';
import { spriteCssStyle } from './assets';
import {
  ACCESSORY_SPRITE_BY_NAME,
  CONSUMABLE_SPRITE_BY_NAME,
  POTION_SPRITE_BY_NAME,
  RELIC_SPRITE_BY_EFFECT,
  SKILL_SPRITE_BY_ID,
  SPRITES,
  STAT_TRACK_SPRITE,
  WEAPON_SPRITE_BY_NAME,
  type SpriteRef,
} from './sprites';
import { HUB_FLOOR, enterHub, gateDestinations, warpToFloor } from './hub';
import { clearRunSnapshot, clearSave, hasSave, saveAudioSettings, saveGame, saveRunSnapshot } from './persistence';
import { continueAfterDeath, resolvePlayerTurn } from './turnController';
import { performDescend } from './movement';
import { logLine } from './turns';
import { awardEchoes } from './echoes';
import { resetRunForNewLoop, resetToNewGame, rerollSeedKeepProgress } from './state';
import { enterShatteringTutorial, isShatteringTutorial } from './shattering';
import { getMasterVolume, isMuted, playNewGameSfx, playWarpSfx, setMasterVolume, toggleMuted } from './audio';
import {
  buyOneTimeUpgrade,
  buySkillUpgrade,
  buyStatUpgrade,
  oneTimeUpgradeAvailable,
  ONE_TIME_UPGRADES,
  skillCost,
  skillLevel,
  STAT_TRACKS,
  statTrackCost,
  type OneTimeUpgradeId,
  type StatTrack,
} from './shop';
import {
  INVENTORY_CAP,
  accessoryAtkBonus,
  accessoryDefBonus,
  accessoryHpBonus,
  accessoryStamBonus,
  equipItem,
  equipWeaponSlot2,
  meltItem,
  isThreatNearby,
  swapActiveWeapon,
  totalAtk,
  totalDef,
  unequipAccessorySlot,
  unequipWeapon,
  unequipWeapon2,
  usePotion,
  weaponDefBonus,
  weaponHpBonus,
} from './inventory';
import { useConsumable } from './consumables';
import type { EnemyKind, SkillId } from './content';
import type { Accessory, Consumable, GameState, Item, Weapon } from './types';

const BY_NAME_FOR_KIND: Partial<Record<Item['kind'], Record<string, SpriteRef>>> = {
  WEAPON: WEAPON_SPRITE_BY_NAME,
  ACCESSORY: ACCESSORY_SPRITE_BY_NAME,
  POTION: POTION_SPRITE_BY_NAME,
  CONSUMABLE: CONSUMABLE_SPRITE_BY_NAME,
};
const INV_ICON_REFS: Partial<Record<Item['kind'], SpriteRef>> = {
  WEAPON: SPRITES.WEAPON,
  ACCESSORY: SPRITES.ACCESSORY,
  POTION: SPRITES.POTION,
  CONSUMABLE: SPRITES.CONSUMABLE,
};
const INV_ICON_SIZE = 24;
const DETAIL_ICON_SIZE = 40;

function iconStyleForItem(item: Item, size: number): string {
  const ref = BY_NAME_FOR_KIND[item.kind]?.[item.name] ?? INV_ICON_REFS[item.kind] ?? SPRITES.CHEST;
  return spriteCssStyle(ref, size);
}

function iconStyleForSkill(skillId: string, size: number): string {
  return spriteCssStyle(SKILL_SPRITE_BY_ID[skillId as SkillId], size);
}

let lastScreen: GameState['ui']['currentScreen'] | null = null;

export type MenuTabId = 'status' | 'inventory' | 'chronofacts' | 'skill' | 'bestiary' | 'settings';
let menuTab: MenuTabId = 'status';

let selectedInvIndex: number | null = null;
let selectedRelicEffect: string | null = null;

/** Keeps the selection on whatever shifted into this slot after a melt/use/equip removed an item. */
function reselectAfterConsume(state: GameState, priorIndex: number): void {
  const inv = state.run.inventory;
  selectedInvIndex = inv.length === 0 ? null : Math.min(priorIndex, inv.length - 1);
}

let selectedSkillId: string | null = null;
let selectedBestiaryKind: EnemyKind | null = null;
let selectedStatTrack: StatTrack | null = null;
let selectedShopSkillId: string | null = null;
let selectedUpgradeId: OneTimeUpgradeId | null = null;

const UPGRADE_ICON: Record<OneTimeUpgradeId, SpriteRef> = {
  weaponSlot2: SPRITES.WEAPON,
  accessorySlot2: SPRITES.ACCESSORY,
  accessorySlot3: SPRITES.ACCESSORY,
};

interface PendingConfirm {
  message: string;
  onConfirm: () => void;
  returnScreen: GameState['ui']['currentScreen'];
}
let pendingConfirm: PendingConfirm | null = null;

export function showConfirm(state: GameState, message: string, onConfirm: () => void): void {
  pendingConfirm = { message, onConfirm, returnScreen: state.ui.currentScreen };
  state.ui.currentScreen = 'CONFIRM';
}

/** Answers the current confirm overlay programmatically. */
export function answerPendingConfirm(state: GameState, accept: boolean): void {
  if (!pendingConfirm) return;
  const confirmed = pendingConfirm;
  pendingConfirm = null;
  if (accept) confirmed.onConfirm();
  else state.ui.currentScreen = confirmed.returnScreen;
}

function screenEl(): HTMLElement {
  return document.querySelector<HTMLElement>('#screen-overlay')!;
}

/** Opens the unified Menu on a specific tab. */
function openMenuTab(state: GameState, tab: MenuTabId): void {
  if (state.ui.currentScreen === 'MENU' && menuTab === tab) {
    state.ui.currentScreen = 'GAME';
  } else {
    menuTab = tab;
    state.ui.currentScreen = 'MENU';
  }
}

export type SkillSlot = 'Q' | 'E' | 'R' | 'F';
const SLOT_INDEX: Record<SkillSlot, number> = { Q: 0, E: 1, R: 2, F: 3 };

/** Assigns a skill to a slot. */
function assignSkill(state: GameState, skillId: string, slot: SkillSlot): void {
  const idx = SLOT_INDEX[slot];
  state.run.activeSkills[idx] = skillId;
  state.persistent.skillLoadout[idx] = skillId;
  saveGame(state);
}

/** Starts a new game. */
function startNewGame(state: GameState): void {
  showConfirm(state, 'Start a New Game? This rerolls the dungeon and wipes all permanent progress.', () => {
    clearSave();
    clearRunSnapshot();
    resetToNewGame(state);
    // Loop 0 always opens on the Shattering — the fake-endgame vision fight.
    enterShatteringTutorial(state);
    state.ui.currentScreen = 'GAME';
    playNewGameSfx();
    saveGame(state);
  });
}

/** Continues the save. */
function continueSave(state: GameState): void {
  enterHub(state);
  state.ui.currentScreen = 'GAME';
  saveGame(state);
  saveRunSnapshot(state);
}

/** Starts New Game Plus. */
function startNewGamePlus(state: GameState): void {
  state.persistent.ngPlusLevel += 1;
  state.persistent.unlockedAnchors = [];
  rerollSeedKeepProgress(state);
  resetRunForNewLoop(state);
  enterHub(state);
  state.ui.currentScreen = 'GAME';
  playNewGameSfx();
  saveGame(state);
  saveRunSnapshot(state);
}

/** Warps from Hub gate. */
function warpFromGate(state: GameState, floor: number): void {
  warpToFloor(state, floor);
  state.ui.currentScreen = 'GAME';
  playWarpSfx();
}

// --- Developer Tools (Settings tab) ---

/** Dev Warp: jumps straight to a target floor, reusing the real stairs-transition logic. */
function devWarp(state: GameState): void {
  const input = document.querySelector<HTMLInputElement>('#dev-warp-floor');
  const raw = Number(input?.value ?? 1);
  const floor = Math.max(1, Math.min(99, Number.isFinite(raw) ? Math.round(raw) : 1));
  state.ui.currentScreen = 'GAME';
  performDescend(state, floor);
}

function devAddEchoes(state: GameState): void {
  state.persistent.echoes += 1000;
  logLine(state, 'Dev Tools: +1000 Echoes.');
  saveGame(state);
}

/** Dev Kill: forces the loss condition through the normal turn-resolution path. */
function devForceDeath(state: GameState): void {
  if (state.run.currentFloor === HUB_FLOOR) {
    logLine(state, 'Dev Tools: no loss condition in the Hub.');
    return;
  }
  state.run.currentHp = 0;
  state.ui.currentScreen = 'GAME';
  void resolvePlayerTurn(state, 'wait');
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function deltaMarker(delta: number): string {
  if (delta === 0) return '';
  const arrow = delta > 0 ? '▲' : '▼';
  return ` (${arrow} ${delta > 0 ? '+' : ''}${delta})`;
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`;
}

/** Returns a stat block string for an item. */
function statBlockForItem(state: GameState, item: Item): string | null {
  const { run } = state;

  if (item.kind === 'WEAPON') {
    const weapon = item as Weapon;
    const equipped = run.equippedWeapon;
    const comparing = equipped !== null && equipped.id !== weapon.id;
    const atkPart = `ATK: ${weapon.atk}${comparing ? deltaMarker(weapon.atk - equipped!.atk) : ''}`;
    const parts = [atkPart, `Element: ${titleCase(weapon.element)}`];
    const defBonus = weaponDefBonus(weapon);
    if (defBonus !== 0) parts.push(`DEF: ${signed(defBonus)}${comparing ? deltaMarker(defBonus - weaponDefBonus(equipped)) : ''}`);
    const hpBonus = weaponHpBonus(weapon);
    if (hpBonus !== 0) parts.push(`Max HP: ${signed(hpBonus)}${comparing ? deltaMarker(hpBonus - weaponHpBonus(equipped)) : ''}`);
    const effect = WEAPON_EFFECT_LABEL[weapon.passive];
    if (effect) parts.push(`Effect: ${effect}`);
    return parts.join(' | ');
  }

  if (item.kind === 'ACCESSORY') {
    const acc = item as Accessory;
    const parts: string[] = [];
    const statRow = (label: string, value: number): void => {
      if (value === 0) return;
      parts.push(`${label}: ${signed(value)}`);
    };
    statRow('DEF', accessoryDefBonus(acc));
    statRow('Max HP', accessoryHpBonus(acc));
    statRow('ATK', accessoryAtkBonus(acc));
    statRow('Max Stamina', accessoryStamBonus(acc));
    const effect = ACCESSORY_EFFECT_LABEL[acc.passive];
    if (effect) parts.push(`Effect: ${effect}`);
    return parts.length ? parts.join(' | ') : null;
  }

  if (item.kind === 'CONSUMABLE') {
    const consumable = item as Consumable;
    return CONSUMABLE_EFFECT_TEXT[consumable.effect]?.(consumable.value) ?? null;
  }

  if (item.kind === 'POTION') {
    switch (item.effect) {
      case 'heal_percent_max':
        return `Heals: ${item.value}% Max HP | Cost: 0-1 Turns`;
      case 'heal_percent_max_cleanse':
        return `Heals: ${item.value}% Max HP | Effect: Cleanses Status | Cost: 0-1 Turns`;
      case 'permanent_max_hp': {
        const fixedCost = POTION_FIXED_TURN_COST[item.name];
        return `Max HP: +${item.value} (Permanent) | Cost: ${fixedCost ?? 0} Turns`;
      }
      default: {
        const heal = item.value >= 100 ? 'Full' : `${item.value}`;
        return `Heals: ${heal} HP | Cost: 0-1 Turns`;
      }
    }
  }

  if (item.kind === 'TIME_SHARD') {
    return `Turns: +${item.value} (current floor)`;
  }

  // 'ANCHOR'
  return 'Effect: Unlocks Biome Shortcut';
}

function useLabelForItem(item: Item): string {
  if (item.kind === 'WEAPON' || item.kind === 'ACCESSORY') return 'Equip';
  if (item.kind === 'POTION') return 'Use Potion';
  return 'Use';
}

/** Renders item detail panel. */
function renderItemDetail(state: GameState, item: Item | undefined): string {
  if (!item) return '<div class="item-detail item-detail-empty">Tap an item below to see its effect.</div>';
  const lore = loreForItem(item.name);
  const stat = statBlockForItem(state, item);
  const countBadge = item.count && item.count > 1 ? ` <span class="item-count">x${item.count}</span>` : '';
  const meltTotal = itemMeltValue(item) * (item.count && item.count > 1 ? item.count : 1);
  const stashBtn =
    item.kind === 'WEAPON' && state.persistent.weaponSlot2Unlocked
      ? '<button data-action="stash-weapon">Stash (Slot 2)</button>'
      : '';
  return `
    <div class="item-detail">
      <div class="item-detail-header">
        <span class="item-detail-icon" style="${iconStyleForItem(item, DETAIL_ICON_SIZE)}"></span>
        <div class="item-detail-heading">
          <div class="item-detail-name">${item.name}${countBadge}</div>
          ${stat ? `<div class="item-detail-stat">${stat}</div>` : ''}
        </div>
      </div>
      ${lore ? `<div class="item-detail-lore">${lore}</div>` : ''}
      <div class="item-detail-actions">
        <button data-action="use-selected">${useLabelForItem(item)}</button>
        ${stashBtn}
        <button class="melt-btn" data-action="melt-selected">Melt (+${meltTotal})</button>
      </div>
    </div>`;
}

/** Renders relic detail panel. */
function renderRelicDetail(effect: string | null): string {
  if (!effect) return '<div class="item-detail item-detail-empty">Tap a Chronofact below to see its effect.</div>';
  const ref = RELIC_SPRITE_BY_EFFECT[effect] ?? SPRITES.RELIC;
  const stat = relicEffectText(effect);
  const lore = relicLore(effect);
  return `
    <div class="item-detail">
      <div class="item-detail-header">
        <span class="item-detail-icon" style="${spriteCssStyle(ref, DETAIL_ICON_SIZE)}"></span>
        <div class="item-detail-heading">
          <div class="item-detail-name">${relicName(effect)}</div>
          ${stat ? `<div class="item-detail-stat">${stat}</div>` : ''}
        </div>
      </div>
      <div class="item-detail-lore">${lore ?? ''}</div>
      <div class="item-detail-actions"></div>
    </div>`;
}

/** Renders one weapon/accessory equip-slot row. */
function renderGearSlot(
  state: GameState,
  label: string,
  item: Weapon | Accessory | null,
  unequipAction: string,
): string {
  const lore = item ? loreForItem(item.name) : undefined;
  const stat = item ? statBlockForItem(state, item) : undefined;
  const titleAttr = lore ? ` title="${lore.replace(/"/g, '&quot;')}"` : '';
  return `
    <div class="equip-slot-wrap">
      <button class="equip-slot${item ? ' equipped' : ''}" data-action="${unequipAction}"${titleAttr}>${label}: ${item ? item.name : 'None'}${item ? ' <span class="equipped-badge">EQUIPPED</span>' : ''}</button>
      ${stat ? `<div class="equip-stat">${stat}</div>` : ''}
      ${lore ? `<div class="equip-lore">${lore}</div>` : ''}
    </div>`;
}

/** Renders Status tab. */
function renderStatusTab(state: GameState): string {
  const { run, persistent } = state;
  const danger = isThreatNearby(state);

  const weaponSlots = renderGearSlot(state, 'Weapon', run.equippedWeapon, 'unequip-weapon') +
    (persistent.weaponSlot2Unlocked
      ? renderGearSlot(state, 'Weapon (Slot 2)', run.equippedWeapon2, 'unequip-weapon2') +
        `<button class="swap-weapon-btn" data-action="swap-weapon" ${!run.equippedWeapon && !run.equippedWeapon2 ? 'disabled' : ''}>Swap Active Weapon</button>`
      : '');

  const accessorySlots =
    renderGearSlot(state, 'Accessory', run.equippedAccessory, 'unequip-accessory-1') +
    (persistent.accessorySlot2Unlocked ? renderGearSlot(state, 'Accessory (Slot 2)', run.equippedAccessory2, 'unequip-accessory-2') : '') +
    (persistent.accessorySlot3Unlocked ? renderGearSlot(state, 'Accessory (Slot 3)', run.equippedAccessory3, 'unequip-accessory-3') : '');

  return `
    <div class="menu-tab-body">
      <div class="stat-line">HP: ${run.currentHp}/${run.maxHp}</div>
      <div class="stat-line">Stamina: ${run.currentStamina}/${run.maxStamina}</div>
      <div class="stat-line">Turns Remaining: ${run.turnsRemaining}</div>
      <div class="stat-line">Total ATK: ${totalAtk(state)}</div>
      <div class="stat-line">Total DEF: ${totalDef(state)}${run.braced ? ' (Braced)' : ''}</div>
      <div class="stat-line">Status: ${run.status === 'NONE' ? 'Normal' : run.status}</div>
      ${weaponSlots}
      ${accessorySlots}
      ${danger ? '<div class="danger-banner">DANGER — actions cost 1 turn</div>' : ''}
    </div>`;
}

/** Renders Inventory tab. */
function renderInventoryTab(state: GameState): string {
  const { run } = state;
  if (selectedInvIndex !== null && !run.inventory[selectedInvIndex]) selectedInvIndex = null;

  const slots = Array.from({ length: INVENTORY_CAP }, (_, i) => run.inventory[i]);
  const gridHtml = slots
    .map((item, i) => {
      if (!item) return '<div class="inv-slot empty"></div>';
      const lore = loreForItem(item.name);
      const titleAttr = lore ? ` title="${lore.replace(/"/g, '&quot;')}"` : '';
      const selected = i === selectedInvIndex ? ' selected' : '';
      const countBadge = item.count && item.count > 1 ? `<span class="item-count">x${item.count}</span>` : '';
      return `<button class="inv-slot${selected}" data-action="select-item" data-index="${i}"${titleAttr} aria-label="${item.name}"><span class="item-icon" style="${iconStyleForItem(item, INV_ICON_SIZE)}"></span><span class="slot-name">${item.name}</span>${countBadge}</button>`;
    })
    .join('');

  const selectedItem = selectedInvIndex !== null ? run.inventory[selectedInvIndex] : undefined;

  return `
    <div class="menu-tab-body">
      <div class="inventory-grid">${gridHtml}</div>
      ${renderItemDetail(state, selectedItem)}
    </div>`;
}

/** Chronofacts tab: a grid of held relics + selected-relic detail panel. */
function renderChronofactsTab(state: GameState): string {
  if (selectedRelicEffect !== null && !state.run.relics.includes(selectedRelicEffect)) selectedRelicEffect = null;

  const gridHtml = state.run.relics.length
    ? state.run.relics
        .map((effect) => {
          const ref = RELIC_SPRITE_BY_EFFECT[effect] ?? SPRITES.RELIC;
          const selected = effect === selectedRelicEffect ? ' selected' : '';
          return `<button class="inv-slot${selected}" data-action="select-relic" data-relic="${effect}" aria-label="${relicName(effect)}"><span class="item-icon" style="${spriteCssStyle(ref, INV_ICON_SIZE)}"></span><span class="slot-name">${relicName(effect)}</span></button>`;
        })
        .join('')
    : '<div class="stat-line">No Chronofacts held this run.</div>';

  return `
    <div class="menu-tab-body">
      <div class="inventory-grid">${gridHtml}</div>
      ${renderRelicDetail(selectedRelicEffect)}
    </div>`;
}

const SKILL_SLOTS: readonly SkillSlot[] = ['Q', 'E', 'R', 'F'];

/** Renders every level's effect line, bright for obtained levels, dim for ones not yet reached. */
function renderSkillLevelEffects(skillId: string, level: number): string {
  const effects = SKILL_LEVEL_EFFECTS[skillId as keyof typeof SKILL_LEVEL_EFFECTS];
  return effects
    .map((text, i) => {
      const lvl = i + 1;
      return `<div class="skill-level-effect ${level >= lvl ? 'active' : 'inactive'}">Lv${lvl}: ${text}</div>`;
    })
    .join('');
}

/** Renders Skill detail panel. */
function renderSkillDetail(state: GameState, skillId: string | null): string {
  if (!skillId) return '<div class="item-detail item-detail-empty">Tap a Skill below to see its effect.</div>';
  const skill = SKILLS[skillId];
  const level = state.persistent.skills[skillId] ?? 0;
  const iconStyle = iconStyleForSkill(skillId, DETAIL_ICON_SIZE);
  const effectLines = renderSkillLevelEffects(skillId, level);

  if (level === 0) {
    return `
      <div class="item-detail">
        <div class="item-detail-header">
          <span class="item-detail-icon" style="${iconStyle}"></span>
          <div class="item-detail-heading">
            <div class="item-detail-name">${skill.name}</div>
            <div class="item-detail-stat">LOCKED</div>
          </div>
        </div>
        <div class="item-detail-lore">${effectLines}<div class="skill-level-effect inactive">Unlock in the Upgrade Shop to assign it to a slot.</div></div>
        <div class="item-detail-actions"></div>
      </div>`;
  }

  const slotButtons = SKILL_SLOTS.map((slot) => {
    const isActive = state.run.activeSkills[SLOT_INDEX[slot]] === skillId;
    return `<button data-action="assign-skill" data-skill="${skillId}" data-slot="${slot}" ${isActive ? 'disabled' : ''}>${slot}</button>`;
  }).join('');

  return `
    <div class="item-detail">
      <div class="item-detail-header">
        <span class="item-detail-icon" style="${iconStyle}"></span>
        <div class="item-detail-heading">
          <div class="item-detail-name">${skill.name}</div>
          <div class="item-detail-stat">Lv${level} | ${skill.stamina} Stamina | ${titleCase(skill.element)}</div>
        </div>
      </div>
      <div class="item-detail-lore">${effectLines}</div>
      <div class="item-detail-actions">${slotButtons}</div>
    </div>`;
}

/** Renders Skills tab. */
function renderSkillsTab(state: GameState): string {
  const ids = Object.keys(SKILLS);
  if (selectedSkillId !== null && !ids.includes(selectedSkillId)) selectedSkillId = null;

  const gridHtml = ids
    .map((id) => {
      const skill = SKILLS[id];
      const locked = (state.persistent.skills[id] ?? 0) === 0;
      const selected = id === selectedSkillId ? ' selected' : '';
      const iconStyle = iconStyleForSkill(id, INV_ICON_SIZE);
      return `<button class="inv-slot${locked ? ' locked' : ''}${selected}" data-action="select-skill" data-skill="${id}" aria-label="${skill.name}"><span class="item-icon" style="${iconStyle}"></span><span class="slot-name">${skill.name}</span></button>`;
    })
    .join('');

  const activeLine = SKILL_SLOTS.map((slot) => `${slot}: ${state.run.activeSkills[SLOT_INDEX[slot]] ?? '--'}`).join(' · ');

  return `
    <div class="menu-tab-body">
      <div class="stat-line">Active — ${activeLine}</div>
      <div class="inventory-grid">${gridHtml}</div>
      ${renderSkillDetail(state, selectedSkillId)}
    </div>`;
}

/** Renders Bestiary detail panel. */
function renderBestiaryDetail(kind: EnemyKind | null): string {
  if (!kind) return '<div class="item-detail item-detail-empty">Tap a known enemy below to see its details.</div>';
  const t = BESTIARY[kind];
  return `
    <div class="item-detail">
      <div class="item-detail-header">
        <span class="item-detail-icon" style="${spriteCssStyle(SPRITES[kind], DETAIL_ICON_SIZE)}"></span>
        <div class="item-detail-heading">
          <div class="item-detail-name">${ENEMY_NAME[kind]}</div>
          <div class="item-detail-stat">HP ${t.hp} | ATK ${t.attack} | DEF ${t.defense} | ${titleCase(t.element)}</div>
        </div>
      </div>
      <div class="item-detail-lore">${MONSTER_LORE[kind]}</div>
      <div class="item-detail-actions"></div>
    </div>`;
}

/** Renders Bestiary tab. */
function renderBestiaryTab(state: GameState): string {
  const known = new Set(state.persistent.bestiaryKnown);
  if (selectedBestiaryKind !== null && !known.has(selectedBestiaryKind)) selectedBestiaryKind = null;

  const gridHtml = (Object.keys(ENEMY_NAME) as EnemyKind[])
    .map((kind) => {
      if (!known.has(kind)) {
        return '<div class="inv-slot empty"><span class="slot-name">???</span></div>';
      }
      const selected = kind === selectedBestiaryKind ? ' selected' : '';
      return `<button class="inv-slot${selected}" data-action="select-enemy" data-enemy="${kind}" aria-label="${ENEMY_NAME[kind]}"><span class="item-icon" style="${spriteCssStyle(SPRITES[kind], INV_ICON_SIZE)}"></span><span class="slot-name">${ENEMY_NAME[kind]}</span></button>`;
    })
    .join('');

  return `
    <div class="menu-tab-body">
      <div class="inventory-grid">${gridHtml}</div>
      ${renderBestiaryDetail(selectedBestiaryKind)}
    </div>`;
}

// Current-level bonus math for each Stat Track's detail line (Section 7's per-level amounts).
const STAT_TRACK_UNIT: Record<StatTrack, { perLevel: number; suffix: string }> = {
  maxHpUpgrade: { perLevel: 5, suffix: 'HP' },
  maxStamUpgrade: { perLevel: 2, suffix: 'Stamina' },
  turnBonusUpgrade: { perLevel: 5, suffix: 'Turns' },
  baseAtkUpgrade: { perLevel: 1, suffix: 'ATK' },
};

/** Renders Upgrade Shop detail panel. */
function renderShopDetail(state: GameState): string {
  if (selectedStatTrack) {
    const track = selectedStatTrack;
    const { label } = STAT_TRACKS.find((t) => t.track === track)!;
    const level = state.persistent[track];
    const cost = statTrackCost(state, track);
    const maxed = cost === null;
    const disabled = maxed || state.persistent.echoes < (cost ?? 0);
    const { perLevel, suffix } = STAT_TRACK_UNIT[track];
    const currentBonus = level > 0 ? ` +${level * perLevel} ${suffix}` : '';
    return `
      <div class="item-detail">
        <div class="item-detail-header">
          <span class="item-detail-icon" style="${spriteCssStyle(STAT_TRACK_SPRITE[track], DETAIL_ICON_SIZE)}"></span>
          <div class="item-detail-heading">
            <div class="item-detail-name">${shortStatLabel(label)}</div>
            <div class="item-detail-stat">Lv${level}${currentBonus}${maxed ? ' (MAX)' : ''}</div>
          </div>
        </div>
        <div class="item-detail-lore">${label}</div>
        <div class="item-detail-actions">
          <button data-action="buy-stat" data-track="${track}" ${disabled ? 'disabled' : ''}>${maxed ? 'MAX' : `Buy (${cost})`}</button>
        </div>
      </div>`;
  }

  if (selectedShopSkillId) {
    const id = selectedShopSkillId;
    const skill = SKILLS[id];
    const level = skillLevel(state, id);
    const cost = skillCost(state, id);
    const maxed = cost === null;
    const disabled = maxed || state.persistent.echoes < (cost ?? 0);
    const buyLabel = maxed ? 'MAX' : level === 0 ? `Unlock (${cost})` : `Upgrade (${cost})`;
    const effectLines = renderSkillLevelEffects(id, level);
    return `
      <div class="item-detail">
        <div class="item-detail-header">
          <span class="item-detail-icon" style="${iconStyleForSkill(id, DETAIL_ICON_SIZE)}"></span>
          <div class="item-detail-heading">
            <div class="item-detail-name">${skill.name}</div>
            <div class="item-detail-stat">${level === 0 ? 'Locked' : `Lv${level}${maxed ? ' (MAX)' : ''}`}</div>
          </div>
        </div>
        <div class="item-detail-lore">${effectLines}</div>
        <div class="item-detail-actions">
          <button data-action="buy-skill" data-skill="${id}" ${disabled ? 'disabled' : ''}>${buyLabel}</button>
        </div>
      </div>`;
  }

  if (selectedUpgradeId) {
    const upgrade = ONE_TIME_UPGRADES.find((u) => u.id === selectedUpgradeId)!;
    const owned = state.persistent[upgrade.flag];
    const available = oneTimeUpgradeAvailable(state, upgrade);
    const disabled = owned || !available || state.persistent.echoes < upgrade.cost;
    const buyLabel = owned ? 'OWNED' : !available ? 'LOCKED' : `Buy (${upgrade.cost})`;
    const status = owned ? 'OWNED' : !available ? 'Requires Second Accessory Slot' : `Cost: ${upgrade.cost} Echoes`;
    return `
      <div class="item-detail">
        <div class="item-detail-header">
          <span class="item-detail-icon" style="${spriteCssStyle(UPGRADE_ICON[upgrade.id], DETAIL_ICON_SIZE)}"></span>
          <div class="item-detail-heading">
            <div class="item-detail-name">${upgrade.label}</div>
            <div class="item-detail-stat">${status}</div>
          </div>
        </div>
        <div class="item-detail-lore">Permanent — carries across every loop reset.</div>
        <div class="item-detail-actions">
          <button data-action="buy-upgrade" data-upgrade="${upgrade.id}" ${disabled ? 'disabled' : ''}>${buyLabel}</button>
        </div>
      </div>`;
  }

  return '<div class="item-detail item-detail-empty">Tap a Stat, Skill, or Upgrade below to see its cost.</div>';
}

function shortStatLabel(label: string): string {
  return label.split(' (')[0];
}

function renderUpgradeShop(state: GameState): string {
  const statGridHtml = STAT_TRACKS.map(({ track, label }) => {
    const selected = track === selectedStatTrack ? ' selected' : '';
    const iconStyle = spriteCssStyle(STAT_TRACK_SPRITE[track], INV_ICON_SIZE);
    return `<button class="inv-slot${selected}" data-action="select-stat" data-track="${track}" aria-label="${label}"><span class="item-icon" style="${iconStyle}"></span><span class="slot-name">${shortStatLabel(label)}</span></button>`;
  }).join('');

  const skillGridHtml = Object.keys(SKILLS)
    .map((id) => {
      const skill = SKILLS[id];
      const selected = id === selectedShopSkillId ? ' selected' : '';
      const iconStyle = iconStyleForSkill(id, INV_ICON_SIZE);
      return `<button class="inv-slot${selected}" data-action="select-shop-skill" data-skill="${id}" aria-label="${skill.name}"><span class="item-icon" style="${iconStyle}"></span><span class="slot-name">${skill.name}</span></button>`;
    })
    .join('');

  const continueLabel =
    state.run.currentFloor === HUB_FLOOR ? 'Close' : `Continue — Loop ${state.persistent.loopCount + 1}`;

  const upgradeGridHtml = ONE_TIME_UPGRADES.map((u) => {
    const owned = state.persistent[u.flag];
    const available = oneTimeUpgradeAvailable(state, u);
    const selected = u.id === selectedUpgradeId ? ' selected' : '';
    const iconStyle = spriteCssStyle(UPGRADE_ICON[u.id], INV_ICON_SIZE);
    return `<button class="inv-slot${owned || !available ? ' locked' : ''}${selected}" data-action="select-upgrade" data-upgrade="${u.id}" aria-label="${u.label}"><span class="item-icon" style="${iconStyle}"></span><span class="slot-name">${u.label}</span></button>`;
  }).join('');

  return `
    <div class="menu upgrade-shop">
      <h2>Upgrade Shop</h2>
      <div class="stat-line">Echoes: ${state.persistent.echoes}</div>
      <div class="upgrade-shop-scroll">
        <h3>Stats</h3>
        <div class="inventory-grid shop-stat-grid">${statGridHtml}</div>
        <h3>Upgrades</h3>
        <div class="inventory-grid shop-stat-grid">${upgradeGridHtml}</div>
        <h3>Skills</h3>
        <div class="inventory-grid shop-stat-grid">${skillGridHtml}</div>
      </div>
      ${renderShopDetail(state)}
      <button class="continue-btn" data-action="shop-continue">${continueLabel}</button>
      <button class="new-game-btn" data-action="new-game">New Game (wipe save)</button>
      <div class="menu-hint">Esc: continue</div>
    </div>`;
}

/** Renders Shortcut Gate picker. */
function renderShortcutGate(state: GameState): string {
  const rows = gateDestinations(state)
    .map((floor) => {
      const label = floor === 1 ? 'Floor 1 — start of the Descent' : `Floor ${floor} — anchored Biome start`;
      return `
        <div class="shop-row">
          <span class="shop-name">${label}</span>
          <button data-action="warp" data-floor="${floor}">Warp</button>
        </div>`;
    })
    .join('');

  return `
    <div class="menu shortcut-gate-menu">
      <h2>Shortcut Gate</h2>
      <div class="stat-line">Starts a fresh run: starter gear, full HP/Stamina, full timer.</div>
      ${rows}
      <button class="continue-btn close-btn" data-action="close-menu">Cancel</button>
      <div class="menu-hint">Esc: cancel</div>
    </div>`;
}

/** Renders Cursed Rift modal. */
function renderCursedRift(): string {
  return `
    <div class="menu cursed-rift-menu">
      <h2>A Dark Presence Demands a Sacrifice...</h2>
      <div class="stat-line">"Sacrifice 20 Max HP for a random Relic."</div>
      <button class="rift-accept-btn" data-action="rift-accept">ACCEPT PACT</button>
      <button class="rift-decline-btn" data-action="rift-decline">DECLINE &amp; LEAVE</button>
      <div class="menu-hint">Esc: decline</div>
    </div>`;
}

/** Resolves the pact. */
function resolveRiftPact(state: GameState, accept: boolean): void {
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;
  if (accept) {
    state.run.maxHp = Math.max(1, state.run.maxHp - 20);
    state.run.currentHp = Math.min(state.run.currentHp, state.run.maxHp);
    const relic = pickRandomUnheldRelic(state.run.relics);
    if (relic) {
      state.run.relics.push(relic);
      logLine(state, `The pact is sealed. Chronofact acquired: ${relicName(relic)}!`);
    } else {
      awardEchoes(state, 25, 'Cursed Rift (all Relics held)');
      logLine(state, 'The pact is sealed, but every Chronofact is already yours — +25 Echoes instead.');
    }
  } else {
    logLine(state, 'You step back from the Rift, pact undone.');
  }
  state.ui.currentScreen = 'GAME';
  saveGame(state);
}

const HELP_ROWS: readonly [string, string, string][] = [
  ['W/A/S/D or Arrows', 'Move / bump-attack (sets facing)', 'GAME'],
  ['Space', 'Brace / pass turn (+1 DEF until your next turn)', 'GAME'],
  ['Q / E / R / F', 'Use the mapped skill toward facing', 'GAME'],
  ['U', 'Open Menu -> Status tab (or close, if already there)', 'GAME, MENU'],
  ['I / Tab', 'Open Menu -> Inventory tab (or close, if already there)', 'GAME, MENU'],
  ['K', 'Open Menu -> Skill tab (or close, if already there)', 'GAME, MENU'],
  ['? / F1', 'Open Menu -> Settings & Help tab (or close, if already there)', 'any screen'],
  ['M', 'Toggle mute', 'any screen'],
  ['[ / ]', 'Master volume down/up', 'any screen'],
  ['Esc', 'Close the current overlay', 'MENU, UPGRADE_SHOP, SHORTCUT_GATE, CURSED_RIFT, CONFIRM'],
  ['Click', 'Switch tabs, select/use/melt an item, unequip gear, assign a skill, buy an upgrade', 'MENU, UPGRADE_SHOP'],
  ['Walk into a Hub tile', 'Open the Shop Terminal or Shortcut Gate', 'GAME (Hub only)'],
  ['Walk into a Cursed Rift', 'Open the sacrifice-pact modal', 'GAME (procedural floors)'],
  ['Tap a Relic Tray icon', 'Show its name/lore in a tooltip', 'GAME'],
  ['Touch D-Pad/action-pad', 'Mirrors WASD/Space/Q/E/R/F on mobile; STAT/INV/SKL buttons open the Menu directly on that tab', 'any screen'],
];

/** Renders Settings tab. */
function renderSettingsTab(state: GameState): string {
  const rows = HELP_ROWS.map(
    ([key, action, screen]) =>
      `<div class="help-row"><span class="help-key">${key}</span><span class="help-action">${action}</span><span class="help-screen">${screen}</span></div>`,
  ).join('');
  const volumePct = Math.round(getMasterVolume() * 100);
  return `
    <div class="menu-tab-body">
      <h2>Settings</h2>
      <div class="settings-row">
        <button data-action="toggle-mute">${isMuted() ? 'Unmute' : 'Mute'}</button>
        <button data-action="volume-down">-</button>
        <span class="stat-line">Volume: ${isMuted() ? 'Muted' : `${volumePct}%`}</span>
        <button data-action="volume-up">+</button>
      </div>
      <h2 class="dev-tools-heading">Developer Tools</h2>
      <div class="dev-tools-panel">
        <div class="dev-tools-row">
          <label for="dev-warp-floor">Warp to Floor</label>
          <input id="dev-warp-floor" type="number" min="1" max="99" value="1" />
          <button data-action="dev-warp">Warp</button>
        </div>
        <div class="dev-tools-row">
          <button data-action="dev-echoes">+1000 Echoes</button>
          <button data-action="dev-kill">Force Death (Reset/Skip)</button>
        </div>
        <button class="cheat-toggle${state.persistent.cheatModeEnabled ? ' active' : ''}" data-action="toggle-cheat-mode">
          Cheat Mode: ${state.persistent.cheatModeEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <h2>Controls</h2>
      <div class="help-list">${rows}</div>
    </div>`;
}

const TAB_DEFS: readonly { id: MenuTabId; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'inventory', label: 'Inv' },
  { id: 'chronofacts', label: 'Chronofacts' },
  { id: 'skill', label: 'Skill' },
  { id: 'bestiary', label: 'Bestiary' },
  { id: 'settings', label: 'Settings' },
];

/** Renders unified Menu. */
function renderMenu(state: GameState): string {
  const body =
    menuTab === 'status' ? renderStatusTab(state)
    : menuTab === 'inventory' ? renderInventoryTab(state)
    : menuTab === 'chronofacts' ? renderChronofactsTab(state)
    : menuTab === 'skill' ? renderSkillsTab(state)
    : menuTab === 'bestiary' ? renderBestiaryTab(state)
    : renderSettingsTab(state);

  const tabButtons = TAB_DEFS.map(
    ({ id, label }) => `<button class="tab-btn" data-action="menu-tab" data-tab="${id}" ${menuTab === id ? 'disabled' : ''}>${label}</button>`,
  ).join('');

  return `
    <div class="menu unified-menu">
      <div class="tab-row">${tabButtons}</div>
      ${body}
      <button class="continue-btn close-btn" data-action="close-menu">Close</button>
      <div class="menu-hint">I/K/? toggle · Esc: close</div>
    </div>`;
}

function renderTitle(state: GameState): string {
  const continueBtn = hasSave()
    ? '<button class="continue-btn" data-action="title-continue">Continue</button>'
    : '';
  // Render persistent progress.
  const { persistent } = state;
  const hasProgress = persistent.loopCount > 0 || persistent.stats.wins > 0;
  const progress = hasProgress
    ? `
      <div class="stat-line">Loops attempted: ${persistent.loopCount}</div>
      <div class="stat-line">Deepest floor reached: ${persistent.stats.deepestFloor}</div>
      <div class="stat-line">Wins: ${persistent.stats.wins}${persistent.stats.wins > 0 ? ` (best: ${persistent.stats.bestTurnsRemaining} turns to spare)` : ''}</div>
      <div class="stat-line">Echoes banked: ${persistent.echoes}</div>`
    : '';
  return `
    <div class="menu title-menu">
      <h1>Chrono-Keep</h1>
      <div class="stat-line">The 100-Turn Dungeon</div>
      ${progress}
      ${continueBtn}
      <button class="new-game-btn" data-action="new-game">New Game</button>
      <div class="menu-hint">?/F1: Help</div>
    </div>`;
}

function renderDeath(state: GameState): string {
  const fell = state.run.currentHp <= 0;
  const tutorial = isShatteringTutorial(state);
  const heading = tutorial ? 'Timeline Collapse' : fell ? 'You Have Fallen' : 'Time Has Run Out';
  const framing = tutorial
    ? '<div class="stat-line framing">The Hourglass shatters. The time loop begins. You have forgotten your mastery, but you remember your duty.</div>'
    : '';
  return `
    <div class="menu death-menu">
      <h2>${heading}</h2>
      <div class="stat-line">Loop ${state.persistent.loopCount + 1}</div>
      <div class="stat-line">Reached Floor ${state.run.currentFloor}</div>
      <div class="stat-line">Echoes banked: ${state.persistent.echoes}</div>
      ${framing}
      <button class="continue-btn" data-action="death-continue">Return to the Watch Post</button>
    </div>`;
}

function renderVictory(state: GameState): string {
  return `
    <div class="menu victory-menu">
      <h1>Victory</h1>
      <div class="stat-line">The Chrono-Lich unravels. The loop is broken.</div>
      <div class="stat-line">Loops used: ${state.persistent.loopCount + 1}</div>
      <div class="stat-line">Turns remaining: ${state.run.turnsRemaining}</div>
      <div class="stat-line">Total wins: ${state.persistent.stats.wins}</div>
      <button class="continue-btn" data-action="victory-newgameplus">New Game+ (keep upgrades, tougher foes)</button>
      <button class="new-game-btn" data-action="new-game">Full Reset</button>
    </div>`;
}

function renderConfirm(): string {
  if (!pendingConfirm) return '';
  return `
    <div class="menu confirm-menu">
      <div class="confirm-message">${pendingConfirm.message}</div>
      <button class="continue-btn" data-action="confirm-yes">Proceed</button>
      <button class="new-game-btn" data-action="confirm-no">Cancel</button>
    </div>`;
}

/** Rebuilds the overlay for the current screen; clears it outside menus. */
const ALL_SCREENS = new Set<GameState['ui']['currentScreen']>([
  'TITLE',
  'GAME',
  'MENU',
  'UPGRADE_SHOP',
  'SHORTCUT_GATE',
  'CURSED_RIFT',
  'CONFIRM',
  'DEATH',
  'VICTORY',
]);

function render(state: GameState): void {
  const el = screenEl();
  const screen = state.ui.currentScreen;
  const isOpen = screen !== 'GAME';
  el.classList.toggle('active', isOpen);
  // Reset selection on fresh menu open.
  if (screen === 'MENU' && lastScreen !== 'MENU') {
    selectedInvIndex = null;
    selectedRelicEffect = null;
    selectedSkillId = null;
    selectedBestiaryKind = null;
  }
  if (screen === 'UPGRADE_SHOP' && lastScreen !== 'UPGRADE_SHOP') {
    selectedStatTrack = null;
    selectedShopSkillId = null;
    selectedUpgradeId = null;
  }
  if (screen === 'TITLE') el.innerHTML = renderTitle(state);
  else if (screen === 'MENU') el.innerHTML = renderMenu(state);
  else if (screen === 'UPGRADE_SHOP') el.innerHTML = renderUpgradeShop(state);
  else if (screen === 'SHORTCUT_GATE') el.innerHTML = renderShortcutGate(state);
  else if (screen === 'CURSED_RIFT') el.innerHTML = renderCursedRift();
  else if (screen === 'CONFIRM') el.innerHTML = renderConfirm();
  else if (screen === 'DEATH') el.innerHTML = renderDeath(state);
  else if (screen === 'VICTORY') el.innerHTML = renderVictory(state);
  else el.innerHTML = '';
  lastScreen = screen;
}

/** Wires keyboard shortcuts and clicks on the overlay. */
export function initMenus(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    const screen = state.ui.currentScreen;
    if (!ALL_SCREENS.has(screen)) return;
    const key = ev.key.toLowerCase();

    if (key === '?' || key === 'f1') {
      ev.preventDefault();
      openMenuTab(state, 'settings');
      render(state);
    } else if ((key === 'i' || key === 'tab') && (screen === 'GAME' || screen === 'MENU')) {
      ev.preventDefault();
      openMenuTab(state, 'inventory');
      render(state);
    } else if (key === 'k' && (screen === 'GAME' || screen === 'MENU')) {
      ev.preventDefault();
      openMenuTab(state, 'skill');
      render(state);
    } else if (key === 'u' && (screen === 'GAME' || screen === 'MENU')) {
      ev.preventDefault();
      openMenuTab(state, 'status');
      render(state);
    } else if (
      key === 'escape' &&
      (screen === 'MENU' ||
        screen === 'UPGRADE_SHOP' ||
        screen === 'SHORTCUT_GATE' ||
        screen === 'CURSED_RIFT' ||
        screen === 'CONFIRM')
    ) {
      ev.preventDefault();
      if (screen === 'CONFIRM') answerPendingConfirm(state, false);
      else if (screen === 'CURSED_RIFT') resolveRiftPact(state, false);
      else state.ui.currentScreen = 'GAME';
      render(state);
    }
  });

  screenEl().addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const { action, index, skill, slot, track, tab, floor, relic, enemy, upgrade } = target.dataset;

    if (action === 'select-item') selectedInvIndex = Number(index);
    else if (action === 'menu-tab') menuTab = (tab as MenuTabId) ?? 'status';
    else if (action === 'select-relic') selectedRelicEffect = relic ?? null;
    else if (action === 'select-skill') selectedSkillId = skill ?? null;
    else if (action === 'select-enemy') selectedBestiaryKind = (enemy as EnemyKind) ?? null;
    else if (action === 'select-stat') {
      selectedStatTrack = (track as StatTrack) ?? null;
      selectedShopSkillId = null;
      selectedUpgradeId = null;
    } else if (action === 'select-shop-skill') {
      selectedShopSkillId = skill ?? null;
      selectedStatTrack = null;
      selectedUpgradeId = null;
    } else if (action === 'select-upgrade') {
      selectedUpgradeId = (upgrade as OneTimeUpgradeId) ?? null;
      selectedStatTrack = null;
      selectedShopSkillId = null;
    }
    else if (action === 'use-selected' && selectedInvIndex !== null) {
      const item = state.run.inventory[selectedInvIndex];
      if (item?.kind === 'WEAPON' || item?.kind === 'ACCESSORY') equipItem(state, selectedInvIndex);
      else if (item?.kind === 'POTION') usePotion(state, selectedInvIndex);
      else if (item?.kind === 'CONSUMABLE') useConsumable(state, selectedInvIndex);
      reselectAfterConsume(state, selectedInvIndex);
    } else if (action === 'stash-weapon' && selectedInvIndex !== null) {
      equipWeaponSlot2(state, selectedInvIndex);
      reselectAfterConsume(state, selectedInvIndex);
    } else if (action === 'melt-selected' && selectedInvIndex !== null) {
      meltItem(state, selectedInvIndex);
      reselectAfterConsume(state, selectedInvIndex);
    } else if (action === 'unequip-weapon') unequipWeapon(state);
    else if (action === 'unequip-weapon2') unequipWeapon2(state);
    else if (action === 'swap-weapon') swapActiveWeapon(state);
    else if (action === 'unequip-accessory-1') unequipAccessorySlot(state, 1);
    else if (action === 'unequip-accessory-2') unequipAccessorySlot(state, 2);
    else if (action === 'unequip-accessory-3') unequipAccessorySlot(state, 3);
    else if (action === 'toggle-cheat-mode') {
      state.persistent.cheatModeEnabled = !state.persistent.cheatModeEnabled;
      logLine(state, `Cheat Mode: ${state.persistent.cheatModeEnabled ? 'ON' : 'OFF'}.`);
      saveGame(state);
    }
    else if (action === 'assign-skill') assignSkill(state, skill!, slot as SkillSlot);
    else if (action === 'toggle-mute') {
      toggleMuted();
      saveAudioSettings({ volume: getMasterVolume(), muted: isMuted() });
    } else if (action === 'volume-down' || action === 'volume-up') {
      setMasterVolume(getMasterVolume() + (action === 'volume-up' ? 0.1 : -0.1));
      saveAudioSettings({ volume: getMasterVolume(), muted: isMuted() });
    }
    else if (action === 'buy-stat') buyStatUpgrade(state, track as StatTrack);
    else if (action === 'buy-skill') buySkillUpgrade(state, skill!);
    else if (action === 'buy-upgrade') buyOneTimeUpgrade(state, upgrade as OneTimeUpgradeId);
    else if (action === 'warp') warpFromGate(state, Number(floor));
    else if (action === 'shop-continue') state.ui.currentScreen = 'GAME';
    else if (action === 'new-game') startNewGame(state);
    else if (action === 'title-continue') continueSave(state);
    else if (action === 'death-continue') continueAfterDeath(state);
    else if (action === 'victory-newgameplus') startNewGamePlus(state);
    else if (action === 'confirm-yes') answerPendingConfirm(state, true);
    else if (action === 'confirm-no') answerPendingConfirm(state, false);
    else if (action === 'rift-accept') resolveRiftPact(state, true);
    else if (action === 'rift-decline') resolveRiftPact(state, false);
    else if (action === 'close-menu') state.ui.currentScreen = 'GAME';
    else if (action === 'dev-warp') devWarp(state);
    else if (action === 'dev-echoes') devAddEchoes(state);
    else if (action === 'dev-kill') devForceDeath(state);

    render(state);
  });
}

/** Reacts to screen transitions. */
export function updateMenus(state: GameState): void {
  if (state.ui.currentScreen !== lastScreen) render(state);
}
