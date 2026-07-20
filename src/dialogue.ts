// Silas, the Old Watchwarden — data-driven dialogue pool and selection.

import { saveGame } from './persistence';
import type { GameState } from './types';

/** Per-Hub-visit state; reset by resetDialogueSession() whenever the player enters the Hub. */
export interface SessionState {
  talkedToSilasThisHubVisit: number;
}

let session: SessionState = { talkedToSilasThisHubVisit: 0 };

export function resetDialogueSession(): void {
  session = { talkedToSilasThisHubVisit: 0 };
}

export interface DialogueLine {
  id: string;
  priority: 1 | 2 | 3 | 4;
  text: string;
  condition: (state: GameState, session: SessionState) => boolean;
}

function hasAccessoryNamed(state: GameState, name: string): boolean {
  const { equippedAccessory, equippedAccessory2, equippedAccessory3 } = state.run;
  return equippedAccessory?.name === name || equippedAccessory2?.name === name || equippedAccessory3?.name === name;
}

function hasWeaponNamed(state: GameState, name: string): boolean {
  return state.run.equippedWeapon?.name === name || state.run.equippedWeapon2?.name === name;
}

const always = () => true;

// ---- Priority 1: Milestones (10) — flagged in persistent.dialogueSeenIds, never repeat. ----
const MILESTONES: DialogueLine[] = [
  {
    id: 'p1_first_death',
    priority: 1,
    text: 'Back so soon? Face pale... What did the timeline strip from you? Grab your rusty sword and try again.',
    condition: (state) => state.persistent.loopCount >= 1,
  },
  {
    id: 'p1_anchor_biome_1',
    priority: 1,
    text: 'The Eternity Tree sprouted. You drove an Anchor into the rift? Careful. The Lich felt that.',
    condition: (state) => state.persistent.unlockedAnchors.length >= 1,
  },
  {
    id: 'p1_anchor_biome_2',
    priority: 1,
    text: "Two Anchors down. The storm below is howling. You're actually carving a path.",
    condition: (state) => state.persistent.unlockedAnchors.length >= 2,
  },
  {
    id: 'p1_anchor_biome_3',
    priority: 1,
    text: "The frost didn't claim you. Three Anchors. The timeline is starting to stabilize.",
    condition: (state) => state.persistent.unlockedAnchors.length >= 3,
  },
  {
    id: 'p1_reach_floor_50',
    priority: 1,
    text: 'You smell like ozone and old ash. The closer you get to the bottom, the more aware He becomes.',
    condition: (state) => state.persistent.stats.deepestFloor >= 50,
  },
  {
    id: 'p1_reach_floor_99',
    priority: 1,
    text: 'You saw him. The Chrono-Lich. Rest. Spend your Echoes. Next time, break his skull.',
    condition: (state) => state.persistent.stats.deepestFloor >= 99,
  },
  {
    id: 'p1_victory_ngplus',
    priority: 1,
    text: "The loop shattered... then reformed. You killed him, but time is too broken. Your watch isn't over.",
    condition: (state) => state.persistent.stats.wins >= 1,
  },
  {
    id: 'p1_bought_first_skill',
    priority: 1,
    text: "I see you've remembered some of your old training. Don't let the Stamina burn you out.",
    condition: (state) => Object.keys(state.persistent.skills).length > 1,
  },
  {
    id: 'p1_maxed_a_stat',
    priority: 1,
    text: 'Your body has absorbed more trauma than any mortal should bear. You are becoming like Him.',
    condition: (state) =>
      state.persistent.maxHpUpgrade >= 10 ||
      state.persistent.maxStamUpgrade >= 10 ||
      state.persistent.turnBonusUpgrade >= 10 ||
      state.persistent.baseAtkUpgrade >= 10,
  },
  {
    id: 'p1_unlocked_3rd_accessory',
    priority: 1,
    text: "Decked out in trinkets, are we? Just make sure they don't weigh you down when the floor collapses.",
    condition: (state) => state.persistent.accessorySlot3Unlocked,
  },
];

// ---- Priority 2: Reactive (30) — last death's cause, or current loadout. Can repeat. ----
const REACTIVE: DialogueLine[] = [
  {
    id: 'p2_timeout',
    priority: 2,
    text: "I warned you. 100 seconds. Not a heartbeat more. Don't get greedy next time.",
    condition: (state) => state.persistent.lastRun?.deathReason === 'TIMEOUT',
  },
  {
    id: 'p2_died_floor_1',
    priority: 2,
    text: 'Died on the first steps? Did you trip on your own scabbard?',
    condition: (state) => state.persistent.lastRun !== null && state.persistent.lastRun.deathReason === 'HP' && state.persistent.lastRun.floor === 1,
  },
  {
    id: 'p2_burned',
    priority: 2,
    text: 'You smell like roasted meat. Watch where you step down there.',
    condition: (state) => state.persistent.lastRun?.element === 'FIRE',
  },
  {
    id: 'p2_frozen',
    priority: 2,
    text: 'Your lips are blue. The Glacial Undercroft is unforgiving to those who stand still.',
    condition: (state) => state.persistent.lastRun?.element === 'FROST',
  },
  {
    id: 'p2_stunned',
    priority: 2,
    text: 'Nervous system fried? Volt magic will do that to a man.',
    condition: (state) => state.persistent.lastRun?.statusAtDeath === 'STUN',
  },
  {
    id: 'p2_died_inferno_golem',
    priority: 2,
    text: "That Golem is made of the original hearthstone. You can't outmuscle it. Outsmart it.",
    condition: (state) => state.persistent.lastRun?.enemyKind === 'INFERNO_GOLEM',
  },
  {
    id: 'p2_died_storm_caller',
    priority: 2,
    text: 'Lightning moves faster than you do. Find cover next time.',
    condition: (state) => state.persistent.lastRun?.enemyKind === 'STORM_CALLER',
  },
  {
    id: 'p2_died_glacial_knight',
    priority: 2,
    text: 'His armor is thick, but ice always melts if you bring enough fire.',
    condition: (state) => state.persistent.lastRun?.enemyKind === 'GLACIAL_KNIGHT',
  },
  {
    id: 'p2_died_scarab',
    priority: 2,
    text: "Ah, the Clockwork Scarabs. Nasty little bugs. They don't want your blood, they want your time.",
    condition: (state) => state.persistent.lastRun?.enemyKind === 'CLOCKWORK_SCARAB',
  },
  {
    id: 'p2_died_bone_grunt',
    priority: 2,
    text: 'Killed by a lowly Grunt? They were the worst swordsmen in our platoon. Embarrassing.',
    condition: (state) => state.persistent.lastRun?.enemyKind === 'BONE_GRUNT',
  },
  {
    id: 'p2_died_near_stairs',
    priority: 2,
    text: 'So close to the stairs... I could almost see you reaching for the handle before the timeline snapped.',
    condition: (state) => state.persistent.lastRun?.nearStairs === true,
  },
  {
    id: 'p2_died_frost_wraith',
    priority: 2,
    text: 'A Frost-Wraith? They were nobility once. They still expect you to bow before they gut you.',
    condition: (state) => state.persistent.lastRun?.enemyKind === 'FROST_WRAITH',
  },
  {
    id: 'p2_died_time_weaver',
    priority: 2,
    text: "Time-Weavers don't fight fair. They were never taught to. Neither were you, so I don't want to hear it.",
    condition: (state) => state.persistent.lastRun?.enemyKind === 'TIME_WEAVER',
  },
  {
    id: 'p2_died_ember_bat',
    priority: 2,
    text: "Killed by bats. I'm not going to say anything. I don't need to.",
    condition: (state) => state.persistent.lastRun?.enemyKind === 'EMBER_BAT',
  },
  {
    id: 'p2_died_volt_turret',
    priority: 2,
    text: "A Turret doesn't chase. It waits. You walked into its line twice, didn't you.",
    condition: (state) => state.persistent.lastRun?.enemyKind === 'VOLT_TURRET',
  },
  {
    id: 'p2_died_volt_hound',
    priority: 2,
    text: 'The Hounds hunt in pairs. If you saw one, the second was already behind you.',
    condition: (state) => state.persistent.lastRun?.enemyKind === 'VOLT_HOUND',
  },
  {
    id: 'p2_echoes_500',
    priority: 2,
    text: 'Your pockets are glowing. Go to the terminal. Hoarding Echoes won\'t save you.',
    condition: (state) => state.persistent.echoes >= 500,
  },
  {
    id: 'p2_echoes_1000',
    priority: 2,
    text: "A thousand Echoes and you're still standing here talking to me? Spend them, Warden.",
    condition: (state) => state.persistent.echoes >= 1000,
  },
  {
    id: 'p2_no_echoes',
    priority: 2,
    text: "Broke again? The timeline isn't going to hand you charity.",
    condition: (state) => state.persistent.echoes === 0,
  },
  {
    id: 'p2_has_masamune',
    priority: 2,
    text: 'That blade... The Masamune. It steals time itself. Use it well.',
    condition: (state) => hasWeaponNamed(state, 'Masamune'),
  },
  {
    id: 'p2_has_excalibur',
    priority: 2,
    text: 'A sword of legends. Pity we no longer live in a story that deserves one.',
    condition: (state) => hasWeaponNamed(state, 'Excalibur'),
  },
  {
    id: 'p2_accessories_no_skills',
    priority: 2,
    text: "All the jewelry in the world won't save you if you forget how to swing a sword.",
    condition: (state) =>
      state.run.equippedAccessory !== null &&
      state.run.equippedAccessory2 !== null &&
      state.run.equippedAccessory3 !== null &&
      state.run.activeSkills.length === 0,
  },
  {
    id: 'p2_low_max_hp',
    priority: 2,
    text: 'You look fragile. Invest in your vitality at the terminal, before the wind breaks your bones.',
    condition: (state) => state.run.maxHp < 30,
  },
  {
    id: 'p2_high_base_atk',
    priority: 2,
    text: 'Your arms look heavier. Good. Swing hard enough and reality might just crack.',
    condition: (state) => state.persistent.baseAtkUpgrade >= 5,
  },
  {
    id: 'p2_holding_time_shard',
    priority: 2,
    text: "I see you brought back a shard of stolen time. Don't eat it.",
    condition: (state) => state.run.inventory.some((i) => i.kind === 'TIME_SHARD'),
  },
  {
    id: 'p2_no_weapon',
    priority: 2,
    text: 'Going down bare-handed? Brave. Or incredibly stupid.',
    condition: (state) => state.run.equippedWeapon === null,
  },
  {
    id: 'p2_has_vampire_tooth',
    priority: 2,
    text: "I smell blood on you... and it's not yours. That relic is cursed, Warden.",
    condition: (state) => hasAccessoryNamed(state, 'Vampire Tooth'),
  },
  {
    id: 'p2_holding_anchor',
    priority: 2,
    text: 'That weight in your pack — a Temporal Anchor. Get it to the rift before you lose your nerve.',
    condition: (state) => state.run.inventory.some((i) => i.kind === 'ANCHOR'),
  },
  {
    id: 'p2_full_hp_stamina',
    priority: 2,
    text: "Full health, full wind. That's as good as you'll ever look before that door swallows you.",
    condition: (state) => state.run.currentHp === state.run.maxHp && state.run.currentStamina === state.run.maxStamina,
  },
  {
    id: 'p2_dual_wielding',
    priority: 2,
    text: 'Two blades now. Twice the steel, twice the chance one of them gets you killed.',
    condition: (state) => state.run.equippedWeapon2 !== null,
  },
];

// ---- Priority 3: Lore & Bestiary (50) — always eligible, purely atmospheric. ----
const LORE: DialogueLine[] = [
  { id: 'p3_lore_01', priority: 3, text: 'The Chrono-Lich wasn\'t always a monster. He was our brightest mind. Fear made him mad.', condition: always },
  { id: 'p3_lore_02', priority: 3, text: "Oakhaven was beautiful in the spring. I haven't seen a real flower in... I don't even know how long.", condition: always },
  { id: 'p3_lore_03', priority: 3, text: 'The Hourglass of Eternity was a gift from the gods. We used it to cheat death. Now look at us.', condition: always },
  { id: 'p3_lore_04', priority: 3, text: 'Do you hear the ticking? It never stops. Sometimes it syncs with my heartbeat.', condition: always },
  { id: 'p3_lore_05', priority: 3, text: 'We thought freezing time would cure the plague. Instead, it became the plague.', condition: always },
  { id: 'p3_lore_06', priority: 3, text: 'There are 99 strata below us. 99 mistakes.', condition: always },
  { id: 'p3_lore_07', priority: 3, text: 'I used to guard the inner sanctum. Now I guard a rusty terminal. Promotion, I guess.', condition: always },
  { id: 'p3_lore_08', priority: 3, text: 'The Watchwardens swore an oath to protect the King. The Lich killed him first.', condition: always },
  { id: 'p3_lore_09', priority: 3, text: 'Echoes are just crystallized grief. Funny how we use them to buy power.', condition: always },
  { id: 'p3_lore_10', priority: 3, text: 'If you reach the bottom, do you think time will flow forward again? Or will we just cease to exist?', condition: always },
  { id: 'p3_lore_11', priority: 3, text: 'The temporal anomaly breathes. It expands and contracts. 100 seconds is its exhale.', condition: always },
  { id: 'p3_lore_12', priority: 3, text: "Don't look at the walls too closely down there. You'll see the faces of the trapped.", condition: always },
  { id: 'p3_lore_13', priority: 3, text: 'The shortcut gate runs on the anchors you place. It forces reality to remember a specific coordinate.', condition: always },
  { id: 'p3_lore_14', priority: 3, text: 'The Ember-Bats used to be normal pests. Now they feed on friction and paradoxes.', condition: always },
  { id: 'p3_lore_15', priority: 3, text: 'Volt-Turrets were built to repel invaders. Now they just repel the inevitable.', condition: always },
  { id: 'p3_lore_16', priority: 3, text: 'Frost-Wraiths are the nobility of Oakhaven. Arrogant in life, freezing cold in death.', condition: always },
  { id: 'p3_lore_17', priority: 3, text: 'Beware the Bone-Knights. Their loyalty outlasted their flesh.', condition: always },
  { id: 'p3_lore_18', priority: 3, text: 'Cinder-Shamans pray to a dead fire god. Whatever answers them... isn\'t holy.', condition: always },
  { id: 'p3_lore_19', priority: 3, text: 'Volt-Hounds always hunt in pairs. Watch your flanks.', condition: always },
  { id: 'p3_lore_20', priority: 3, text: 'Frost-Sentinels were statues of old kings. The anomaly gave them a cruel mimicry of life.', condition: always },
  { id: 'p3_lore_21', priority: 3, text: 'Time-Weavers are the Lich\'s apprentices. They teleport because they are unstuck in time.', condition: always },
  { id: 'p3_lore_22', priority: 3, text: 'If you see an Elite with a glowing aura, kill it fast. Or run. Mostly run.', condition: always },
  { id: 'p3_lore_23', priority: 3, text: 'Wealthy Elites flee toward the stairs. Catch them, and your Echo pouch will thank you.', condition: always },
  { id: 'p3_lore_24', priority: 3, text: "The Eternity Tree doesn't need sunlight. It feeds on stability.", condition: always },
  { id: 'p3_lore_25', priority: 3, text: 'Do you ever sleep? I try to, but the nightmares are just memories of this place.', condition: always },
  { id: 'p3_lore_26', priority: 3, text: 'Another loop, another chance to die creatively.', condition: always },
  { id: 'p3_lore_27', priority: 3, text: 'At least your armor is clean. Mostly.', condition: always },
  { id: 'p3_lore_28', priority: 3, text: "Did you know you hum when you're preparing to descend? It's a sad tune.", condition: always },
  { id: 'p3_lore_29', priority: 3, text: 'If I had a coin for every time you died... well, Echoes will have to do.', condition: always },
  { id: 'p3_lore_30', priority: 3, text: 'Keep moving. Momentum is the only thing the anomaly respects.', condition: always },
  { id: 'p3_lore_31', priority: 3, text: "Bracing before an attack isn't cowardice. It's tactics.", condition: always },
  { id: 'p3_lore_32', priority: 3, text: 'Hitting them where they\'re weak breaks their rhythm. Remember the elements.', condition: always },
  { id: 'p3_lore_33', priority: 3, text: 'Skills cost Stamina. Dead men don\'t regenerate Stamina.', condition: always },
  { id: 'p3_lore_34', priority: 3, text: "That lantern of mine? It doesn't use oil. It burns the seconds I have left.", condition: always },
  { id: 'p3_lore_35', priority: 3, text: "You're the only one of us who can still cross the threshold. Don't waste the privilege.", condition: always },
  { id: 'p3_lore_36', priority: 3, text: "The air is getting heavier. The Lich knows you're making progress.", condition: always },
  { id: 'p3_lore_37', priority: 3, text: "I'd offer to go with you, but my knees haven't worked since the Shattering.", condition: always },
  { id: 'p3_lore_38', priority: 3, text: 'Every time you die, a little bit of Oakhaven fades away. Make it count.', condition: always },
  { id: 'p3_lore_39', priority: 3, text: "Look at the terminal. It's the only thing the Lich doesn't control.", condition: always },
  { id: 'p3_lore_40', priority: 3, text: 'Bone-Knights march in the same formation they died in. Some habits outlast the body.', condition: always },
  { id: 'p3_lore_41', priority: 3, text: 'The Inferno-Golems were once the citadel\'s forges, given a cruel kind of life.', condition: always },
  { id: 'p3_lore_42', priority: 3, text: 'Storm-Callers used to ring the watchtower bells. Now they just make noise that kills.', condition: always },
  { id: 'p3_lore_43', priority: 3, text: 'Glacial-Knights guarded the treasury. Whatever they\'re guarding now, it isn\'t gold.', condition: always },
  { id: 'p3_lore_44', priority: 3, text: "The Chrono-Anvil doesn't forge new steel. It just remembers steel that was better.", condition: always },
  { id: 'p3_lore_45', priority: 3, text: 'Echo Wells are the closest thing down there to mercy. Use them.', condition: always },
  { id: 'p3_lore_46', priority: 3, text: "A Cursed Rift isn't a doorway. It's a wound. Don't linger near one.", condition: always },
  { id: 'p3_lore_47', priority: 3, text: "The Masamune wasn't forged here. I don't know where it came from, and neither does it.", condition: always },
  { id: 'p3_lore_48', priority: 3, text: "Every Anchor you place is a promise the Keep can't break twice.", condition: always },
  { id: 'p3_lore_49', priority: 3, text: "You flinch less than you used to. I can't decide if that's progress or damage.", condition: always },
  { id: 'p3_lore_50', priority: 3, text: 'Some loops, I forget your name before you even reach the stairs. Then you come back, and I remember everything.', condition: always },
];

// ---- Priority 4: Short dismissal barks (10) — only surfaced after a repeat talk this visit. ----
const BARKS: DialogueLine[] = [
  { id: 'p4_bark_01', priority: 4, text: 'I already told you. Get moving.', condition: always },
  { id: 'p4_bark_02', priority: 4, text: 'The stairs are that way.', condition: always },
  { id: 'p4_bark_03', priority: 4, text: 'Stop bothering an old man.', condition: always },
  { id: 'p4_bark_04', priority: 4, text: 'Focus, Warden.', condition: always },
  { id: 'p4_bark_05', priority: 4, text: 'Tick tock. The clock is waiting.', condition: always },
  { id: 'p4_bark_06', priority: 4, text: "We'll talk when you return. If you return.", condition: always },
  { id: 'p4_bark_07', priority: 4, text: 'Need a map? Too bad, the layout changes anyway.', condition: always },
  { id: 'p4_bark_08', priority: 4, text: 'Save your breath for the descent.', condition: always },
  { id: 'p4_bark_09', priority: 4, text: 'Are you stalling?', condition: always },
  { id: 'p4_bark_10', priority: 4, text: "The Lich isn't going to kill himself.", condition: always },
];

export const DIALOGUE_POOL: readonly DialogueLine[] = [...MILESTONES, ...REACTIVE, ...LORE, ...BARKS];

function pickRandom<T>(arr: readonly T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Priority 4 first if this is a repeat talk this visit; otherwise the lowest eligible priority group. */
export function selectDialogueLine(state: GameState): DialogueLine | null {
  if (session.talkedToSilasThisHubVisit > 0) {
    return pickRandom(BARKS);
  }

  const eligible = DIALOGUE_POOL.filter((line) => {
    if (line.priority === 1 && state.persistent.dialogueSeenIds.includes(line.id)) return false;
    return line.condition(state, session);
  });
  if (eligible.length === 0) return null;

  const topPriority = Math.min(...eligible.map((line) => line.priority));
  return pickRandom(eligible.filter((line) => line.priority === topPriority));
}

let activeDialogueText: string | null = null;

/** Selects a line for the current bump and opens the modal; no-op if nothing is eligible. */
export function openDialogue(state: GameState): void {
  const line = selectDialogueLine(state);
  if (!line) return;
  activeDialogueText = line.text;
  if (line.priority === 1) {
    state.persistent.dialogueSeenIds.push(line.id);
    saveGame(state);
  }
  session.talkedToSilasThisHubVisit += 1;
}

export function getActiveDialogueText(): string | null {
  return activeDialogueText;
}

export function closeDialogue(): void {
  activeDialogueText = null;
}
