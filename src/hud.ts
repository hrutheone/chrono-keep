// Main Game HUD (GDD Section 8): HTML/CSS overlays layered above the canvas.
// Top bar: turn counter, HP bar, Stamina bar, status icon.
// Bottom bar: equipped weapon, Q/E skill slots, last 3 log lines.

import { ENEMY_NAME, eliteAffixName, relicLore, relicName } from './content';
import { spriteCssStyle } from './assets';
import { RELIC_SPRITE_BY_EFFECT, SPRITES } from './sprites';
import type { GameState, StatusEffect } from './types';

// Relic Tray icon display size (Section 8: "16x16 icons upscaled via CSS").
const RELIC_ICON_SIZE = 16;

// Phase 19 Elite Warning banner: enemies within this taxicab radius of the
// player trigger it — deliberately smaller than the 7-tile wake radius, so
// it reads as "one's about to be a problem," not "one exists somewhere."
const ELITE_WARNING_RADIUS = 3;

const STATUS_LABEL: Record<StatusEffect, string> = {
  NONE: '',
  BURN: 'BURN',
  STUN: 'STUN',
  CHILLED: 'CHILL',
};

let lastTurns: number | null = null;

const SKILL_SLOT_IDS: readonly [string, string][] = [
  ['skill-q', 'Q'],
  ['skill-e', 'E'],
  ['skill-r', 'R'],
  ['skill-f', 'F'],
];

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** Section 8's Quick Controls Help hint strip: the 3-4 keys most relevant to
 * the current screen, always visible in the HUD bottom bar. */
const HINT_STRIP: Record<GameState['ui']['currentScreen'], string> = {
  TITLE: 'Enter: Start',
  GAME: 'WASD Move · Space Brace · Q/E Skill · I Inv · K Skills · ? Help',
  MENU: 'Click: Switch Tab, Equip/Use, Assign Q/E · I/K/?/Esc: Close',
  UPGRADE_SHOP: 'Click: Buy · Esc: Continue',
  SHORTCUT_GATE: 'Click: Warp · Esc: Cancel',
  CURSED_RIFT: 'Click: Accept/Decline',
  CONFIRM: 'Click Proceed/Cancel',
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
    </div>
    <div id="relic-tray" class="relic-tray"></div>
    <div id="relic-tooltip" class="tooltip"></div>`;

  bottom.innerHTML = `
    <div id="elite-warning" class="elite-warning"></div>
    <div id="action-log" class="action-log"></div>
    <div class="hud-row">
      <span id="weapon-info" class="weapon-info">Unarmed</span>
    </div>
    <div class="hud-row">
      <span id="skill-q" class="skill-slot">Q: --</span>
      <span id="skill-e" class="skill-slot">E: --</span>
      <span id="skill-r" class="skill-slot">R: --</span>
      <span id="skill-f" class="skill-slot">F: --</span>
    </div>
    <div id="hint-strip" class="hint-strip"></div>`;

  // Relic Tray tooltip (Phase 19, Section 8): tap an icon to show it (no
  // hover on mobile), tap anywhere else to dismiss — delegated on `document`
  // since the tray's own children are rebuilt every updateHud call.
  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const icon = target.closest<HTMLElement>('.relic-icon');
    const tooltip = el('relic-tooltip');
    if (icon) {
      const effect = icon.dataset.relic!;
      tooltip.innerHTML = `<strong>${relicName(effect)}</strong><br>${relicLore(effect)}`;
      tooltip.classList.add('visible');
    } else if (!target.closest('#relic-tooltip')) {
      tooltip.classList.remove('visible');
    }
  });
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

  // Relic Tray (Phase 19, Section 8): horizontally-scrolling icon strip, one
  // per held Chronofact. Carry-over polish: real pixel-art icons pulled from
  // the spritesheet via assets.ts's spriteCssStyle (a background-position/
  // -size CSS pattern this codebase didn't have before — every other
  // Section 8 overlay is text-driven), one per relic (RELIC_SPRITE_BY_EFFECT),
  // instead of the original 2-letter text-glyph stand-in.
  el('relic-tray').innerHTML = run.relics
    .map((effect) => {
      const ref = RELIC_SPRITE_BY_EFFECT[effect] ?? SPRITES.RELIC;
      return `<button class="relic-icon" data-relic="${effect}" style="${spriteCssStyle(ref, RELIC_ICON_SIZE)}"></button>`;
    })
    .join('');

  // Elite Warning banner (Phase 19, Section 8): the nearest awake Elite
  // within range, if any — flashes in above the Action Log.
  const eliteWarning = el('elite-warning');
  const nearbyElite = state.dungeon.enemies.find(
    (e) => e.awake && e.affix && Math.abs(e.x - run.playerX) + Math.abs(e.y - run.playerY) <= ELITE_WARNING_RADIUS,
  );
  if (state.ui.currentScreen === 'GAME' && nearbyElite) {
    eliteWarning.textContent = `⚠ ELITE DETECTED: [${eliteAffixName(nearbyElite.affix!)}] ${ENEMY_NAME[nearbyElite.kind]}`;
    eliteWarning.classList.add('visible');
  } else {
    eliteWarning.classList.remove('visible');
  }

  el('weapon-info').textContent = run.equippedWeapon ? run.equippedWeapon.name : 'Unarmed';
  SKILL_SLOT_IDS.forEach(([elId, label], i) => {
    const skillId = run.activeSkills[i];
    el(elId).textContent = `${label}: ${skillId ? `${skillId} (Lv${state.persistent.skills[skillId] ?? 0})` : '--'}`;
  });

  // The unified Menu is a full-screen overlay; on mobile's portrait layout
  // #hud-bottom sits in normal flex flow (not absolutely positioned under
  // the overlay like on desktop), so its action log/hint strip can visually
  // bleed through the menu's dashed/low-opacity slots. Hide the whole bar
  // rather than just the log — it's redundant once a menu covers the screen
  // anyway.
  const hideHudBottom = state.ui.currentScreen === 'MENU';
  el('hud-bottom').style.display = hideHudBottom ? 'none' : '';
  el('action-log').innerHTML = state.ui.log
    .slice(-3)
    .map((line) => `<div>${line}</div>`)
    .join('');

  el('hint-strip').textContent = HINT_STRIP[state.ui.currentScreen] ?? '';

  const lowHp = state.ui.currentScreen === 'GAME' && run.currentHp / run.maxHp < 0.25;
  el('vignette').classList.toggle('low-hp', lowHp);
}
