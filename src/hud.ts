// Main Game HUD (GDD Section 8): HTML/CSS overlays layered above the canvas.
// Top bar: turn counter, HP bar, Stamina bar, status icon.
// Bottom bar: equipped weapon, Q/E skill slots, last 3 log lines.

import type { GameState, StatusEffect } from './types';

const STATUS_LABEL: Record<StatusEffect, string> = {
  NONE: '',
  BURN: 'BURN',
  STUN: 'STUN',
  CHILLED: 'CHILL',
};

let lastTurns: number | null = null;

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** Section 8's Quick Controls Help hint strip: the 3-4 keys most relevant to
 * the current screen, always visible in the HUD bottom bar. */
const HINT_STRIP: Record<GameState['ui']['currentScreen'], string> = {
  TITLE: 'Enter: Start',
  GAME: 'WASD Move · Space Brace · Q/E Skill · I Inv · K Skills · ? Help',
  INVENTORY: 'Click: Equip/Use · I/Esc: Close',
  SKILL_MENU: 'Click: Assign Q/E · K/Esc: Close',
  UPGRADE_SHOP: 'Click: Buy · Esc: Continue',
  HELP: '?/F1/Esc: Close',
  DEATH: 'Esc: Continue',
  VICTORY: 'Esc: Continue',
};

/** Builds the HUD DOM once into the #hud-top / #hud-bottom overlay containers. */
export function initHud(): void {
  const top = document.querySelector<HTMLElement>('#hud-top')!;
  const bottom = document.querySelector<HTMLElement>('#hud-bottom')!;

  top.innerHTML = `
    <div class="hud-row">
      <span id="turn-counter" class="turn-counter">100</span>
      <div class="bar-stack">
        <div class="bar hp-bar"><div id="hp-fill" class="bar-fill"></div></div>
        <div class="bar stam-bar"><div id="stam-fill" class="bar-fill"></div></div>
      </div>
      <span id="brace-icon" class="brace-icon"></span>
      <span id="status-icon" class="status-icon"></span>
    </div>`;

  bottom.innerHTML = `
    <div id="action-log" class="action-log"></div>
    <div class="hud-row">
      <span id="weapon-info" class="weapon-info">Unarmed</span>
      <span id="skill-q" class="skill-slot">Q: --</span>
      <span id="skill-e" class="skill-slot">E: --</span>
    </div>
    <div id="hint-strip" class="hint-strip"></div>`;
}

function setBar(fillId: string, current: number, max: number): void {
  const fill = el(fillId);
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) * 100 : 0;
  fill.style.width = `${pct}%`;
}

/** Refreshes the HUD from the current game state. Call once per frame. */
export function updateHud(state: GameState): void {
  const { run } = state;

  const turnEl = el('turn-counter');
  turnEl.textContent = `${run.turnsRemaining}`;
  if (lastTurns !== null && lastTurns !== run.turnsRemaining) {
    turnEl.classList.remove('tick');
    void turnEl.offsetWidth; // restart the CSS animation
    turnEl.classList.add('tick');
  }
  lastTurns = run.turnsRemaining;

  setBar('hp-fill', run.currentHp, run.maxHp);
  setBar('stam-fill', run.currentStamina, run.maxStamina);

  const braceEl = el('brace-icon');
  braceEl.textContent = run.braced ? 'BRACED +1DEF' : '';
  braceEl.className = `brace-icon${run.braced ? ' active' : ''}`;

  const statusEl = el('status-icon');
  statusEl.textContent = STATUS_LABEL[run.status];
  statusEl.className = `status-icon status-${run.status.toLowerCase()}`;

  el('weapon-info').textContent = run.equippedWeapon ? run.equippedWeapon.name : 'Unarmed';
  const q = run.activeSkills[0];
  const e = run.activeSkills[1];
  el('skill-q').textContent = `Q: ${q ? `${q} (Lv${state.persistent.skills[q] ?? 0})` : '--'}`;
  el('skill-e').textContent = `E: ${e ? `${e} (Lv${state.persistent.skills[e] ?? 0})` : '--'}`;

  el('action-log').innerHTML = state.ui.log
    .slice(-3)
    .map((line) => `<div>${line}</div>`)
    .join('');

  el('hint-strip').textContent = HINT_STRIP[state.ui.currentScreen] ?? '';

  const lowHp = state.ui.currentScreen === 'GAME' && run.currentHp / run.maxHp < 0.25;
  el('vignette').classList.toggle('low-hp', lowHp);
}
