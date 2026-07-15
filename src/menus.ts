// Inventory, Skill Setting, Upgrade Shop & Help screens (GDD Section 8): HTML
// overlays in #screen-overlay. Opening/browsing is always free; src/inventory.ts
// and src/shop.ts own the turn-cost/spend rules for actions dispatched here.
//
// The overlay is only re-rendered on screen transitions and right after a
// menu action — never on a per-frame timer — so DOM nodes (and their click
// listeners/focus) stay stable between user interactions.

import { SKILLS } from './content';
import { enterFloor } from './mapgen';
import { onFloorEntered } from './echoes';
import { clearSave, hasSave, saveGame } from './persistence';
import { continueAfterDeath } from './turnController';
import { resetRunForNewLoop, resetToNewGame, rerollSeedKeepProgress } from './state';
import { getMasterVolume, isMuted, playNewGameSfx } from './audio';
import {
  buySkillUpgrade,
  buyStatUpgrade,
  MAX_SKILL_LEVEL,
  skillCost,
  skillLevel,
  STAT_TRACKS,
  statTrackCost,
  type StatTrack,
} from './shop';
import {
  INVENTORY_CAP,
  equipItem,
  isThreatNearby,
  totalAtk,
  totalDef,
  unequipAccessory,
  unequipWeapon,
  usePotion,
} from './inventory';
import { useConsumable } from './consumables';
import type { GameState } from './types';

type MenuScreen = 'INVENTORY' | 'SKILL_MENU';

let lastScreen: GameState['ui']['currentScreen'] | null = null;

function screenEl(): HTMLElement {
  return document.querySelector<HTMLElement>('#screen-overlay')!;
}

function toggleScreen(state: GameState, screen: MenuScreen): void {
  state.ui.currentScreen = state.ui.currentScreen === screen ? 'GAME' : screen;
}

function assignSkill(state: GameState, skillId: string, slot: 'Q' | 'E'): void {
  state.run.activeSkills[slot === 'Q' ? 0 : 1] = skillId;
}

/** New Game (TITLE, Upgrade Shop, VICTORY's full reset): rerolls the seed and
 * wipes `persistent`; confirmed since it's destructive to any saved progress. */
function startNewGame(state: GameState): void {
  if (!window.confirm('Start a New Game? This rerolls the dungeon and wipes all permanent progress.')) return;
  clearSave();
  resetToNewGame(state);
  enterFloor(state, 1);
  onFloorEntered(state);
  state.ui.currentScreen = 'GAME';
  playNewGameSfx();
  saveGame(state);
}

/** TITLE's Continue: resumes the loaded save on Floor 1 of the current loop. */
function continueSave(state: GameState): void {
  enterFloor(state, 1);
  onFloorEntered(state);
  state.ui.currentScreen = 'GAME';
  saveGame(state);
}

/** VICTORY's New Game+ (Section 7): a fresh dungeon, every permanent upgrade kept. */
function startNewGamePlus(state: GameState): void {
  rerollSeedKeepProgress(state);
  resetRunForNewLoop(state);
  enterFloor(state, 1);
  onFloorEntered(state);
  state.ui.currentScreen = 'UPGRADE_SHOP';
  playNewGameSfx();
  saveGame(state);
}

function renderInventory(state: GameState): string {
  const { run } = state;
  const danger = isThreatNearby(state);

  const slots = Array.from({ length: INVENTORY_CAP }, (_, i) => run.inventory[i]);
  const gridHtml = slots
    .map((item, i) => {
      if (!item) return '<div class="inv-slot empty"></div>';
      const actionable =
        item.kind === 'WEAPON' || item.kind === 'ACCESSORY'
          ? 'equip'
          : item.kind === 'POTION'
            ? 'use-potion'
            : item.kind === 'CONSUMABLE'
              ? 'use-consumable'
              : null;
      const attrs = actionable ? `data-action="${actionable}" data-index="${i}"` : 'disabled';
      return `<button class="inv-slot" ${attrs}>${item.name}</button>`;
    })
    .join('');

  return `
    <div class="menu inventory-menu">
      <div class="menu-pane left-pane">
        <h2>Inventory</h2>
        <div class="stat-line">Total ATK: ${totalAtk(state)}</div>
        <div class="stat-line">Total DEF: ${totalDef(state)}${run.braced ? ' (Braced)' : ''}</div>
        <div class="stat-line">Status: ${run.status === 'NONE' ? 'Normal' : run.status}</div>
        <button class="equip-slot" data-action="unequip-weapon">Weapon: ${run.equippedWeapon ? run.equippedWeapon.name : 'None'}</button>
        <button class="equip-slot" data-action="unequip-accessory">Accessory: ${run.equippedAccessory ? run.equippedAccessory.name : 'None'}</button>
        ${danger ? '<div class="danger-banner">DANGER — actions cost 1 turn</div>' : ''}
      </div>
      <div class="menu-pane right-pane">
        <div class="inventory-grid">${gridHtml}</div>
      </div>
      <div class="menu-hint">I / TAB / Esc: close</div>
    </div>`;
}

function renderSkillMenu(state: GameState): string {
  const rows = Object.entries(SKILLS)
    .map(([id, skill]) => {
      const level = state.persistent.skills[id] ?? 0;
      if (level === 0) return `<div class="skill-row locked">${skill.name} — LOCKED</div>`;
      const isQ = state.run.activeSkills[0] === id;
      const isE = state.run.activeSkills[1] === id;
      return `
        <div class="skill-row">
          <span class="skill-name">${skill.name} (Lv${level}, ${skill.stamina} Stam)</span>
          <button data-action="assign-skill" data-skill="${id}" data-slot="Q" ${isQ ? 'disabled' : ''}>Set Q</button>
          <button data-action="assign-skill" data-skill="${id}" data-slot="E" ${isE ? 'disabled' : ''}>Set E</button>
        </div>`;
    })
    .join('');

  return `
    <div class="menu skill-menu">
      <h2>Skill Setting</h2>
      <div class="skill-list">${rows}</div>
      <div class="stat-line">Active — Q: ${state.run.activeSkills[0] ?? '--'} · E: ${state.run.activeSkills[1] ?? '--'}</div>
      <div class="menu-hint">K / Esc: close</div>
    </div>`;
}

function renderUpgradeShop(state: GameState): string {
  const statRows = STAT_TRACKS.map(({ track, label }) => {
    const level = state.persistent[track];
    const cost = statTrackCost(state, track as StatTrack);
    const maxed = cost === null;
    const disabled = maxed || state.persistent.echoes < cost;
    return `
      <div class="shop-row">
        <span class="shop-name">${label} — Lv${level}${maxed ? ' (MAX)' : ''}</span>
        <button data-action="buy-stat" data-track="${track}" ${disabled ? 'disabled' : ''}>${maxed ? 'MAX' : `Buy (${cost})`}</button>
      </div>`;
  }).join('');

  const skillRows = Object.entries(SKILLS)
    .map(([id, skill]) => {
      const level = skillLevel(state, id);
      const cost = skillCost(state, id);
      const maxed = cost === null;
      const disabled = maxed || state.persistent.echoes < cost;
      const label = level === 0 ? `${skill.name} — Locked` : `${skill.name} — Lv${level}${level >= MAX_SKILL_LEVEL ? ' (MAX)' : ''}`;
      const buyLabel = maxed ? 'MAX' : level === 0 ? `Unlock (${cost})` : `Upgrade (${cost})`;
      return `
        <div class="shop-row">
          <span class="shop-name">${label}</span>
          <button data-action="buy-skill" data-skill="${id}" ${disabled ? 'disabled' : ''}>${buyLabel}</button>
        </div>`;
    })
    .join('');

  return `
    <div class="menu upgrade-shop">
      <h2>Upgrade Shop</h2>
      <div class="stat-line">Echoes: ${state.persistent.echoes}</div>
      <div class="shop-section">
        <h3>Stats</h3>
        ${statRows}
      </div>
      <div class="shop-section">
        <h3>Skills</h3>
        ${skillRows}
      </div>
      <button class="continue-btn" data-action="shop-continue">Continue — Loop ${state.persistent.loopCount + 1}</button>
      <button class="new-game-btn" data-action="new-game">New Game (wipe save)</button>
      <div class="menu-hint">Esc: continue</div>
    </div>`;
}

const HELP_ROWS: readonly [string, string, string][] = [
  ['W/A/S/D or Arrows', 'Move / bump-attack (sets facing)', 'GAME'],
  ['Space', 'Brace / pass turn (+1 DEF until your next turn)', 'GAME'],
  ['Q / E', 'Use the mapped skill toward facing', 'GAME'],
  ['I / Tab', 'Open/close Inventory & Equipment', 'GAME, INVENTORY'],
  ['K', 'Open/close Skill Setting', 'GAME, SKILL_MENU'],
  ['? / F1', 'Open/close this Help overlay', 'any screen'],
  ['M', 'Toggle mute', 'any screen'],
  ['[ / ]', 'Master volume down/up', 'any screen'],
  ['Esc', 'Close the current overlay', 'INVENTORY, SKILL_MENU, HELP, UPGRADE_SHOP'],
  ['Click', 'Equip/unequip/use an item, assign a skill, buy an upgrade', 'INVENTORY, SKILL_MENU, UPGRADE_SHOP'],
];

function renderHelp(): string {
  const rows = HELP_ROWS.map(
    ([key, action, screen]) =>
      `<div class="help-row"><span class="help-key">${key}</span><span class="help-action">${action}</span><span class="help-screen">${screen}</span></div>`,
  ).join('');
  const volumePct = Math.round(getMasterVolume() * 100);
  return `
    <div class="menu help-menu">
      <h2>Controls</h2>
      <div class="stat-line">Volume: ${isMuted() ? 'Muted' : `${volumePct}%`}</div>
      <div class="help-list">${rows}</div>
      <div class="menu-hint">? / F1 / Esc: close</div>
    </div>`;
}

function renderTitle(): string {
  const continueBtn = hasSave()
    ? '<button class="continue-btn" data-action="title-continue">Continue</button>'
    : '';
  return `
    <div class="menu title-menu">
      <h1>Chrono-Keep</h1>
      <div class="stat-line">The 100-Turn Dungeon</div>
      ${continueBtn}
      <button class="new-game-btn" data-action="new-game">New Game</button>
      <div class="menu-hint">?/F1: Help</div>
    </div>`;
}

function renderDeath(state: GameState): string {
  const fell = state.run.currentHp <= 0;
  return `
    <div class="menu death-menu">
      <h2>${fell ? 'You Have Fallen' : 'Time Has Run Out'}</h2>
      <div class="stat-line">Loop ${state.persistent.loopCount + 1}</div>
      <div class="stat-line">Reached Floor ${state.run.currentFloor}</div>
      <div class="stat-line">Echoes banked: ${state.persistent.echoes}</div>
      <button class="continue-btn" data-action="death-continue">Continue to Upgrade Shop</button>
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
      <button class="continue-btn" data-action="victory-newgameplus">New Game+ (keep upgrades)</button>
      <button class="new-game-btn" data-action="new-game">Full Reset</button>
    </div>`;
}

/** Rebuilds the overlay for the current screen; clears it outside menus. */
const ALL_SCREENS = new Set<GameState['ui']['currentScreen']>([
  'TITLE',
  'GAME',
  'INVENTORY',
  'SKILL_MENU',
  'UPGRADE_SHOP',
  'HELP',
  'DEATH',
  'VICTORY',
]);

function render(state: GameState): void {
  const el = screenEl();
  const screen = state.ui.currentScreen;
  const isOpen = screen !== 'GAME';
  el.classList.toggle('active', isOpen);
  if (screen === 'TITLE') el.innerHTML = renderTitle();
  else if (screen === 'INVENTORY') el.innerHTML = renderInventory(state);
  else if (screen === 'SKILL_MENU') el.innerHTML = renderSkillMenu(state);
  else if (screen === 'UPGRADE_SHOP') el.innerHTML = renderUpgradeShop(state);
  else if (screen === 'HELP') el.innerHTML = renderHelp();
  else if (screen === 'DEATH') el.innerHTML = renderDeath(state);
  else if (screen === 'VICTORY') el.innerHTML = renderVictory(state);
  else el.innerHTML = '';
  lastScreen = screen;
}

/** Wires I/TAB (Inventory), K (Skill Menu), ?/F1 (Help), Escape (close), and clicks on the overlay. */
export function initMenus(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    const screen = state.ui.currentScreen;
    if (!ALL_SCREENS.has(screen)) return;
    const key = ev.key.toLowerCase();

    if (key === '?' || key === 'f1') {
      ev.preventDefault();
      state.ui.currentScreen = screen === 'HELP' ? 'GAME' : 'HELP';
      render(state);
    } else if ((key === 'i' || key === 'tab') && (screen === 'GAME' || screen === 'INVENTORY')) {
      ev.preventDefault();
      toggleScreen(state, 'INVENTORY');
      render(state);
    } else if (key === 'k' && (screen === 'GAME' || screen === 'SKILL_MENU')) {
      ev.preventDefault();
      toggleScreen(state, 'SKILL_MENU');
      render(state);
    } else if (key === 'escape' && (screen === 'INVENTORY' || screen === 'SKILL_MENU' || screen === 'UPGRADE_SHOP' || screen === 'HELP')) {
      ev.preventDefault();
      state.ui.currentScreen = 'GAME';
      render(state);
    }
  });

  screenEl().addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const { action, index, skill, slot, track } = target.dataset;

    if (action === 'equip') equipItem(state, Number(index));
    else if (action === 'use-potion') usePotion(state, Number(index));
    else if (action === 'use-consumable') useConsumable(state, Number(index));
    else if (action === 'unequip-weapon') unequipWeapon(state);
    else if (action === 'unequip-accessory') unequipAccessory(state);
    else if (action === 'assign-skill') assignSkill(state, skill!, slot as 'Q' | 'E');
    else if (action === 'buy-stat') buyStatUpgrade(state, track as StatTrack);
    else if (action === 'buy-skill') buySkillUpgrade(state, skill!);
    else if (action === 'shop-continue') state.ui.currentScreen = 'GAME';
    else if (action === 'new-game') startNewGame(state);
    else if (action === 'title-continue') continueSave(state);
    else if (action === 'death-continue') continueAfterDeath(state);
    else if (action === 'victory-newgameplus') startNewGamePlus(state);

    render(state);
  });
}

/** Per-frame safety net: catches screen transitions triggered outside menus.ts (e.g. loss-reset -> Upgrade Shop). */
export function updateMenus(state: GameState): void {
  if (state.ui.currentScreen !== lastScreen) render(state);
}
