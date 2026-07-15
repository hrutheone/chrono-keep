// Phase 7 balancing harness (GDD Section 10): drives the real game-state
// machine headlessly (no canvas/DOM) with a simple "informed player" bot
// across many seeds, collecting the stats Phase 7 asks for: turns per
// floor, Echoes per loop, loop count at victory, weapon drop frequency, and
// net turn refunds (Time Shards / Chrono-Blade / Dash Lvl 3).
//
// Minimal browser-global shims so the game modules' function-body DOM/window
// calls (CRT warp, boss-gate confirm, localStorage saves) no-op instead of
// throwing; nothing in any module touches these at import/module-top-level,
// so it's safe to install the shims after the imports below run.

import { createNewGameState } from '../src/state';
import { enterFloor, isWalkable, TILE } from '../src/mapgen';
import { onFloorEntered } from '../src/echoes';
import { continueAfterDeath, isTurnBusy } from '../src/turnController';
import { tryMove, passTurn } from '../src/movement';
import { useSkill } from '../src/skills';
import { equipItem, usePotion } from '../src/inventory';
import { buySkillUpgrade, buyStatUpgrade, type StatTrack } from '../src/shop';
import { SKILLS } from '../src/content';
import { isRunOver } from '../src/turns';
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

function currentTarget(state: GameState): { x: number; y: number } | null {
  if (state.run.currentFloor === 4) {
    const boss = state.dungeon.enemies.find((e) => e.kind === 'CHRONO_LICH');
    return boss ? { x: boss.x, y: boss.y } : null;
  }
  const anchor = state.dungeon.items.find((i) => i.item.kind === 'ANCHOR');
  if (anchor) return { x: anchor.x, y: anchor.y };
  for (let y = 0; y < state.dungeon.height; y++) {
    for (let x = 0; x < state.dungeon.width; x++) {
      if (state.dungeon.tiles[y][x] === TILE.STAIRS) return { x, y };
    }
  }
  return null;
}

/** Equips any strictly-better weapon/first accessory sitting in inventory. */
function maybeEquipBetterGear(state: GameState): void {
  const { inventory, equippedWeapon, equippedAccessory } = state.run;
  const weaponIdx = inventory.findIndex((i) => i.kind === 'WEAPON' && (!equippedWeapon || (i as Weapon).atk > equippedWeapon.atk));
  if (weaponIdx !== -1) {
    equipItem(state, weaponIdx);
    return;
  }
  if (!equippedAccessory) {
    const accIdx = inventory.findIndex((i) => i.kind === 'ACCESSORY');
    if (accIdx !== -1) equipItem(state, accIdx);
  }
}

interface SeedStats {
  won: boolean;
  loops: number;
  turnsPerFloor: number[][]; // per loop: [floor1, floor2, floor3, boss?]
  echoesPerLoop: number[];
  weaponPickups: Map<string, number>;
  netTurnRefunds: number;
  stuck: number;
  deepestFloorPerLoop: number[];
  bossAttempts: number;
  deathCauses: { timeout: number; hp: number };
}

async function botStep(state: GameState, stats: SeedStats): Promise<void> {
  if (state.ui.currentScreen !== 'GAME' || isTurnBusy() || isRunOver(state)) return;

  if (state.run.currentHp < state.run.maxHp * 0.4) {
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
  const invLenBefore = state.run.inventory.length;

  if (adj) {
    // An "informed player" leans on Cleave's damage multiplier over a plain
    // bump-attack whenever it's assigned, unlocked, and affordable.
    state.run.facing = adj.facing;
    const cleaveSlot = state.run.activeSkills.indexOf('cleave');
    const cleaveLevel = state.persistent.skills.cleave ?? 0;
    if (cleaveSlot !== -1 && cleaveLevel > 0 && state.run.currentStamina >= SKILLS.cleave.stamina) {
      await useSkill(state, cleaveSlot as 0 | 1);
    } else {
      await tryMove(state, adj.dx, adj.dy, adj.facing);
    }
  } else if (!step) {
    await passTurn(state);
  } else {
    await tryMove(state, step.dx, step.dy, step.facing);
  }

  if (state.run.inventory.length > invLenBefore) {
    const newItem = state.run.inventory[state.run.inventory.length - 1];
    if (newItem.kind === 'WEAPON') stats.weaponPickups.set(newItem.name, (stats.weaponPickups.get(newItem.name) ?? 0) + 1);
  }
  // A turn normally costs 1 (2 if Chilled-moving); anything beyond that is a
  // refund from a Time Shard, Chrono-Blade kill, or Dash Lvl 3.
  const spent = turnsBefore - state.run.turnsRemaining;
  if (spent < 1) stats.netTurnRefunds += 1 - spent;
}

const STAT_ORDER: StatTrack[] = ['turnBonusUpgrade', 'maxHpUpgrade', 'maxStamUpgrade'];

/** Greedy "informed player" spend: turn budget and survivability first, then skills. */
function spendEchoesHeuristically(state: GameState): void {
  // Cleave first: cheap (15) and it's the bot's whole offensive skill plan.
  if ((state.persistent.skills.cleave ?? 0) === 0) buySkillUpgrade(state, 'cleave');
  if (!state.run.activeSkills.includes('cleave')) state.run.activeSkills[1] = 'cleave';

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

const MAX_STEPS_PER_LOOP = 3000;

async function playOneLoop(state: GameState, stats: SeedStats): Promise<'won' | 'died' | 'stuck'> {
  const floorTurns: number[] = [];
  let lastFloor = state.run.currentFloor;
  let turnsAtFloorStart = state.run.turnsRemaining;
  let deepestFloor = state.run.currentFloor;

  for (let i = 0; i < MAX_STEPS_PER_LOOP; i++) {
    deepestFloor = Math.max(deepestFloor, state.run.currentFloor);
    if (state.ui.currentScreen === 'VICTORY') {
      floorTurns.push(turnsAtFloorStart - state.run.turnsRemaining);
      stats.turnsPerFloor.push(floorTurns);
      stats.deepestFloorPerLoop.push(deepestFloor);
      return 'won';
    }
    if (state.ui.currentScreen === 'DEATH') {
      floorTurns.push(turnsAtFloorStart - state.run.turnsRemaining);
      stats.turnsPerFloor.push(floorTurns);
      stats.deepestFloorPerLoop.push(deepestFloor);
      if (state.run.turnsRemaining <= 0) stats.deathCauses.timeout += 1;
      else stats.deathCauses.hp += 1;
      if (deepestFloor >= 4) stats.bossAttempts += 1;
      return 'died';
    }
    if (state.run.currentFloor !== lastFloor) {
      floorTurns.push(turnsAtFloorStart - state.run.turnsRemaining);
      turnsAtFloorStart = state.run.turnsRemaining;
      lastFloor = state.run.currentFloor;
    }
    await botStep(state, stats);
    await flushTimers();
  }
  stats.turnsPerFloor.push(floorTurns);
  stats.deepestFloorPerLoop.push(deepestFloor);
  return 'stuck';
}

async function simulateSeed(seed: number, maxLoops: number): Promise<SeedStats> {
  const state = createNewGameState();
  state.persistent.rngSeed = seed;
  enterFloor(state, 1);
  onFloorEntered(state);
  state.ui.currentScreen = 'GAME';

  const stats: SeedStats = {
    won: false,
    loops: 0,
    turnsPerFloor: [],
    echoesPerLoop: [],
    weaponPickups: new Map(),
    netTurnRefunds: 0,
    stuck: 0,
    deepestFloorPerLoop: [],
    bossAttempts: 0,
    deathCauses: { timeout: 0, hp: 0 },
  };

  for (let loop = 0; loop < maxLoops; loop++) {
    const echoesBefore = state.persistent.echoes;
    const result = await playOneLoop(state, stats);
    stats.echoesPerLoop.push(state.persistent.echoes - echoesBefore);

    if (result === 'won') {
      stats.won = true;
      stats.loops = loop + 1;
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
  const SEEDS = 20;
  const MAX_LOOPS = 15;
  const results: SeedStats[] = [];

  for (let i = 0; i < SEEDS; i++) {
    const seed = 1000 + i * 7919; // arbitrary spread, deterministic across runs
    results.push(await simulateSeed(seed, MAX_LOOPS));
  }

  const wins = results.filter((r) => r.won);
  const winLoops = wins.map((r) => r.loops);
  const allEchoesPerLoop = results.flatMap((r) => r.echoesPerLoop);
  const allFloorTurns = results.flatMap((r) => r.turnsPerFloor.flat());
  const totalStuck = results.reduce((a, r) => a + r.stuck, 0);
  const totalRefunds = results.reduce((a, r) => a + r.netTurnRefunds, 0);

  const weaponTotals = new Map<string, number>();
  for (const r of results) for (const [name, count] of r.weaponPickups) weaponTotals.set(name, (weaponTotals.get(name) ?? 0) + count);

  const allDeepestFloors = results.flatMap((r) => r.deepestFloorPerLoop);
  const totalBossAttempts = results.reduce((a, r) => a + r.bossAttempts, 0);
  const totalTimeoutDeaths = results.reduce((a, r) => a + r.deathCauses.timeout, 0);
  const totalHpDeaths = results.reduce((a, r) => a + r.deathCauses.hp, 0);
  const floorReachedCounts = [1, 2, 3, 4].map((f) => allDeepestFloors.filter((d) => d >= f).length);

  console.log(`\n=== Phase 7 Simulation Report (${SEEDS} seeds, cap ${MAX_LOOPS} loops) ===`);
  console.log(`Wins: ${wins.length}/${SEEDS} (${((wins.length / SEEDS) * 100).toFixed(0)}%)`);
  console.log(summarize('Loops to victory', winLoops));
  console.log(`Target: 5-8 loops to win (GDD Section 1/7 tuning target).`);
  console.log(summarize('Echoes earned per loop', allEchoesPerLoop));
  console.log(summarize('Turns spent per floor (all floors incl. boss)', allFloorTurns));
  console.log(`Bot got stuck (hit the ${MAX_STEPS_PER_LOOP}-step safety valve) ${totalStuck} time(s) across all seeds/loops.`);
  console.log(`Net turn refunds (Time Shard/Chrono-Blade/Dash Lvl3) observed: ${totalRefunds}.`);
  console.log(`Loops that reached Floor 1/2/3/4(boss): ${floorReachedCounts.join(' / ')} out of ${allDeepestFloors.length} loops.`);
  console.log(`Boss fight attempts: ${totalBossAttempts}. Deaths by timeout: ${totalTimeoutDeaths}, by HP: ${totalHpDeaths}.`);
  console.log('Weapon pickup frequency:');
  for (const [name, count] of [...weaponTotals.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }

  if (wins.length === 0) console.log('\nWARNING: no seed won within the loop cap — the run may be under-tuned (too hard).');
  else if (wins.length === SEEDS && winLoops.every((l) => l <= 3)) console.log('\nWARNING: every seed won trivially fast — the run may be under-tuned (too easy).');
}

void main();
