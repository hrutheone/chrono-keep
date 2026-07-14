// Inventory & Skill Setting screens (GDD Section 8): HTML overlays in
// #screen-overlay. Opening/browsing is always free; src/inventory.ts owns
// the turn-cost rules for the actions dispatched from here.
//
// The overlay is only re-rendered on screen transitions and right after a
// menu action — never on a per-frame timer — so DOM nodes (and their click
// listeners/focus) stay stable between user interactions.

import { SKILLS } from './content';
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

function renderInventory(state: GameState): string {
  const { run } = state;
  const danger = isThreatNearby(state);

  const slots = Array.from({ length: INVENTORY_CAP }, (_, i) => run.inventory[i]);
  const gridHtml = slots
    .map((item, i) => {
      if (!item) return '<div class="inv-slot empty"></div>';
      const actionable = item.kind === 'WEAPON' || item.kind === 'ACCESSORY' ? 'equip' : item.kind === 'POTION' ? 'use-potion' : null;
      const attrs = actionable ? `data-action="${actionable}" data-index="${i}"` : 'disabled';
      return `<button class="inv-slot" ${attrs}>${item.name}</button>`;
    })
    .join('');

  return `
    <div class="menu inventory-menu">
      <div class="menu-pane left-pane">
        <h2>Inventory</h2>
        <div class="stat-line">Total ATK: ${totalAtk(state)}</div>
        <div class="stat-line">Total DEF: ${totalDef(state)}</div>
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

/** Rebuilds the overlay for the current screen; clears it outside menus. */
function render(state: GameState): void {
  const el = screenEl();
  const screen = state.ui.currentScreen;
  const isOpen = screen === 'INVENTORY' || screen === 'SKILL_MENU';
  el.classList.toggle('active', isOpen);
  if (screen === 'INVENTORY') el.innerHTML = renderInventory(state);
  else if (screen === 'SKILL_MENU') el.innerHTML = renderSkillMenu(state);
  else el.innerHTML = '';
  lastScreen = screen;
}

/** Wires I/TAB (Inventory), K (Skill Menu), Escape (close), and clicks on the overlay. */
export function initMenus(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    const screen = state.ui.currentScreen;
    if (screen !== 'GAME' && screen !== 'INVENTORY' && screen !== 'SKILL_MENU') return;
    const key = ev.key.toLowerCase();

    if (key === 'i' || key === 'tab') {
      ev.preventDefault();
      toggleScreen(state, 'INVENTORY');
      render(state);
    } else if (key === 'k') {
      ev.preventDefault();
      toggleScreen(state, 'SKILL_MENU');
      render(state);
    } else if (key === 'escape') {
      ev.preventDefault();
      state.ui.currentScreen = 'GAME';
      render(state);
    }
  });

  screenEl().addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const { action, index, skill, slot } = target.dataset;

    if (action === 'equip') equipItem(state, Number(index));
    else if (action === 'use-potion') usePotion(state, Number(index));
    else if (action === 'unequip-weapon') unequipWeapon(state);
    else if (action === 'unequip-accessory') unequipAccessory(state);
    else if (action === 'assign-skill') assignSkill(state, skill!, slot as 'Q' | 'E');

    render(state);
  });
}

/** Per-frame safety net: catches screen transitions triggered outside menus.ts (e.g. Phase 4/5/6 screens). */
export function updateMenus(state: GameState): void {
  if (state.ui.currentScreen !== lastScreen) render(state);
}
