// HTML/CSS HUD overlays layered above the canvas.

import { ENEMY_NAME, eliteAffixName, itemDisplayName, relicLore, relicName } from './content';
import type { SkillId } from './content';
import { spriteCssStyle } from './assets';
import { RELIC_SPRITE_BY_EFFECT, SKILL_SPRITE_BY_ID, SPRITES } from './sprites';
import { STATUS_IMMUNITY } from './combat';
import { hasAccessoryPassive } from './inventory';
import type { GameState, StatusEffect } from './types';

const RELIC_ICON_SIZE = 16;
const SKILL_ICON_SIZE = 18;
const TOUCH_SKILL_ICON_SIZE = 28;

// Warning radius for nearby elites.
const ELITE_WARNING_RADIUS = 3;

const STATUS_LABEL: Record<StatusEffect, string> = {
  NONE: '',
  BURN: 'BURN',
  STUN: 'STUN',
  CHILLED: 'CHILL',
};

const SKILL_SLOT_IDS: readonly [string, string][] = [
  ['skill-q', 'Q'],
  ['skill-e', 'E'],
  ['skill-r', 'R'],
  ['skill-f', 'F'],
  ['skill-c', 'C'],
  ['skill-v', 'V'],
];

// Mobile action-pad buttons — same Q/E/R/F order as SKILL_SLOT_IDS.
const TOUCH_SKILL_BTN_CLASS: readonly [string, string][] = [
  ['skill-btn-q', 'Q'],
  ['skill-btn-e', 'E'],
  ['skill-btn-r', 'R'],
  ['skill-btn-f', 'F'],
  ['skill-btn-c', 'C'],
  ['skill-btn-v', 'V'],
];

/** The 3-4 keys most relevant to the current screen, always visible in the HUD. */
const HINT_STRIP: Record<GameState['ui']['currentScreen'], string> = {
  TITLE: 'Enter: Start',
  GAME: 'WASD Move · Space Brace · QERFCV Skills · I Inv · K Skills · ? Help',
  MENU: 'Click: Switch Tab, Equip/Use, Assign Q/E · I/K/?/Esc: Close',
  UPGRADE_SHOP: 'Click: Buy · Esc: Continue',
  SHORTCUT_GATE: 'Click: Warp · Esc: Cancel',
  CURSED_RIFT: 'Click: Accept/Decline',
  SMUGGLER: 'Click: Buy · Esc: Leave',
  CONFIRM: 'Click Proceed/Cancel',
  DEATH: 'Esc: Continue',
  VICTORY: 'Esc: Continue',
  DIALOGUE: 'Click anywhere · Space/Esc: Continue',
  ACTION_LOG: 'Esc: Close',
};

// Cached DOM element references
interface HudDomElements {
  floorIndicator: HTMLElement;
  turnCounter: HTMLElement;
  hpFill: HTMLElement;
  stamFill: HTMLElement;
  braceIcon: HTMLElement;
  statusIcon: HTMLElement;
  immunityTray: HTMLElement;
  relicTray: HTMLElement;
  relicTooltip: HTMLElement;
  eliteWarning: HTMLElement;
  actionLog: HTMLElement;
  weaponInfo: HTMLElement;
  skillSlots: HTMLElement[];
  touchSkillBtns: (HTMLElement | null)[];
  hintStrip: HTMLElement;
  hudTop: HTMLElement;
  hudBottom: HTMLElement;
  touchControls: HTMLElement | null;
  vignette: HTMLElement;
}

let dom: HudDomElements | null = null;

// Last rendered values for dirty checking
let lastFloor: number | null = null;
let lastTurns: string | null = null;
let lastHpPct: number | null = null;
let lastStamPct: number | null = null;
let lastBraced: boolean | null = null;
let lastStatus: StatusEffect | null = null;
let lastImmunityKey: string | null = null;
let lastRelicsKey: string | null = null;
let lastEliteKey: string | null = null;
let lastWeaponText: string | null = null;
let lastSkillKey: string | null = null;
let lastTouchSkillKey: string | null = null;
let lastLogKey: string | null = null;
let lastHintText: string | null = null;
let lastHideHud: boolean | null = null;
let lastHideHudBottom: boolean | null = null;
let lastLowHp: boolean | null = null;

function getDom(): HudDomElements {
  if (!dom) {
    dom = {
      floorIndicator: document.getElementById('floor-indicator')!,
      turnCounter: document.getElementById('turn-counter')!,
      hpFill: document.getElementById('hp-fill')!,
      stamFill: document.getElementById('stam-fill')!,
      braceIcon: document.getElementById('brace-icon')!,
      statusIcon: document.getElementById('status-icon')!,
      immunityTray: document.getElementById('immunity-tray')!,
      relicTray: document.getElementById('relic-tray')!,
      relicTooltip: document.getElementById('relic-tooltip')!,
      eliteWarning: document.getElementById('elite-warning')!,
      actionLog: document.getElementById('action-log')!,
      weaponInfo: document.getElementById('weapon-info')!,
      skillSlots: SKILL_SLOT_IDS.map(([id]) => document.getElementById(id)!),
      touchSkillBtns: TOUCH_SKILL_BTN_CLASS.map(([cls]) =>
        document.querySelector<HTMLElement>(`#touch-controls .${cls}`),
      ),
      hintStrip: document.getElementById('hint-strip')!,
      hudTop: document.getElementById('hud-top')!,
      hudBottom: document.getElementById('hud-bottom')!,
      touchControls: document.getElementById('touch-controls'),
      vignette: document.getElementById('vignette')!,
    };
  }
  return dom;
}

/** Builds the HUD DOM once into the #hud-top / #hud-bottom overlay containers. */
export function initHud(): void {
  const top = document.querySelector<HTMLElement>('#hud-top')!;
  const bottom = document.querySelector<HTMLElement>('#hud-bottom')!;

  top.innerHTML = `
    <div class="hud-row">
      <span id="floor-indicator" class="floor-indicator">HUB</span>
      <span id="turn-counter" class="turn-counter">100</span>
      <div class="bar-stack">
        <div class="bar hp-bar"><div id="hp-fill" class="bar-fill"></div></div>
        <div class="bar stam-bar"><div id="stam-fill" class="bar-fill"></div></div>
      </div>
      <span id="brace-icon" class="brace-icon"></span>
      <span id="status-icon" class="status-icon"></span>
      <div id="immunity-tray" class="immunity-tray"></div>
    </div>
    <div id="relic-tray" class="relic-tray"></div>
    <div id="relic-tooltip" class="tooltip"></div>`;

  bottom.innerHTML = `
    <div id="elite-warning" class="elite-warning"></div>
    <div id="action-log" class="action-log"></div>
    <div class="hud-row">
      <span id="weapon-info" class="weapon-info">Unarmed</span>
    </div>
    <div class="hud-row hud-row-skills">
      <span id="skill-q" class="skill-slot">Q: --</span>
      <span id="skill-e" class="skill-slot">E: --</span>
      <span id="skill-r" class="skill-slot">R: --</span>
      <span id="skill-f" class="skill-slot">F: --</span>
      <span id="skill-c" class="skill-slot">C: --</span>
      <span id="skill-v" class="skill-slot">V: --</span>
    </div>
    <div id="hint-strip" class="hint-strip"></div>`;

  dom = null; // force re-query on next getDom call
  lastFloor = null;
  lastTurns = null;
  lastHpPct = null;
  lastStamPct = null;
  lastBraced = null;
  lastStatus = null;
  lastImmunityKey = null;
  lastRelicsKey = null;
  lastEliteKey = null;
  lastWeaponText = null;
  lastSkillKey = null;
  lastTouchSkillKey = null;
  lastLogKey = null;
  lastHintText = null;
  lastHideHud = null;
  lastHideHudBottom = null;
  lastLowHp = null;

  // Delegated tooltip toggling for rebuilt tray children.
  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const icon = target.closest<HTMLElement>('.relic-icon');
    const elements = getDom();
    if (icon) {
      const effect = icon.dataset.relic!;
      elements.relicTooltip.innerHTML = `<strong>${relicName(effect)}</strong><br>${relicLore(effect)}`;
      elements.relicTooltip.classList.add('visible');
    } else if (!target.closest('#relic-tooltip')) {
      elements.relicTooltip.classList.remove('visible');
    }
  });
}

/** Refreshes the HUD from the current game state with change detection. */
export function updateHud(state: GameState): void {
  const { run } = state;
  const elements = getDom();

  // 0. Floor Indicator
  const floorText = run.currentFloor === 0 ? 'HUB' : `F${String(run.currentFloor).padStart(2, '0')}`;
  if (lastFloor !== run.currentFloor) {
    elements.floorIndicator.textContent = floorText;
    lastFloor = run.currentFloor;
  }

  // 1. Turn counter
  const turnKey = run.floorEvent === 'SHATTERED' ? '???' : `${run.turnsRemaining}`;
  if (lastTurns !== turnKey) {
    elements.turnCounter.textContent = turnKey;
    if (lastTurns !== null) {
      elements.turnCounter.classList.remove('tick');
      void elements.turnCounter.offsetWidth; // restart CSS animation
      elements.turnCounter.classList.add('tick');
    }
    lastTurns = turnKey;
  }

  // 2. HP & Stamina Bars
  const hpPct = run.maxHp > 0 ? Math.max(0, Math.min(1, run.currentHp / run.maxHp)) * 100 : 0;
  if (lastHpPct !== hpPct) {
    elements.hpFill.style.width = `${hpPct}%`;
    lastHpPct = hpPct;
  }

  const stamPct = run.maxStamina > 0 ? Math.max(0, Math.min(1, run.currentStamina / run.maxStamina)) * 100 : 0;
  if (lastStamPct !== stamPct) {
    elements.stamFill.style.width = `${stamPct}%`;
    lastStamPct = stamPct;
  }

  // 3. Brace Icon
  if (lastBraced !== run.braced) {
    elements.braceIcon.textContent = run.braced ? 'BRACED +1DEF' : '';
    elements.braceIcon.className = `brace-icon${run.braced ? ' active' : ''}`;
    lastBraced = run.braced;
  }

  // 4. Status Icon
  if (lastStatus !== run.status) {
    elements.statusIcon.textContent = STATUS_LABEL[run.status];
    elements.statusIcon.className = `status-icon status-${run.status.toLowerCase()}`;
    lastStatus = run.status;
  }

  // 5. Immunity Tray
  const immunities = (Object.keys(STATUS_IMMUNITY) as StatusEffect[])
    .filter((status) => hasAccessoryPassive(state, STATUS_IMMUNITY[status]!));
  const immunityKey = immunities.join(',');
  if (lastImmunityKey !== immunityKey) {
    elements.immunityTray.innerHTML = immunities
      .map((status) => `<span class="immunity-icon" title="Immune: ${STATUS_LABEL[status]}">${STATUS_LABEL[status]}</span>`)
      .join('');
    lastImmunityKey = immunityKey;
  }

  // 6. Relic Tray
  const relicsKey = run.relics.join(',');
  if (lastRelicsKey !== relicsKey) {
    elements.relicTray.innerHTML = run.relics
      .map((effect) => {
        const ref = RELIC_SPRITE_BY_EFFECT[effect] ?? SPRITES.RELIC;
        return `<button class="relic-icon" data-relic="${effect}" style="${spriteCssStyle(ref, RELIC_ICON_SIZE)}"></button>`;
      })
      .join('');
    lastRelicsKey = relicsKey;
  }

  // 7. Elite Warning
  const nearbyElite = state.dungeon.enemies.find(
    (e) => e.awake && e.affix && Math.abs(e.x - run.playerX) + Math.abs(e.y - run.playerY) <= ELITE_WARNING_RADIUS,
  );
  const eliteKey = state.ui.currentScreen === 'GAME' && nearbyElite ? `${nearbyElite.affix}_${nearbyElite.kind}` : '';
  if (lastEliteKey !== eliteKey) {
    if (eliteKey) {
      elements.eliteWarning.textContent = `⚠ ELITE DETECTED: [${eliteAffixName(nearbyElite!.affix!)}] ${ENEMY_NAME[nearbyElite!.kind]}`;
      elements.eliteWarning.classList.add('visible');
    } else {
      elements.eliteWarning.classList.remove('visible');
    }
    lastEliteKey = eliteKey;
  }

  // 8. Weapon Info
  const weaponText = run.equippedWeapon ? itemDisplayName(run.equippedWeapon) : 'Unarmed';
  if (lastWeaponText !== weaponText) {
    elements.weaponInfo.textContent = weaponText;
    lastWeaponText = weaponText;
  }

  // 9. Desktop Skill Slots
  const skillKey = run.activeSkills.map((id) => `${id}_${state.persistent.skills[id] ?? 0}`).join('|');
  if (lastSkillKey !== skillKey) {
    SKILL_SLOT_IDS.forEach(([_, label], i) => {
      const slotEl = elements.skillSlots[i];
      if (!slotEl) return;
      const skillId = run.activeSkills[i];
      if (!skillId) {
        slotEl.innerHTML = `${label}: --`;
      } else {
        const iconStyle = spriteCssStyle(SKILL_SPRITE_BY_ID[skillId as SkillId], SKILL_ICON_SIZE);
        slotEl.innerHTML = `${label}: <span class="skill-slot-icon" style="${iconStyle}"></span> Lv${state.persistent.skills[skillId] ?? 0}`;
      }
    });
    lastSkillKey = skillKey;
  }

  // 10. Touch Skill Buttons
  const touchSkillKey = run.activeSkills.join('|');
  if (lastTouchSkillKey !== touchSkillKey) {
    TOUCH_SKILL_BTN_CLASS.forEach(([_, label], i) => {
      const btn = elements.touchSkillBtns[i] ?? document.querySelector<HTMLElement>(`#touch-controls .${TOUCH_SKILL_BTN_CLASS[i][0]}`);
      if (!btn) return;
      const skillId = run.activeSkills[i];
      if (!skillId) {
        btn.innerHTML = label;
      } else {
        const iconStyle = spriteCssStyle(SKILL_SPRITE_BY_ID[skillId as SkillId], TOUCH_SKILL_ICON_SIZE);
        btn.innerHTML = `<span class="skill-slot-icon" style="${iconStyle}"></span>`;
      }
    });
    lastTouchSkillKey = touchSkillKey;
  }

  // 11. HUD Visibility
  const hideHud = state.ui.currentScreen === 'TITLE';
  if (lastHideHud !== hideHud) {
    elements.hudTop.style.display = hideHud ? 'none' : '';
    if (elements.touchControls) elements.touchControls.style.display = hideHud ? 'none' : '';
    lastHideHud = hideHud;
  }

  const hideHudBottom = hideHud || state.ui.currentScreen === 'MENU';
  if (lastHideHudBottom !== hideHudBottom) {
    elements.hudBottom.style.display = hideHudBottom ? 'none' : '';
    lastHideHudBottom = hideHudBottom;
  }

  // 12. Action Log
  const recentLog = state.ui.log.slice(-3);
  const logKey = recentLog.join('||');
  if (lastLogKey !== logKey) {
    elements.actionLog.innerHTML = recentLog.map((line) => `<div>${line}</div>`).join('');
    lastLogKey = logKey;
  }

  // 13. Hint Strip
  const hintText = HINT_STRIP[state.ui.currentScreen] ?? '';
  if (lastHintText !== hintText) {
    elements.hintStrip.textContent = hintText;
    lastHintText = hintText;
  }

  // 14. Low HP Vignette
  const lowHp = state.ui.currentScreen === 'GAME' && run.currentHp / run.maxHp < 0.25;
  if (lastLowHp !== lowHp) {
    elements.vignette.classList.toggle('low-hp', lowHp);
    lastLowHp = lowHp;
  }
}

