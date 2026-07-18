// Phase 17 balancing harness (GDD Section 10): drives the real game-state
// machine headlessly (no canvas/DOM) with a simple "informed player" bot
// through the 99-Floor Descent — Hub warp-in, procedural floors, Mini-Boss
// Arenas, and the Floor 99 Chrono-Lich — collecting the stats Phase 17 asks
// for: loops-per-Biome-unlock pacing, warp-in re-gear viability (early
// deaths right after a fresh warp), Echo income per loop, and the depth
// curve. Rewritten from the Phase 7 harness, which only knew the old 4-floor
// (3 procedural + 1 boss) build — see git history for that version.
//
// Minimal browser-global shims so the game modules' function-body DOM/window
// calls (CRT warp, boss-gate confirm, localStorage saves) no-op instead of
// throwing; nothing in any module touches these at import/module-top-level,
// so it's safe to install the shims after the imports below run.

import { createNewGameState } from '../src/state';
import { isWalkable, TILE } from '../src/mapgen';
import { continueAfterDeath, isTurnBusy } from '../src/turnController';
import { tryMove, passTurn } from '../src/movement';
import { answerPendingConfirm } from '../src/menus';
import { useSkill } from '../src/skills';
import { INVENTORY_CAP, equipItem, meltItem, usePotion } from '../src/inventory';
import { buySkillUpgrade, buyStatUpgrade, type StatTrack } from '../src/shop';
import { SKILLS, WEAPON_RANGE } from '../src/content';
import { isRunOver } from '../src/turns';
import { warpToFloor } from '../src/hub';
import { isArenaFloor, archetypeForFloor } from '../src/arenas';
import { FINAL_BOSS_FLOOR } from '../src/bossArena';
import type { GameState, Weapon } from '../src/types';

const memoryStore = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => memoryStore.set(k, v),
  removeItem: (k: string) => memoryStore.delete(k),
};
(globalThis as unknown as { window: unknown }).window = { confirm: () => true, addEventListener: () => {} };
(globalThis as unknown as { document: unknown }).document = { querySelector: () => null };
// Hit-Stop's 100ms freeze and the CRT warp's 600ms delay are real UX pacing,
// not something a headless bot needs to sit through across thousands of turns.
const realSetTimeout = globalThis.setTimeout;
(globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((fn: (...a: unknown[]) => void, _ms?: number, ...args: unknown[]) =>
  realSetTimeout(fn, 0, ...args)) as typeof setTimeout;

/** Yields a real macrotask tick so any pending stubbed setTimeout (the CRT
 * warp's DEATH-screen transition) gets a chance to fire before the bot's
 * next decision — otherwise a tight async loop can race ahead of it. */
function flushTimers(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

type Facing = GameState['run']['facing'];
const ORTHO: readonly [number, number, Facing][] = [
  [1, 0, 'RIGHT'],
  [-1, 0, 'LEFT'],
  [0, 1, 'DOWN'],
  [0, -1, 'UP'],
];

/** BFS first-step toward (tx, ty); null if already there or unreachable. */
function nextStepToward(state: GameState, tx: number, ty: number): { dx: number; dy: number; facing: Facing } | null {
  const { tiles, width, height } = state.dungeon;
  const { playerX: sx, playerY: sy } = state.run;
  if (sx === tx && sy === ty) return null;
  const startIdx = sy * width + sx;
  const goalIdx = ty * width + tx;
  const parent = new Int32Array(width * height).fill(-2);
  parent[startIdx] = -1;
  const queue = [startIdx];
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    if (idx === goalIdx) break;
    const x = idx % width;
    const y = (idx - x) / width;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nidx = ny * width + nx;
      if (parent[nidx] !== -2 || !isWalkable(tiles[ny][nx])) continue;
      parent[nidx] = idx;
      queue.push(nidx);
    }
  }
  if (parent[goalIdx] === -2) return null;
  let cur = goalIdx;
  while (parent[cur] !== -1 && parent[parent[cur]] !== -1) cur = parent[cur];
  if (parent[cur] === -1) return null; // goal is the very first step
  const curX = cur % width;
  const curY = (cur - curX) / width;
  const dx = curX - sx;
  const dy = curY - sy;
  const dir = ORTHO.find(([ddx, ddy]) => ddx === dx && ddy === dy);
  return dir ? { dx, dy, facing: dir[2] } : null;
}

function adjacentEnemy(state: GameState): { dx: number; dy: number; facing: Facing } | null {
  for (const [dx, dy, facing] of ORTHO) {
    const nx = state.run.playerX + dx;
    const ny = state.run.playerY + dy;
    if (state.dungeon.enemies.some((e) => e.x === nx && e.y === ny)) return { dx, dy, facing };
  }
  return null;
}

/** Arena floors (Mini-Boss or Floor 99) target the boss by kind — a summoned
 * pack-mate (Storm-Caller/Chrono-Lich both summon) must not distract the
 * bot's pathing from the actual objective. Once the boss is dead, target its
 * item drop pile, then whatever Stairs the kill revealed (Mini-Boss Arenas
 * only — Floor 99 has none, victory ends the loop before this matters).
 *
 * Procedural floors loot the closest unpicked item (chest/potion) BEFORE
 * heading to Stairs — an early version of this bot beelined straight to
 * Stairs and only picked up whatever happened to sit on that exact path,
 * starving it of gear across 99 floors in a way that never showed up in the
 * old 3-floor harness (a short beeline naturally passed most of the loot
 * anyway). Dynamic Chest Loot (GDD Section 7) is tuned assuming a player
 * actually collects it. */
function currentTarget(state: GameState): { x: number; y: number } | null {
  const floor = state.run.currentFloor;
  const bossKind = floor === FINAL_BOSS_FLOOR ? 'CHRONO_LICH' : isArenaFloor(floor) ? archetypeForFloor(floor) : null;
  if (bossKind) {
    const boss = state.dungeon.enemies.find((e) => e.kind === bossKind);
    if (boss) return { x: boss.x, y: boss.y };
    const drop = state.dungeon.items[0];
    if (drop) return { x: drop.x, y: drop.y };
    // fall through to the Stairs scan below — the opened Boss Gate.
  } else if (state.dungeon.items.length > 0 && state.run.inventory.length < INVENTORY_CAP) {
    // A full inventory can't pick anything up (pickupItemsAt no-ops) — without
    // this guard the bot fixates on the same uncollectable item for the rest
    // of the floor's turn budget instead of moving on to Stairs.
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const it of state.dungeon.items) {
      const d = Math.abs(it.x - state.run.playerX) + Math.abs(it.y - state.run.playerY);
      if (d < bestDist) {
        bestDist = d;
        best = { x: it.x, y: it.y };
      }
    }
    if (best) return best;
  }
  for (let y = 0; y < state.dungeon.height; y++) {
    for (let x = 0; x < state.dungeon.width; x++) {
      if (state.dungeon.tiles[y][x] === TILE.STAIRS) return { x, y };
    }
  }
  return null;
}

/** The bot has no logic to stand off at range, so a min-range weapon (Ashwood
 * Bow, Static Whip: "cannot hit adjacent") would leave it unable to fight at
 * all. Skip those specifically; every other weapon is fair game by raw ATK. */
function botCanUseWeapon(weapon: Weapon): boolean {
  const profile = WEAPON_RANGE[weapon.passive];
  return !profile || profile.min <= 1;
}

function maybeEquipBetterGear(state: GameState): void {
  const { inventory, equippedWeapon, equippedAccessory } = state.run;
  const weaponIdx = inventory.findIndex(
    (i) => i.kind === 'WEAPON' && botCanUseWeapon(i as Weapon) && (!equippedWeapon || (i as Weapon).atk > equippedWeapon.atk),
  );
  if (weaponIdx !== -1) {
    equipItem(state, weaponIdx);
    return;
  }
  if (!equippedAccessory) {
    const accIdx = inventory.findIndex((i) => i.kind === 'ACCESSORY');
    if (accIdx !== -1) {
      equipItem(state, accIdx);
      return;
    }
  }
  // Deadweight cleanup: a WEAPON/ACCESSORY that reaches this point wasn't
  // worth equipping and the bot has no other use for it (no sell/trade) — an
  // early version hoarded these until the 10-slot cap filled with gear it
  // would never touch again, which then blocked every further Dynamic Chest
  // Loot pickup (Potions/Time Shards/Anchors included) for the rest of the
  // floor. Melt one only once actually at cap, so the bot still carries
  // spares for later comparisons otherwise.
  if (inventory.length >= INVENTORY_CAP) {
    const junkIdx = inventory.findIndex((i) => i.kind === 'WEAPON' || i.kind === 'ACCESSORY');
    if (junkIdx !== -1) meltItem(state, junkIdx);
  }
}

interface SeedStats {
  won: boolean;
  loops: number;
  winFloor: number;
  echoesPerLoop: number[];
  netTurnRefunds: number;
  stuck: number;
  deepestFloorPerLoop: number[];
  turnsAtLoopStart: number[]; // turnsRemaining on the floor the bot warped into, each loop
  earlyDeaths: number; // died within EARLY_DEATH_TURN_BUDGET turns of a loop start — "warp-in re-gear" failing
  deathCauses: { timeout: number; hp: number };
  anchorUnlockLoops: number[]; // loop index (1-based) at which each new Biome anchor unlocked
}

const EARLY_DEATH_TURN_BUDGET = 15;

async function botStep(state: GameState, stats: SeedStats): Promise<void> {
  // The Arena Threshold Warning (Mini-Boss Arenas and Floor 99 alike) is a
  // styled confirm overlay, not a blocking window.confirm() — the bot always
  // proceeds, same as the old stubbed `window.confirm = () => true`.
  if (state.ui.currentScreen === 'CONFIRM') {
    answerPendingConfirm(state, true);
    return;
  }
  if (state.ui.currentScreen !== 'GAME' || isTurnBusy() || isRunOver(state)) return;

  if (state.run.currentHp < state.run.maxHp * 0.4) {
    // Chakra first when it's actually usable — a 0-net-turn-cost heal (Lv1:
    // 20% Max HP) that doesn't burn a Potion, so preferred over the item
    // whenever the bot can afford its Stamina.
    const chakraSlot = state.run.activeSkills.indexOf('chakra');
    const chakraLevel = state.persistent.skills.chakra ?? 0;
    if (chakraSlot !== -1 && chakraLevel > 0 && state.run.currentStamina >= SKILLS.chakra.stamina) {
      await useSkill(state, chakraSlot as 0 | 1 | 2 | 3);
      return;
    }
    const potionIdx = state.run.inventory.findIndex((i) => i.kind === 'POTION');
    if (potionIdx !== -1) {
      usePotion(state, potionIdx);
      return;
    }
  }
  maybeEquipBetterGear(state);

  const adj = adjacentEnemy(state);
  const step = adj ?? (() => {
    const target = currentTarget(state);
    return target ? nextStepToward(state, target.x, target.y) : null;
  })();

  const turnsBefore = state.run.turnsRemaining;

  if (adj) {
    // An "informed player" leans on a skill's damage multiplier/AOE over a
    // plain bump-attack whenever one's assigned, unlocked, and affordable.
    state.run.facing = adj.facing;
    // Flame Arc hits every orthogonally-adjacent enemy at once (no facing
    // needed) — worth it over Cleave's single-facing-direction cleave once
    // 2+ enemies are adjacent simultaneously (Volt-Hound pairs, chokepoint
    // clusters), where Cleave would only ever catch one of them.
    const adjacentEnemyCount = ORTHO.filter(([dx, dy]) =>
      state.dungeon.enemies.some((e) => e.x === state.run.playerX + dx && e.y === state.run.playerY + dy),
    ).length;
    const flameArcSlot = state.run.activeSkills.indexOf('flame_arc');
    const flameArcLevel = state.persistent.skills.flame_arc ?? 0;
    const cleaveSlot = state.run.activeSkills.indexOf('cleave');
    const cleaveLevel = state.persistent.skills.cleave ?? 0;
    if (adjacentEnemyCount >= 2 && flameArcSlot !== -1 && flameArcLevel > 0 && state.run.currentStamina >= SKILLS.flame_arc.stamina) {
      await useSkill(state, flameArcSlot as 0 | 1 | 2 | 3);
    } else if (cleaveSlot !== -1 && cleaveLevel > 0 && state.run.currentStamina >= SKILLS.cleave.stamina) {
      await useSkill(state, cleaveSlot as 0 | 1 | 2 | 3);
    } else {
      await tryMove(state, adj.dx, adj.dy, adj.facing);
    }
  } else if (!step) {
    await passTurn(state);
  } else {
    await tryMove(state, step.dx, step.dy, step.facing);
  }

  // A turn normally costs 1 (2 if Chilled-moving); anything beyond that is a
  // refund from a Time Shard, Chrono-Blade kill, or Dash Lvl 3.
  const spent = turnsBefore - state.run.turnsRemaining;
  if (spent < 1) stats.netTurnRefunds += 1 - spent;
}

const STAT_ORDER: StatTrack[] = ['baseAtkUpgrade', 'turnBonusUpgrade', 'maxHpUpgrade', 'maxStamUpgrade'];

/** Greedy "informed player" spend: turn budget and survivability first, then skills. */
function spendEchoesHeuristically(state: GameState): void {
  // Cleave, Chakra, Flame Arc first, in that order: cheap and each covers a
  // distinct tactical role in botStep (Cleave = single-target offense,
  // Chakra = 0-net-turn-cost self-heal, Flame Arc = omnidirectional AOE
  // once 2+ enemies are adjacent). Ice Aegis and the 20 other Phase 18
  // skills are still bought/upgraded by the greedy loop below when
  // affordable — they just don't get a dedicated botStep behavior, so
  // owning them helps nothing beyond banking Echo spend efficiently.
  for (const skillId of ['cleave', 'chakra', 'flame_arc']) {
    if ((state.persistent.skills[skillId] ?? 0) === 0) buySkillUpgrade(state, skillId);
  }
  // Writing only `run.activeSkills` here was a no-op in practice: every
  // loop's warpToFloor() -> resetRunForNewLoop() rebuilds `run.activeSkills`
  // from `persistent.skillLoadout` right before the next floor is even
  // played, wiping this out before the bot ever got to swing Cleave once.
  // `persistent.skillLoadout` is the one that has to change (menus.ts's real
  // assignSkill writes both for the same reason). Slots: 0=Q (Dash, unused
  // by the bot but harmless to leave), 1=E (Cleave), 2=R (Chakra), 3=F
  // (Flame Arc).
  const LOADOUT_SLOTS: [string, number][] = [['cleave', 1], ['chakra', 2], ['flame_arc', 3]];
  for (const [skillId, slot] of LOADOUT_SLOTS) {
    if (!state.persistent.skillLoadout.includes(skillId)) {
      state.persistent.skillLoadout[slot] = skillId;
      state.run.activeSkills[slot] = skillId;
    }
  }

  let progressed = true;
  while (progressed) {
    progressed = false;
    if (buySkillUpgrade(state, 'cleave')) {
      progressed = true;
      continue;
    }
    for (const track of STAT_ORDER) {
      if (buyStatUpgrade(state, track)) {
        progressed = true;
        break;
      }
    }
    if (progressed) continue;
    for (const skillId of Object.keys(SKILLS)) {
      if (buySkillUpgrade(state, skillId)) {
        progressed = true;
        break;
      }
    }
  }
}

const MAX_STEPS_PER_LOOP = 12000;

/** The frontier floor to warp into: the deepest unlocked Biome-start Anchor,
 * or Floor 1 with none yet — the same "always push from where you last left
 * off" choice a real player makes at the Shortcut Gate (GDD Section 7). */
function frontierFloor(state: GameState): number {
  return state.persistent.unlockedAnchors.length === 0 ? 1 : Math.max(...state.persistent.unlockedAnchors);
}

// `state.ui.currentScreen = 'GAME'` right before this loop's own reads of
// that same field, in the same function, sends TS's control-flow analysis
// down a path where it narrows the field to the 'GAME' literal for the rest
// of the function and then flags the VICTORY/DEATH comparisons below as
// unreachable — even though botStep can (and does) reassign it. Setting it
// one function call away, in simulateSeed, sidesteps that narrowing.
async function playOneLoop(state: GameState, stats: SeedStats, loopIndex: number, startFloor: number): Promise<'won' | 'died' | 'stuck'> {
  stats.turnsAtLoopStart.push(state.run.turnsRemaining);
  let anchorsSeen = state.persistent.unlockedAnchors.length;

  let deepestFloor = state.run.currentFloor;
  const turnBudgetAtStart = state.run.turnsRemaining;

  for (let i = 0; i < MAX_STEPS_PER_LOOP; i++) {
    deepestFloor = Math.max(deepestFloor, state.run.currentFloor);
    if (state.persistent.unlockedAnchors.length > anchorsSeen) {
      // A new Biome unlocked mid-loop — record it once, at the loop it
      // happened in, then raise the watermark so it isn't re-recorded on
      // every remaining step of this same loop.
      for (let n = anchorsSeen; n < state.persistent.unlockedAnchors.length; n++) stats.anchorUnlockLoops.push(loopIndex);
      anchorsSeen = state.persistent.unlockedAnchors.length;
    }
    if (state.ui.currentScreen === 'VICTORY') {
      stats.deepestFloorPerLoop.push(deepestFloor);
      return 'won';
    }
    if (state.ui.currentScreen === 'DEATH') {
      stats.deepestFloorPerLoop.push(deepestFloor);
      const turnsIntoLoop = turnBudgetAtStart - state.run.turnsRemaining;
      if (state.run.currentFloor === startFloor && turnsIntoLoop <= EARLY_DEATH_TURN_BUDGET) stats.earlyDeaths += 1;
      if (state.run.turnsRemaining <= 0) stats.deathCauses.timeout += 1;
      else stats.deathCauses.hp += 1;
      return 'died';
    }
    await botStep(state, stats);
    await flushTimers();
  }
  stats.deepestFloorPerLoop.push(deepestFloor);
  return 'stuck';
}

async function simulateSeed(seed: number, maxLoops: number): Promise<SeedStats> {
  const state = createNewGameState();
  state.persistent.rngSeed = seed;

  const stats: SeedStats = {
    won: false,
    loops: 0,
    winFloor: 0,
    echoesPerLoop: [],
    netTurnRefunds: 0,
    stuck: 0,
    deepestFloorPerLoop: [],
    turnsAtLoopStart: [],
    earlyDeaths: 0,
    deathCauses: { timeout: 0, hp: 0 },
    anchorUnlockLoops: [],
  };

  for (let loop = 1; loop <= maxLoops; loop++) {
    const echoesBefore = state.persistent.echoes;
    const startFloor = frontierFloor(state);
    warpToFloor(state, startFloor);
    state.ui.currentScreen = 'GAME';
    const result = await playOneLoop(state, stats, loop, startFloor);
    stats.echoesPerLoop.push(state.persistent.echoes - echoesBefore);

    if (result === 'won') {
      stats.won = true;
      stats.loops = loop;
      stats.winFloor = FINAL_BOSS_FLOOR;
      return stats;
    }
    if (result === 'stuck') stats.stuck += 1;

    continueAfterDeath(state);
    spendEchoesHeuristically(state);
    state.ui.currentScreen = 'GAME';
  }
  stats.loops = maxLoops;
  return stats;
}

function summarize(label: string, values: number[]): string {
  if (values.length === 0) return `${label}: (no data)`;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  return `${label}: mean=${mean.toFixed(1)} median=${median} min=${sorted[0]} max=${sorted[sorted.length - 1]} (n=${values.length})`;
}

async function main(): Promise<void> {
  const SEEDS = 4;
  const MAX_LOOPS = 30;
  const results: SeedStats[] = [];

  for (let i = 0; i < SEEDS; i++) {
    const seed = 1000 + i * 7919; // arbitrary spread, deterministic across runs
    results.push(await simulateSeed(seed, MAX_LOOPS));
  }

  const wins = results.filter((r) => r.won);
  const winLoops = wins.map((r) => r.loops);
  const allEchoesPerLoop = results.flatMap((r) => r.echoesPerLoop);
  const totalStuck = results.reduce((a, r) => a + r.stuck, 0);
  const totalRefunds = results.reduce((a, r) => a + r.netTurnRefunds, 0);
  const totalEarlyDeaths = results.reduce((a, r) => a + r.earlyDeaths, 0);
  const totalLoops = results.reduce((a, r) => a + r.loops, 0);

  const allDeepestFloors = results.flatMap((r) => r.deepestFloorPerLoop);
  const totalTimeoutDeaths = results.reduce((a, r) => a + r.deathCauses.timeout, 0);
  const totalHpDeaths = results.reduce((a, r) => a + r.deathCauses.hp, 0);
  // Biome N starts at floor 10*(N-1)+1 (Floor 1, 11, 21, ...); "reached Biome N" == deepest floor >= that.
  const biomeStarts = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91];
  const biomeReachedCounts = biomeStarts.map((f) => allDeepestFloors.filter((d) => d >= f).length);

  // Loops-per-Biome pacing: consecutive gaps between anchor-unlock loop indices.
  const allGaps: number[] = [];
  for (const r of results) {
    const unlocks = [0, ...r.anchorUnlockLoops]; // loop 0 == starting at Floor 1, pre-any-unlock
    for (let i = 1; i < unlocks.length; i++) allGaps.push(unlocks[i] - unlocks[i - 1]);
  }

  console.log(`\n=== Phase 17 Simulation Report (${SEEDS} seeds, cap ${MAX_LOOPS} loops, 99-Floor Descent) ===`);
  console.log(`Wins: ${wins.length}/${SEEDS} (${((wins.length / SEEDS) * 100).toFixed(0)}%)`);
  console.log(summarize('Loops to victory (Floor 99)', winLoops));
  console.log(summarize('Loops-per-Biome-unlock (target 2-4)', allGaps));
  console.log(summarize('Echoes earned per loop', allEchoesPerLoop));
  console.log(summarize('Turns Remaining at each loop-start warp-in', results.flatMap((r) => r.turnsAtLoopStart)));
  console.log(summarize('Deepest floor per loop', allDeepestFloors));
  console.log(
    `Warp-in re-gear failures (died within ${EARLY_DEATH_TURN_BUDGET} turns of a fresh warp-in): ${totalEarlyDeaths}/${totalLoops} loops (${((totalEarlyDeaths / totalLoops) * 100).toFixed(0)}%).`,
  );
  console.log(`Bot got stuck (hit the ${MAX_STEPS_PER_LOOP}-step safety valve) ${totalStuck} time(s) across all seeds/loops.`);
  console.log(`Net turn refunds (Time Shard/Chrono-Blade/Dash Lvl3) observed: ${totalRefunds}.`);
  console.log('Depth curve — loops that reached each Biome start (1/11/21/.../91):');
  console.log(`  ${biomeReachedCounts.join(' / ')} out of ${allDeepestFloors.length} loops.`);
  console.log(`Deaths by timeout: ${totalTimeoutDeaths}, by HP: ${totalHpDeaths}.`);

  if (wins.length === 0) console.log('\nWARNING: no seed won within the loop cap — the run may be under-tuned (too hard) or the loop cap too low.');
  else if (wins.length === SEEDS && winLoops.every((l) => l <= 3)) console.log('\nWARNING: every seed won trivially fast — the run may be under-tuned (too easy).');
}

void main();
