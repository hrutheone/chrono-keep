// Inventory, Skill, Upgrade Shop & Help screens: HTML overlays in
// #screen-overlay. Opening/browsing is always free; src/inventory.ts and
// src/shop.ts own the turn-cost/spend rules for actions dispatched here.
// Re-rendered only on screen transitions and right after a menu action —
// never on a per-frame timer — so DOM nodes stay stable between interactions.

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
import { continueAfterDeath } from './turnController';
import { logLine } from './turns';
import { awardEchoes } from './echoes';
import { resetRunForNewLoop, resetToNewGame, rerollSeedKeepProgress } from './state';
import { getMasterVolume, isMuted, playNewGameSfx, playWarpSfx, setMasterVolume, toggleMuted } from './audio';
import {
  buySkillUpgrade,
  buyStatUpgrade,
  skillCost,
  skillLevel,
  STAT_TRACKS,
  statTrackCost,
  type StatTrack,
} from './shop';
import {
  INVENTORY_CAP,
  accessoryAtkBonus,
  accessoryDefBonus,
  accessoryHpBonus,
  accessoryStamBonus,
  equipItem,
  meltItem,
  isThreatNearby,
  totalAtk,
  totalDef,
  unequipAccessory,
  unequipWeapon,
  usePotion,
  weaponDefBonus,
  weaponHpBonus,
} from './inventory';
import { useConsumable } from './consumables';
import type { EnemyKind, SkillId } from './content';
import type { Accessory, Consumable, GameState, Item, Weapon } from './types';

// Tile-icon Inventory: every individual Weapon/Accessory/Potion/Consumable
// has its own sprite (sprites.ts's *_SPRITE_BY_NAME, keyed by Item.name) —
// a slot reads as "the Rusty Sword" at a glance, not just "a weapon". Falls
// back to one shared icon per Item.kind (SPRITES.WEAPON/etc., matching the
// icon world-dropped items render with — render.ts's WORLD_ITEM_REFS) only
// for a kind with no per-name art at all (ANCHOR/TIME_SHARD/RELIC — each of
// those is really only ever one specific item already).
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

// Tapping a grid slot selects it (shows detail with explicit action
// buttons) instead of acting instantly — a stray tap can't cost the player
// gear or a consumable. Reset whenever the Menu is (re)entered, in render().
let selectedInvIndex: number | null = null;

// Chronofacts tab: same tap-to-select-then-see-detail shape as the Bag grid,
// but relics have no Use/Melt action of their own.
let selectedRelicEffect: string | null = null;

// Skill/Bestiary tab grids: same tap-to-select-then-see-detail shape.
let selectedSkillId: string | null = null;
let selectedBestiaryKind: EnemyKind | null = null;

// Upgrade Shop grids: mutually exclusive with each other (selecting one
// clears the other) since both share the single detail/action panel below.
let selectedStatTrack: StatTrack | null = null;
let selectedShopSkillId: string | null = null;

// A styled overlay standing in for window.confirm(). `returnScreen` is
// captured at call time so Cancel goes back to wherever the confirmation
// was triggered from.
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

/** Answers the current confirm overlay programmatically — for callers with no
 * real DOM to click Proceed/Cancel on (e.g. `scripts/simulate.ts`). A no-op
 * if nothing is pending. */
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

/** Opens the unified Menu on a specific tab — or, if it's already open on
 * that exact tab, closes it (the same keyboard shortcut toggles closed,
 * matching the old per-screen toggleScreen behavior). Switching to a
 * DIFFERENT tab while the Menu is already open never closes it. */
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

/** Small Improvements: also writes into `persistent.skillLoadout` so the
 * assignment survives the next loop reset instead of only living on `run`. */
function assignSkill(state: GameState, skillId: string, slot: SkillSlot): void {
  const idx = SLOT_INDEX[slot];
  state.run.activeSkills[idx] = skillId;
  state.persistent.skillLoadout[idx] = skillId;
  saveGame(state);
}

/** Rerolls the seed and wipes `persistent`; confirmed since it's destructive
 * to any saved progress. Lands in the Hub — the Shortcut Gate there is what
 * actually starts the run. */
function startNewGame(state: GameState): void {
  showConfirm(state, 'Start a New Game? This rerolls the dungeon and wipes all permanent progress.', () => {
    clearSave();
    // A stale run snapshot points at floor layouts from the OLD seed —
    // cleared rather than overwritten so a reload before the next move
    // can't resume into a dungeon that doesn't match the fresh seed below.
    clearRunSnapshot();
    resetToNewGame(state);
    enterHub(state);
    state.ui.currentScreen = 'GAME';
    playNewGameSfx();
    saveGame(state);
  });
}

/** Resumes the loaded save at the Hub — `run` is already a fresh loop's
 * worth of state (only `persistent` is ever saved). */
function continueSave(state: GameState): void {
  enterHub(state);
  state.ui.currentScreen = 'GAME';
  saveGame(state);
  // Reaching TITLE means boot found no resumable run snapshot — write one
  // now so a reload right after Continue still resumes into GAME.
  saveRunSnapshot(state);
}

/** A fresh dungeon, every permanent upgrade kept, enemies scaled up a notch,
 * and `unlockedAnchors` wiped so re-anchoring is the NG+ challenge. */
function startNewGamePlus(state: GameState): void {
  state.persistent.ngPlusLevel += 1;
  state.persistent.unlockedAnchors = [];
  rerollSeedKeepProgress(state);
  resetRunForNewLoop(state);
  enterHub(state);
  state.ui.currentScreen = 'GAME';
  playNewGameSfx();
  saveGame(state);
  // Write the fresh (new-seed) run immediately, replacing any pre-NG+
  // snapshot — otherwise a reload before the first move would resume a
  // stale run on top of a dungeon generated from a seed it doesn't match.
  saveRunSnapshot(state);
}

/** Warps into a fresh run at the chosen floor and returns straight to
 * GAME — no shop stop. */
function warpFromGate(state: GameState, floor: number): void {
  warpToFloor(state, floor);
  state.ui.currentScreen = 'GAME';
  playWarpSfx();
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** A signed (▲/▼) delta suffix — '' when there's nothing to show. */
function deltaMarker(delta: number): string {
  if (delta === 0) return '';
  const arrow = delta > 0 ? '▲' : '▼';
  return ` (${arrow} ${delta > 0 ? '+' : ''}${delta})`;
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`;
}

/** A pipe-separated stat line (stats, then Element, then Effect) shown above
 * an item's lore. Weapons/accessories append a (▲/▼) comparison marker
 * against whatever's currently equipped in that slot. */
function statBlockForItem(state: GameState, item: Item): string | null {
  const { run } = state;

  if (item.kind === 'WEAPON') {
    const weapon = item as Weapon;
    const equipped = run.equippedWeapon;
    const comparing = equipped !== null && equipped.id !== weapon.id;
    const atkPart = `ATK: ${weapon.atk}${comparing ? deltaMarker(weapon.atk - equipped!.atk) : ''}`;
    const parts = [atkPart, `Element: ${titleCase(weapon.element)}`];
    // Phase 18: a few weapons (Bone Club/Defender, Apocalypse) also carry a
    // DEF/Max HP modifier while equipped, on top of their ATK/Element/Effect.
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
    const equipped = run.equippedAccessory;
    const comparing = equipped !== null && equipped.id !== acc.id;
    const parts: string[] = [];
    const statRow = (label: string, value: number, bonusOf: (a: Accessory | null) => number): void => {
      if (value === 0) return;
      parts.push(`${label}: ${signed(value)}${comparing ? deltaMarker(value - bonusOf(equipped)) : ''}`);
    };
    statRow('DEF', accessoryDefBonus(acc), accessoryDefBonus);
    statRow('Max HP', accessoryHpBonus(acc), accessoryHpBonus);
    statRow('ATK', accessoryAtkBonus(acc), accessoryAtkBonus);
    statRow('Max Stamina', accessoryStamBonus(acc), accessoryStamBonus);
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

/** Mobile Inventory rework: the detail panel for whichever grid slot is
 * currently selected (or a placeholder hint if none is) — one fixed-height
 * region instead of per-slot lore text, which is what was inflating the grid
 * past the viewport and pushing the Close button out of reach. */
function renderItemDetail(state: GameState, item: Item | undefined): string {
  if (!item) return '<div class="item-detail item-detail-empty">Tap an item below to see its effect.</div>';
  const lore = loreForItem(item.name);
  const stat = statBlockForItem(state, item);
  const countBadge = item.count && item.count > 1 ? ` <span class="item-count">x${item.count}</span>` : '';
  const meltTotal = itemMeltValue(item) * (item.count && item.count > 1 ? item.count : 1);
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
        <button class="melt-btn" data-action="melt-selected">Melt (+${meltTotal})</button>
      </div>
    </div>`;
}

/** Chronofacts tab (Next-Task.md QoL): mirrors renderItemDetail's shape, but
 * for a relic effect-ID string rather than an Item — relics have no Use/Melt
 * action (infinite-stacking passives, never equipped/melted), so the panel
 * is read-only info. */
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

/** Status tab: character sheet — live stats plus currently-equipped gear
 * (with unequip as a convenience action on it). Was Inventory's left pane
 * before the Menu unification split Status out as its own peer tab. */
function renderStatusTab(state: GameState): string {
  const { run } = state;
  const danger = isThreatNearby(state);
  const weaponLore = run.equippedWeapon ? loreForItem(run.equippedWeapon.name) : undefined;
  const accessoryLore = run.equippedAccessory ? loreForItem(run.equippedAccessory.name) : undefined;
  const weaponStat = run.equippedWeapon ? statBlockForItem(state, run.equippedWeapon) : undefined;
  const accessoryStat = run.equippedAccessory ? statBlockForItem(state, run.equippedAccessory) : undefined;

  return `
    <div class="menu-tab-body">
      <div class="stat-line">HP: ${run.currentHp}/${run.maxHp}</div>
      <div class="stat-line">Stamina: ${run.currentStamina}/${run.maxStamina}</div>
      <div class="stat-line">Turns Remaining: ${run.turnsRemaining}</div>
      <div class="stat-line">Total ATK: ${totalAtk(state)}</div>
      <div class="stat-line">Total DEF: ${totalDef(state)}${run.braced ? ' (Braced)' : ''}</div>
      <div class="stat-line">Status: ${run.status === 'NONE' ? 'Normal' : run.status}</div>
      <div class="equip-slot-wrap">
        <button class="equip-slot${run.equippedWeapon ? ' equipped' : ''}" data-action="unequip-weapon"${weaponLore ? ` title="${weaponLore.replace(/"/g, '&quot;')}"` : ''}>Weapon: ${run.equippedWeapon ? run.equippedWeapon.name : 'None'}${run.equippedWeapon ? ' <span class="equipped-badge">EQUIPPED</span>' : ''}</button>
        ${weaponStat ? `<div class="equip-stat">${weaponStat}</div>` : ''}
        ${weaponLore ? `<div class="equip-lore">${weaponLore}</div>` : ''}
      </div>
      <div class="equip-slot-wrap">
        <button class="equip-slot${run.equippedAccessory ? ' equipped' : ''}" data-action="unequip-accessory"${accessoryLore ? ` title="${accessoryLore.replace(/"/g, '&quot;')}"` : ''}>Accessory: ${run.equippedAccessory ? run.equippedAccessory.name : 'None'}${run.equippedAccessory ? ' <span class="equipped-badge">EQUIPPED</span>' : ''}</button>
        ${accessoryStat ? `<div class="equip-stat">${accessoryStat}</div>` : ''}
        ${accessoryLore ? `<div class="equip-lore">${accessoryLore}</div>` : ''}
      </div>
      ${danger ? '<div class="danger-banner">DANGER — actions cost 1 turn</div>' : ''}
    </div>`;
}

/** Inventory tab: the Bag grid + selected-item detail panel. Was Inventory's
 * right pane (in its "Bag" sub-tab) before the Menu unification promoted
 * Chronofacts to a peer top-level tab. */
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

/** Skill tab detail panel — mirrors renderItemDetail's shape (icon/name/stat
 * header, scrollable lore, fixed-height actions row), but the "actions" are
 * the four Q/E/R/F assign buttons instead of Equip/Melt. A locked (Lv0)
 * skill still shows its identity (matching the old row-list's behavior,
 * which named locked skills too) but no assign buttons — the empty
 * `.item-detail-actions` keeps the panel's height identical to an unlocked
 * skill's. */
function renderSkillDetail(state: GameState, skillId: string | null): string {
  if (!skillId) return '<div class="item-detail item-detail-empty">Tap a Skill below to see its effect.</div>';
  const skill = SKILLS[skillId];
  const level = state.persistent.skills[skillId] ?? 0;
  const iconStyle = iconStyleForSkill(skillId, DETAIL_ICON_SIZE);

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
        <div class="item-detail-lore">Unlock this Skill in the Upgrade Shop to assign it to a slot.</div>
        <div class="item-detail-actions"></div>
      </div>`;
  }

  const effect = SKILL_LEVEL_EFFECTS[skillId as keyof typeof SKILL_LEVEL_EFFECTS][level - 1];
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
      <div class="item-detail-lore">${effect}</div>
      <div class="item-detail-actions">${slotButtons}</div>
    </div>`;
}

/** Skill tab: a grid of every Skill (locked ones dimmed, still tappable to
 * see the LOCKED state) + selected-skill detail panel — mirrors Inventory's
 * grid+detail shape instead of the old flat row list. */
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

/** Bestiary tab detail panel — same shape as the other tabs' detail panels;
 * read-only (no actions of its own), so `.item-detail-actions` is rendered
 * empty purely to keep this panel the same fixed height as the others. */
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

/** Bestiary tab: a grid of every known EnemyKind (undiscovered ones render as
 * an inert "???" slot, matching Inventory's non-interactive `.inv-slot.empty`
 * pattern) + selected-enemy detail panel. */
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

/** Upgrade Shop's shared detail/action panel — same shape as the Menu tabs'
 * .item-detail, showing whichever of the Stat/Skill grids below is
 * currently selected (the two are mutually exclusive). */
function renderShopDetail(state: GameState): string {
  if (selectedStatTrack) {
    const track = selectedStatTrack;
    const { label } = STAT_TRACKS.find((t) => t.track === track)!;
    const level = state.persistent[track];
    const cost = statTrackCost(state, track);
    const maxed = cost === null;
    const disabled = maxed || state.persistent.echoes < (cost ?? 0);
    return `
      <div class="item-detail">
        <div class="item-detail-header">
          <span class="item-detail-icon" style="${spriteCssStyle(STAT_TRACK_SPRITE[track], DETAIL_ICON_SIZE)}"></span>
          <div class="item-detail-heading">
            <div class="item-detail-name">${shortStatLabel(label)}</div>
            <div class="item-detail-stat">Lv${level}${maxed ? ' (MAX)' : ''}</div>
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
    const nextEffect = maxed ? 'Fully upgraded.' : SKILL_LEVEL_EFFECTS[id as keyof typeof SKILL_LEVEL_EFFECTS][level];
    return `
      <div class="item-detail">
        <div class="item-detail-header">
          <span class="item-detail-icon" style="${iconStyleForSkill(id, DETAIL_ICON_SIZE)}"></span>
          <div class="item-detail-heading">
            <div class="item-detail-name">${skill.name}</div>
            <div class="item-detail-stat">${level === 0 ? 'Locked' : `Lv${level}${maxed ? ' (MAX)' : ''}`}</div>
          </div>
        </div>
        <div class="item-detail-lore">${nextEffect}</div>
        <div class="item-detail-actions">
          <button data-action="buy-skill" data-skill="${id}" ${disabled ? 'disabled' : ''}>${buyLabel}</button>
        </div>
      </div>`;
  }

  return '<div class="item-detail item-detail-empty">Tap a Stat or Skill below to see its cost.</div>';
}

/** Strips the "(+N/lvl)" suffix STAT_TRACKS' label carries for the shop
 * row — the grid slot/detail heading want just "Max HP", not the full line. */
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

  // Phase 13: this overlay is now also opened mid-loop from the Hub's
  // terminal, where "Continue — Loop N" reads oddly since no loop is ending.
  const continueLabel =
    state.run.currentFloor === HUB_FLOOR ? 'Close' : `Continue — Loop ${state.persistent.loopCount + 1}`;

  return `
    <div class="menu upgrade-shop">
      <h2>Upgrade Shop</h2>
      <div class="stat-line">Echoes: ${state.persistent.echoes}</div>
      <h3>Stats</h3>
      <div class="inventory-grid shop-stat-grid">${statGridHtml}</div>
      <h3>Skills</h3>
      <div class="inventory-grid">${skillGridHtml}</div>
      ${renderShopDetail(state)}
      <button class="continue-btn" data-action="shop-continue">${continueLabel}</button>
      <button class="new-game-btn" data-action="new-game">New Game (wipe save)</button>
      <div class="menu-hint">Esc: continue</div>
    </div>`;
}

/** Hub Shortcut Gate destination picker (Phase 13): Floor 1 plus every
 * unlocked Biome-start Anchor. */
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

/** Cursed Rift's sacrifice-pact modal (Phase 19, Section 8): verbatim GDD
 * title/offer text and two large mobile buttons. */
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

/** Resolves the pact (accept or decline) and clears dungeon.riftX/Y either
 * way — a one-time offer per Rift (types.ts's dungeon.riftX/Y comment). */
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
  ['Touch D-Pad/buttons', 'Mirrors WASD/Space/Q/E/R/F on mobile; one MENU button opens the tabbed Menu', 'any screen'],
];

/** Settings & Help tab: real Mute/Volume controls (previously keyboard-only —
 * M / [ / ] in audio.ts's installAudioControls, with no on-screen widget at
 * all), the Cheat Mode toggle (moved here from Status — a testing/QA setting,
 * not a character stat), and the existing static keybind table. */
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
      <button class="cheat-toggle${state.persistent.cheatModeEnabled ? ' active' : ''}" data-action="toggle-cheat-mode">
        Cheat Mode: ${state.persistent.cheatModeEnabled ? 'ON' : 'OFF'}
      </button>
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

/** The unified Menu (Next-Task.md QoL): one screen, one flat top-level tab
 * row, replacing the old separate Inventory/Skill Menu/Help screens (each of
 * which had grown its own internal sub-tabs — Bag/Chronofacts,
 * Skills/Bestiary). */
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
  // Fun & Feel #4: the screen you see after every death now actually shows
  // the progress that persisted through it.
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
  // Fun & Feel #7: framing for the very first loss on a save — the GDD is
  // explicit a blind first loop isn't meant to be winnable; say so, once.
  const firstLoop = state.persistent.loopCount === 0;
  const framing = firstLoop
    ? '<div class="stat-line framing">Each attempt makes the next stronger. Spend your Echoes wisely — the dungeon remembers.</div>'
    : '';
  return `
    <div class="menu death-menu">
      <h2>${fell ? 'You Have Fallen' : 'Time Has Run Out'}</h2>
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
  // Mobile Inventory rework: start every fresh Menu visit with nothing
  // selected, rather than carrying a stale highlighted slot from last time.
  // menuTab itself is NOT reset here — it's meant to remember whichever
  // section you were last on across opens/closes (openMenuTab explicitly
  // overrides it when a specific keyboard shortcut asks for a specific tab).
  if (screen === 'MENU' && lastScreen !== 'MENU') {
    selectedInvIndex = null;
    selectedRelicEffect = null;
    selectedSkillId = null;
    selectedBestiaryKind = null;
  }
  if (screen === 'UPGRADE_SHOP' && lastScreen !== 'UPGRADE_SHOP') {
    selectedStatTrack = null;
    selectedShopSkillId = null;
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

/** Wires I/TAB (Menu -> Inventory tab), K (Menu -> Skill tab), ?/F1 (Menu ->
 * Settings & Help tab), Escape (close), and clicks on the overlay. */
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
    const { action, index, skill, slot, track, tab, floor, relic, enemy } = target.dataset;

    if (action === 'select-item') selectedInvIndex = Number(index);
    else if (action === 'menu-tab') menuTab = (tab as MenuTabId) ?? 'status';
    else if (action === 'select-relic') selectedRelicEffect = relic ?? null;
    else if (action === 'select-skill') selectedSkillId = skill ?? null;
    else if (action === 'select-enemy') selectedBestiaryKind = (enemy as EnemyKind) ?? null;
    else if (action === 'select-stat') {
      selectedStatTrack = (track as StatTrack) ?? null;
      selectedShopSkillId = null;
    } else if (action === 'select-shop-skill') {
      selectedShopSkillId = skill ?? null;
      selectedStatTrack = null;
    }
    else if (action === 'use-selected' && selectedInvIndex !== null) {
      const item = state.run.inventory[selectedInvIndex];
      if (item?.kind === 'WEAPON' || item?.kind === 'ACCESSORY') equipItem(state, selectedInvIndex);
      else if (item?.kind === 'POTION') usePotion(state, selectedInvIndex);
      else if (item?.kind === 'CONSUMABLE') useConsumable(state, selectedInvIndex);
      selectedInvIndex = null;
    } else if (action === 'melt-selected' && selectedInvIndex !== null) {
      meltItem(state, selectedInvIndex);
      selectedInvIndex = null;
    } else if (action === 'unequip-weapon') unequipWeapon(state);
    else if (action === 'unequip-accessory') unequipAccessory(state);
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

    render(state);
  });
}

/** Per-frame safety net: catches screen transitions triggered outside menus.ts (e.g. loss-reset -> Upgrade Shop). */
export function updateMenus(state: GameState): void {
  if (state.ui.currentScreen !== lastScreen) render(state);
}
