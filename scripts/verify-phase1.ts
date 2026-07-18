// Generator acceptance check.

import { generateFloor, floorToAscii, PATH_BUDGET, TILE, type GeneratedFloor } from '../src/mapgen';
import { enterFloor } from '../src/mapgen';
import {
  BESTIARY,
  ELITE_AFFIX_KEYS,
  RELICS,
  RELIC_KEYS,
  SKILLS,
  WEAPON_KEYS,
  applyEliteAffixStats,
  createEnemy,
  createPotion,
  createRelicItemByEffect,
  createWeapon,
  depthMultiplier,
  enemyCountRangeForFloor,
  enemyPoolForFloor,
  pickRandomUnheldRelic,
  weaknessOf,
} from '../src/content';
import { createNewGameState, DUNGEON_SIZE, floorTurnLimit } from '../src/state';
import { hash } from '../src/rng';
import { HUB_FLOOR, enterHub, gateDestinations, warpToFloor } from '../src/hub';
import { ARENA_FLOORS, archetypeForFloor, enterArenaFloor } from '../src/arenas';
import { BOSS_ID, FINAL_BOSS_FLOOR, enterBossFloor } from '../src/bossArena';
import { enemyAttackPlayer, killEnemy, playerAttackEnemy } from '../src/combat';
import { GIANTS_ANVIL_ATK, pickupItemsAt, totalAtk, usePotion } from '../src/inventory';
import { resolvePlayerTurn } from '../src/turnController';
import { useSkill } from '../src/skills';
import type { GameState } from '../src/types';

// Shim document/window to prevent browser environment crash.
(globalThis as unknown as { window: unknown }).window = { addEventListener: () => {} };
(globalThis as unknown as { document: unknown }).document = { querySelector: () => null };

const N = DUNGEON_SIZE;
let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`FAIL [${label}]: ${msg}`);
}

// Independent BFS.
function walkDist(tiles: number[][], sx: number, sy: number, tx: number, ty: number): number {
  const walkable = (t: number): boolean => t === TILE.FLOOR || t === TILE.DOOR || t === TILE.STAIRS;
  const dist = new Map<number, number>([[sy * N + sx, 0]]);
  const queue = [sy * N + sx];
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    if (idx === ty * N + tx) return dist.get(idx)!;
    const x = idx % N;
    const y = (idx - x) / N;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nidx = ny * N + nx;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || dist.has(nidx) || !walkable(tiles[ny][nx])) continue;
      dist.set(nidx, dist.get(idx)! + 1);
      queue.push(nidx);
    }
  }
  return -1;
}

function checkFloor(label: string, floor: GeneratedFloor, floorNumber: number): number {
  const { tiles, enemies, items } = floor;

  // Verify turn-budget.
  const path = walkDist(tiles, floor.spawnX, floor.spawnY, floor.stairsX, floor.stairsY);
  if (path < 0) fail(label, 'stairs unreachable');
  else if (path > PATH_BUDGET) fail(label, `path budget exceeded: ${path} > ${PATH_BUDGET}`);

  // Verify tile counts.
  const counts = new Map<number, number>();
  for (const row of tiles) for (const t of row) counts.set(t, (counts.get(t) ?? 0) + 1);
  if (counts.get(TILE.STAIRS) !== 1) fail(label, `expected 1 stairs tile, got ${counts.get(TILE.STAIRS) ?? 0}`);
  if (counts.has(TILE.SHORTCUT_GATE) || counts.has(TILE.BOSS_GATE) || counts.has(TILE.FIRE_HAZARD) || counts.has(TILE.FROST_HAZARD))
    fail(label, 'shortcut gate / boss gate / fire / frost hazard tiles must not appear on procedural floors');

  // Verify items.
  const anchors = items.filter((i) => i.item.kind === 'ANCHOR');
  const chests = items.filter((i) => i.item.kind !== 'ANCHOR');
  if (anchors.length !== 0) fail(label, `expected 0 anchor chests, got ${anchors.length}`);
  if (chests.length < 1 || chests.length > 2) fail(label, `expected 1-2 loot chests, got ${chests.length}`);

  // Verify enemies.
  const countRange = enemyCountRangeForFloor(floorNumber);
  if (enemies.length < countRange.min || enemies.length > countRange.max)
    fail(label, `expected ${countRange.min}-${countRange.max} enemies, got ${enemies.length}`);
  const allowed = new Set(enemyPoolForFloor(floorNumber));
  const depth = depthMultiplier(floorNumber);
  for (const e of enemies) {
    if (!allowed.has(e.kind)) fail(label, `enemy kind ${e.kind} not allowed on floor ${floorNumber}`);
    const t = BESTIARY[e.kind];
    const expectedHp = Math.round(t.hp * depth);
    const expectedAttack = Math.round(t.attack * depth);
    // Verify Elite Affixes.
    if (!e.affix && (e.hp !== expectedHp || e.maxHp !== expectedHp || e.attack !== expectedAttack || e.defense !== t.defense || e.speed !== t.speed))
      fail(
        label,
        `${e.kind} stats do not match depth scaling: got HP ${e.hp}/${e.maxHp}, ATK ${e.attack}, DEF ${e.defense}, Speed ${e.speed}; expected HP ${expectedHp}, ATK ${expectedAttack}, DEF ${t.defense}, Speed ${t.speed}`,
      );
    if (e.element !== t.element || e.weakness !== weaknessOf(t.element))
      fail(label, `${e.kind} element/weakness does not follow the Elemental Wheel`);
  }
  if (floorNumber >= 21 && enemies.filter((e) => e.kind === 'TIME_WEAVER').length < 1)
    fail(label, 'Biome 3+ procedural floors must contain at least one Time-Weaver Elite');

  // Verify walkable constraints.
  const solid = (x: number, y: number): boolean =>
    x < 0 || x >= N || y < 0 || y >= N || (tiles[y][x] !== TILE.FLOOR && tiles[y][x] !== TILE.DOOR);
  const taken = new Set<number>([floor.spawnY * N + floor.spawnX]);
  for (const ent of [...enemies, ...items]) {
    const idx = ent.y * N + ent.x;
    if (taken.has(idx)) fail(label, `two entities share tile (${ent.x}, ${ent.y})`);
    taken.add(idx);
    if (solid(ent.x, ent.y)) fail(label, `entity on non-walkable tile (${ent.x}, ${ent.y})`);
  }

  // Verify chokepoints.
  const guarded = enemies.some(
    (e) => (solid(e.x - 1, e.y) && solid(e.x + 1, e.y)) || (solid(e.x, e.y - 1) && solid(e.x, e.y + 1)),
  );
  if (!guarded) fail(label, 'no enemy stands in a 1-tile-wide chokepoint');

  return path;
}

// 1. Determinism
for (const seed of [123456789, 0, 1, 2 ** 31 - 1]) {
  for (const f of [1, 10, 21, 50, 91, 99]) {
    if (JSON.stringify(generateFloor(seed, f)) !== JSON.stringify(generateFloor(seed, f)))
      fail(`seed ${seed} floor ${f}`, 'two generations from the same seed differ');
  }
}

// 2. Timer Refill
const timerState = createNewGameState();
timerState.persistent.turnBonusUpgrade = 3;
timerState.run.turnsRemaining = 1;
enterFloor(timerState, 37);
if (timerState.run.turnsRemaining !== floorTurnLimit(timerState))
  fail('timer refill', `expected ${floorTurnLimit(timerState)}, got ${timerState.run.turnsRemaining}`);

// 3 & 4. Constraints verification
let floorsChecked = 0;
let worstPath = 0;
for (let i = 0; i < 100; i++) {
  const seed = hash(0xdecafbad, i);
  for (let f = 1; f <= 99; f++) {
    const label = `seed ${seed} floor ${f}`;
    try {
      worstPath = Math.max(worstPath, checkFloor(label, generateFloor(seed, f), f));
      floorsChecked++;
    } catch (err) {
      fail(label, `generation threw: ${err}`);
    }
  }
}

// 5. Hub & Shortcuts
async function checkHub(): Promise<void> {
  const hub = createNewGameState();
  hub.persistent.unlockedAnchors = [21, 11]; // deliberately unsorted, like a real save
  enterHub(hub);

  if (hub.run.currentFloor !== HUB_FLOOR) fail('hub', `enterHub must set currentFloor to ${HUB_FLOOR}`);
  if (hub.dungeon.enemies.length !== 0) fail('hub', `Floor 0 must have no enemies, got ${hub.dungeon.enemies.length}`);
  if (hub.dungeon.items.length !== 0) fail('hub', `Floor 0 must have no items, got ${hub.dungeon.items.length}`);

  const destinations = gateDestinations(hub);
  if (JSON.stringify(destinations) !== JSON.stringify([1, 11, 21]))
    fail('hub', `gate destinations expected [1, 11, 21], got ${JSON.stringify(destinations)}`);

  // Verify timer state in Hub.
  const turnsBefore = hub.run.turnsRemaining;
  await resolvePlayerTurn(hub, 'move');
  await resolvePlayerTurn(hub, 'wait');
  if (hub.run.turnsRemaining !== turnsBefore)
    fail('hub', `timer must not decrement in the Hub: ${turnsBefore} -> ${hub.run.turnsRemaining}`);
  if (hub.run.currentHp <= 0 || hub.ui.currentScreen === 'DEATH')
    fail('hub', 'the Hub must never trigger a loss condition');

  // Verify warp mechanics.
  warpToFloor(hub, 11);
  if (hub.run.currentFloor !== 11) fail('hub', `warp expected currentFloor 11, got ${hub.run.currentFloor}`);
  if (hub.run.startFloor !== 11) fail('hub', `warp expected startFloor 11, got ${hub.run.startFloor}`);
  if (hub.run.currentHp !== hub.run.maxHp) fail('hub', 'warp must leave the player at full HP');
  if (hub.run.currentStamina !== hub.run.maxStamina) fail('hub', 'warp must leave the player at full Stamina');
  if (hub.run.turnsRemaining !== floorTurnLimit(hub)) fail('hub', 'warp must set a full per-floor timer');
  if (hub.run.equippedWeapon?.id !== 'starter-weapon')
    fail('hub', `warp must equip the starter weapon, got ${hub.run.equippedWeapon?.name}`);
  if (hub.run.inventory.length !== 0) fail('hub', 'warp must start with an empty inventory');
  if (hub.dungeon.tiles.length === 0) fail('hub', 'warp must generate Floor 11');
}
await checkHub();

// 6. Mini-Boss Arenas & Anchors
function checkArena(floor: number): void {
  const state = createNewGameState();
  enterArenaFloor(state, floor);
  const label = `arena floor ${floor}`;

  if (state.run.currentFloor !== floor) fail(label, `expected currentFloor ${floor}, got ${state.run.currentFloor}`);
  if (state.dungeon.enemies.length !== 1) fail(label, `expected exactly 1 boss, got ${state.dungeon.enemies.length}`);
  const boss = state.dungeon.enemies[0];
  if (!boss.awake) fail(label, 'boss must start awake');
  const expectedKind = archetypeForFloor(floor);
  if (boss.kind !== expectedKind) fail(label, `expected ${expectedKind}, got ${boss.kind}`);

  const gateTilesBefore = state.dungeon.tiles.flat().filter((t) => t === TILE.BOSS_GATE).length;
  if (gateTilesBefore !== 1) fail(label, `expected exactly 1 Boss Gate tile pre-kill, got ${gateTilesBefore}`);

  const echoesBefore = state.persistent.echoes;
  const anchorsBefore = state.persistent.unlockedAnchors.length;

  // Verify boss death triggers.
  killEnemy(state, boss, 'bump');

  if (state.dungeon.enemies.length !== 0) fail(label, 'boss must be removed from dungeon.enemies on death');
  const gateTilesAfter = state.dungeon.tiles.flat().filter((t) => t === TILE.BOSS_GATE).length;
  if (gateTilesAfter !== 0) fail(label, `Boss Gate must open on kill, ${gateTilesAfter} tile(s) still sealed`);
  const stairsTiles = state.dungeon.tiles.flat().filter((t) => t === TILE.STAIRS).length;
  if (stairsTiles !== 1) fail(label, `expected exactly 1 Stairs tile post-kill (the opened gate), got ${stairsTiles}`);
  if (state.persistent.echoes !== echoesBefore + 25)
    fail(label, `expected +25 Echoes on kill, got ${state.persistent.echoes - echoesBefore}`);

  const dropKinds = state.dungeon.items
    .filter((i) => i.x === boss.x && i.y === boss.y)
    .map((i) => i.item.kind)
    .sort();
  const expectedKinds = ['ANCHOR', 'TIME_SHARD', 'TIME_SHARD', 'WEAPON'].sort();
  if (JSON.stringify(dropKinds) !== JSON.stringify(expectedKinds))
    fail(label, `expected drops ${JSON.stringify(expectedKinds)}, got ${JSON.stringify(dropKinds)}`);

  // Verify Anchor pickup effects.
  pickupItemsAt(state, boss.x, boss.y);
  const expectedNextBiome = Math.min(91, Math.floor(floor / 10) * 10 + 1);
  if (!state.persistent.unlockedAnchors.includes(expectedNextBiome))
    fail(label, `expected unlockedAnchors to include ${expectedNextBiome}, got ${JSON.stringify(state.persistent.unlockedAnchors)}`);
  if (state.persistent.unlockedAnchors.length !== anchorsBefore + 1)
    fail(label, `expected exactly 1 new anchor, got ${state.persistent.unlockedAnchors.length - anchorsBefore} new`);
  if (state.persistent.echoes !== echoesBefore + 50)
    fail(label, `expected +50 total Echoes (kill + Anchor), got ${state.persistent.echoes - echoesBefore}`);
  if (state.run.inventory.length !== 1)
    fail(label, `expected the themed weapon left in inventory after pickup, got ${state.run.inventory.length} item(s)`);
}

for (const floor of ARENA_FLOORS) checkArena(floor);
console.log(`${ARENA_FLOORS.length} Mini-Boss Arenas checked (Boss Gate seal/open, guaranteed drops, Anchor unlock, Echo awards).`);

// 7. Chrono-Lich at Floor 99
async function checkChronoLichEntry(): Promise<void> {
  const state = createNewGameState();
  enterBossFloor(state);
  const label = 'chrono-lich arena';

  if (state.run.currentFloor !== FINAL_BOSS_FLOOR)
    fail(label, `expected currentFloor ${FINAL_BOSS_FLOOR}, got ${state.run.currentFloor}`);
  if (state.run.turnsRemaining !== floorTurnLimit(state)) fail(label, 'arena entry must set a full per-floor timer');
  if (state.dungeon.enemies.length !== 1) fail(label, `expected exactly 1 boss, got ${state.dungeon.enemies.length}`);
  const boss = state.dungeon.enemies[0];
  if (boss.kind !== 'CHRONO_LICH') fail(label, `expected CHRONO_LICH, got ${boss.kind}`);
  if (boss.hp !== 400 || boss.maxHp !== 400) fail(label, `expected 400 HP, got ${boss.hp}/${boss.maxHp}`);
  if (boss.attack !== 16) fail(label, `expected 16 ATK, got ${boss.attack}`);
  if (boss.defense !== 8) fail(label, `expected 8 DEF, got ${boss.defense}`);
  if (!boss.awake) fail(label, 'boss must start awake');

  // Verify boss death triggers.
  killEnemy(state, boss, 'bump');
  if (state.ui.currentScreen !== 'VICTORY') fail(label, `expected VICTORY screen on kill, got ${state.ui.currentScreen}`);
}
await checkChronoLichEntry();

async function checkRewindResolves(): Promise<void> {
  const state = createNewGameState();
  enterBossFloor(state);
  const label = 'chrono-lich rewind (resolves)';
  const boss = state.dungeon.enemies[0];
  boss.hp = 80;
  const turnsBefore = state.run.turnsRemaining;

  await resolvePlayerTurn(state, 'wait'); // Enemy Phase
  await resolvePlayerTurn(state, 'wait'); // Tick Phase

  if (boss.hp !== 140) fail(label, `expected 80 + round(400*0.15)=60 -> 140 HP, got ${boss.hp}`);
  if (state.run.turnsRemaining !== turnsBefore - 2 - 10)
    fail(label, `expected ${turnsBefore - 12} Turns Remaining (2 waits + 10 stolen), got ${state.run.turnsRemaining}`);
}
await checkRewindResolves();

async function checkRewindInterrupted(): Promise<void> {
  const state = createNewGameState();
  enterBossFloor(state);
  const label = 'chrono-lich rewind (Stun-interrupted)';
  const boss = state.dungeon.enemies[0];
  boss.hp = 80;
  const turnsBefore = state.run.turnsRemaining;

  await resolvePlayerTurn(state, 'wait'); // casts Rewind
  boss.status = 'STUN';
  boss.statusTurns = 1; // Stun boss
  await resolvePlayerTurn(state, 'wait'); // resolve Stun

  if (boss.hp !== 80) fail(label, `Stunned resolution must not heal — expected 80 HP, got ${boss.hp}`);
  if (state.run.turnsRemaining !== turnsBefore - 2)
    fail(label, `Stunned resolution must not steal Turns — expected ${turnsBefore - 2}, got ${state.run.turnsRemaining}`);
}
await checkRewindInterrupted();

async function checkChronoLichEncounterResets(): Promise<void> {
  const label = 'chrono-lich encounter reset';
  const first = createNewGameState();
  enterBossFloor(first);
  first.dungeon.enemies[0].hp = 80;
  await resolvePlayerTurn(first, 'wait'); // casts Rewind

  // Verify boss reset on re-entry.
  const second = createNewGameState();
  enterBossFloor(second);
  if (second.dungeon.enemies[0].id !== BOSS_ID) fail(label, `expected fixed id ${BOSS_ID}, got ${second.dungeon.enemies[0].id}`);
  second.dungeon.enemies[0].hp = 80;
  const turnsBefore = second.run.turnsRemaining;
  await resolvePlayerTurn(second, 'wait');
  await resolvePlayerTurn(second, 'wait');
  if (second.dungeon.enemies[0].hp !== 140)
    fail(label, `Rewind must fire again on a fresh arena entry, got ${second.dungeon.enemies[0].hp} HP (expected 140)`);
  if (second.run.turnsRemaining !== turnsBefore - 12)
    fail(label, `expected ${turnsBefore - 12} Turns Remaining on the fresh attempt, got ${second.run.turnsRemaining}`);
}
await checkChronoLichEncounterResets();

console.log('Phase 16 checked: Floor 99 arena stats, Rewind cast/resolve/Stun-interrupt, victory-on-kill, and per-attempt encounter reset.');

// --- 8. Phase 18: Content Expansion (40 weapons, 25 skills, stacking, potions) ---

function checkWeaponRoster(): void {
  const label = 'Phase 18 weapon roster';
  if (WEAPON_KEYS.length !== 40) fail(label, `expected 40 weapons, got ${WEAPON_KEYS.length}`);
  for (const key of WEAPON_KEYS) {
    const w = createWeapon(key, `check-${key}`);
    if (!w.name || w.atk <= 0 || !w.passive) fail(label, `${key} has an invalid name/atk/passive`);
  }
}
checkWeaponRoster();

function checkSkillRoster(): void {
  const label = 'Phase 18 skill roster';
  const count = Object.keys(SKILLS).length;
  if (count !== 25) fail(label, `expected 25 skills (5 original + 20 new), got ${count}`);
}
checkSkillRoster();

function checkPotionStacking(): void {
  const label = 'Phase 18 potion stacking';
  const state = createNewGameState();
  state.dungeon.items.push({ item: createPotion('MINOR_POTION', 'p1'), x: 0, y: 0 });
  state.dungeon.items.push({ item: createPotion('MINOR_POTION', 'p2'), x: 0, y: 0 });
  pickupItemsAt(state, 0, 0);
  if (state.run.inventory.length !== 1) fail(label, `expected 1 slot after stacking 2 Minor Potions, got ${state.run.inventory.length}`);
  if (state.run.inventory[0]?.count !== 2) fail(label, `expected count 2, got ${state.run.inventory[0]?.count}`);

  state.run.currentHp = 1;
  usePotion(state, 0);
  if (state.run.currentHp !== 21) fail(label, `Minor Potion expected to heal 20 HP flat (1 -> 21), got ${state.run.currentHp}`);
  if (state.run.inventory[0]?.count !== 1) fail(label, `expected count 1 after one use, got ${state.run.inventory[0]?.count}`);

  usePotion(state, 0);
  if (state.run.inventory.length !== 0) fail(label, `expected an empty slot after using the last of the stack, got ${state.run.inventory.length} item(s)`);
}
checkPotionStacking();

function setBurnForTest(state: GameState): void {
  state.run.status = 'BURN';
  state.run.statusTurns = 3;
}

/** Returns an open floor state for testing. */
function openFloorState(): GameState {
  const state = createNewGameState();
  state.dungeon.tiles = Array.from({ length: DUNGEON_SIZE }, () => new Array<number>(DUNGEON_SIZE).fill(TILE.FLOOR));
  return state;
}

function checkPotionEffects(): void {
  const label = 'Phase 18 potion effects';

  let state = createNewGameState();
  state.run.maxHp = 100;
  state.run.currentHp = 10;
  state.run.inventory.push(createPotion('HI_POTION', 'hp1'));
  usePotion(state, 0);
  if (state.run.currentHp !== 50) fail(label, `Hi-Potion expected to heal 40% of 100 (10 -> 50), got ${state.run.currentHp}`);

  state = createNewGameState();
  state.run.maxHp = 100;
  state.run.currentHp = 10;
  setBurnForTest(state);
  state.run.inventory.push(createPotion('MEGALIXIR', 'mg1'));
  usePotion(state, 0);
  if (state.run.currentHp !== 100) fail(label, `Megalixir expected to fully heal, got ${state.run.currentHp}`);
  if (state.run.status !== 'NONE') fail(label, `Megalixir expected to cleanse Status, still ${state.run.status}`);

  state = createNewGameState();
  const maxHpBefore = state.run.maxHp;
  const turnsBefore = state.run.turnsRemaining;
  state.run.inventory.push(createPotion('SOMA_DROP', 'sd1'));
  usePotion(state, 0);
  if (state.run.maxHp !== maxHpBefore + 5) fail(label, `Soma Drop expected +5 Max HP, got +${state.run.maxHp - maxHpBefore}`);
  if (state.run.turnsRemaining !== turnsBefore - 3)
    fail(label, `Soma Drop expected a fixed 3-Turn cost, got ${turnsBefore - state.run.turnsRemaining} spent`);
}
checkPotionEffects();

function checkExecuteWeapon(): void {
  const label = 'Phase 18 Rune Axe (execute_20_heavy)';
  const state = openFloorState();
  state.run.playerX = 5;
  state.run.playerY = 5;
  state.run.equippedWeapon = createWeapon('RUNE_AXE', 'w1');
  const enemy = createEnemy('BONE_GRUNT', 'e1', 6, 5);
  enemy.maxHp = 100;
  enemy.hp = 15;
  state.dungeon.enemies = [enemy];
  playerAttackEnemy(state, enemy);
  if (state.dungeon.enemies.some((e) => e.id === 'e1')) fail(label, 'expected the enemy to be executed (removed) below 20% HP');
}
checkExecuteWeapon();

function checkSaveTheQueen(): void {
  const label = 'Phase 18 Save the Queen (negate_first_hit_per_floor)';
  const state = openFloorState();
  state.run.equippedWeapon = createWeapon('SAVE_THE_QUEEN', 'w2');
  const enemy = createEnemy('BONE_GRUNT', 'e2', 0, 0);
  const hpBefore = state.run.currentHp;
  enemyAttackPlayer(state, enemy);
  if (state.run.currentHp !== hpBefore) fail(label, `expected the first hit this floor negated, HP went ${hpBefore} -> ${state.run.currentHp}`);
  if (!state.run.floorFirstHitNegated) fail(label, 'expected floorFirstHitNegated to be set after negating');
  const hpAfterFirst = state.run.currentHp;
  enemyAttackPlayer(state, enemy);
  if (state.run.currentHp === hpAfterFirst) fail(label, 'expected the second hit this floor to NOT be negated');
}
checkSaveTheQueen();

function checkMasamuneRefund(): void {
  const label = 'Phase 18 Masamune (kill_refund_turns_3)';
  const state = openFloorState();
  state.run.playerX = 5;
  state.run.playerY = 5;
  state.run.equippedWeapon = createWeapon('MASAMUNE', 'w3');
  const enemy = createEnemy('BONE_GRUNT', 'e3', 6, 5);
  enemy.hp = 1;
  enemy.maxHp = 1;
  state.dungeon.enemies = [enemy];
  const turnsBefore = state.run.turnsRemaining;
  playerAttackEnemy(state, enemy);
  if (state.run.turnsRemaining !== turnsBefore + 3) fail(label, `expected +3 Turns on kill, got ${state.run.turnsRemaining - turnsBefore}`);
}
checkMasamuneRefund();

async function checkBashSkill(): Promise<void> {
  const label = 'Phase 18 Bash skill';
  const state = openFloorState();
  state.persistent.skills.bash = 1;
  state.run.activeSkills = ['bash', '', '', ''];
  state.run.playerX = 5;
  state.run.playerY = 5;
  state.run.facing = 'RIGHT';
  const enemy = createEnemy('BONE_GRUNT', 'e4', 6, 5);
  enemy.hp = 100;
  enemy.maxHp = 100;
  state.dungeon.enemies = [enemy];
  state.ui.currentScreen = 'GAME';
  await useSkill(state, 0);
  const survivor = state.dungeon.enemies.find((e) => e.id === 'e4');
  if (!survivor) fail(label, 'enemy unexpectedly died from a single Bash test hit');
  else if (survivor.hp >= 100) fail(label, 'expected Bash to deal damage');
}
await checkBashSkill();

async function checkUltimaSkill(): Promise<void> {
  const label = 'Phase 18 Ultima skill';
  const state = openFloorState();
  state.persistent.skills.ultima = 1;
  state.run.activeSkills = ['ultima', '', '', ''];
  state.run.currentStamina = 6;
  state.run.maxStamina = 20;
  state.run.playerX = 5;
  state.run.playerY = 5;
  const enemy = createEnemy('BONE_GRUNT', 'e5', 6, 5);
  enemy.hp = 1000;
  enemy.maxHp = 1000;
  enemy.defense = 0;
  state.dungeon.enemies = [enemy];
  state.ui.currentScreen = 'GAME';
  await useSkill(state, 0);
  if (state.run.currentStamina !== 0) fail(label, `expected Ultima to consume all Stamina, ${state.run.currentStamina} remains`);
  const survivor = state.dungeon.enemies.find((e) => e.id === 'e5');
  const dmgTaken = 1000 - (survivor?.hp ?? 1000);
  if (dmgTaken !== 12) fail(label, `expected Stamina(6) x2 (Lv1) = 12 damage, got ${dmgTaken}`);
}
await checkUltimaSkill();

async function checkChakraSkill(): Promise<void> {
  const label = 'Phase 18 Chakra skill';
  const state = openFloorState();
  state.persistent.skills.chakra = 1;
  state.run.activeSkills = ['chakra', '', '', ''];
  state.run.maxHp = 100;
  state.run.currentHp = 10;
  state.ui.currentScreen = 'GAME';
  const turnsBefore = state.run.turnsRemaining;
  await useSkill(state, 0);
  if (state.run.currentHp !== 30) fail(label, `expected Chakra Lv1 to heal 20% of 100 (10 -> 30), got ${state.run.currentHp}`);
  if (state.run.turnsRemaining !== turnsBefore)
    fail(label, `expected Chakra's "0 Turns" cost to leave Turns unchanged, went from ${turnsBefore} to ${state.run.turnsRemaining}`);
}
await checkChakraSkill();

console.log('Phase 18 checked: 40-weapon/25-skill rosters, Potion stacking + all 4 heal effects, and a sample of new weapon/skill mechanics.');

function checkRelicRoster(): void {
  const label = 'Phase 19 Relic roster';
  if (RELIC_KEYS.length !== 15) fail(label, `expected 15 Relics, got ${RELIC_KEYS.length}`);
  for (const key of RELIC_KEYS) {
    const item = createRelicItemByEffect(RELICS[key].effect, `check-${key}`);
    if (!item.name || item.kind !== 'RELIC' || !item.effect) fail(label, `${key} has an invalid name/kind/effect`);
  }
}
checkRelicRoster();

function checkEliteAffixRoster(): void {
  const label = 'Phase 19 Elite Affix roster';
  if (ELITE_AFFIX_KEYS.length !== 10) fail(label, `expected 10 Elite Affixes, got ${ELITE_AFFIX_KEYS.length}`);
}
checkEliteAffixRoster();

function checkEliteAffixStats(): void {
  const label = 'Phase 19 Elite Affix stat mods';
  const armored = createEnemy('BONE_GRUNT', 'ea1', 0, 0);
  const defBefore = armored.defense;
  applyEliteAffixStats(armored, 'armored');
  if (armored.defense !== defBefore + 5) fail(label, `[Armored] expected +5 DEF (${defBefore} -> ${defBefore + 5}), got ${armored.defense}`);

  const colossal = createEnemy('BONE_GRUNT', 'ea2', 0, 0);
  const hpBefore = colossal.hp;
  const atkBefore = colossal.attack;
  applyEliteAffixStats(colossal, 'colossal');
  if (colossal.hp !== hpBefore * 4) fail(label, `[Colossal] expected 4x HP, got ${colossal.hp} from ${hpBefore}`);
  if (colossal.attack !== atkBefore * 2) fail(label, `[Colossal] expected 2x ATK, got ${colossal.attack} from ${atkBefore}`);

  const wealthy = createEnemy('BONE_GRUNT', 'ea3', 0, 0);
  const wHpBefore = wealthy.hp;
  applyEliteAffixStats(wealthy, 'wealthy');
  if (wealthy.hp !== Math.max(1, Math.round(wHpBefore * 0.5))) fail(label, `[Wealthy] expected ~half HP, got ${wealthy.hp} from ${wHpBefore}`);

  const shielded = createEnemy('BONE_GRUNT', 'ea4', 0, 0);
  applyEliteAffixStats(shielded, 'shielded');
  if (shielded.shieldedHitsLeft !== 3) fail(label, `[Shielded] expected shieldedHitsLeft 3, got ${shielded.shieldedHitsLeft}`);
}
checkEliteAffixStats();

async function checkPhoenixFeatherRelic(): Promise<void> {
  const label = 'Phase 19 Phoenix Feather relic';
  const state = openFloorState();
  state.run.relics = ['phoenix_feather'];
  state.run.maxHp = 100;
  state.run.currentHp = 0;
  state.run.turnsRemaining = 50;
  state.dungeon.enemies = [];
  await resolvePlayerTurn(state, 'wait');
  if (state.run.currentHp !== 50) fail(label, `expected revive at 50% Max HP (100 -> 50), got ${state.run.currentHp}`);
  if (state.run.relics.includes('phoenix_feather')) fail(label, 'expected Phoenix Feather consumed after reviving');
  if (state.ui.currentScreen === 'DEATH') fail(label, 'expected the revive to prevent the DEATH transition');
}
await checkPhoenixFeatherRelic();

function checkGiantsAnvilBlocksDash(): void {
  const label = "Phase 19 Giant's Anvil (Dash disabled)";
  const state = openFloorState();
  state.run.relics = ['giants_anvil'];
  state.persistent.skills.dash = 1;
  state.run.activeSkills = ['dash', '', '', ''];
  const atkBefore = totalAtk(state);
  if (atkBefore < GIANTS_ANVIL_ATK) fail(label, `expected Giant's Anvil's +${GIANTS_ANVIL_ATK} ATK bonus to apply, got total ATK ${atkBefore}`);
}
checkGiantsAnvilBlocksDash();

function checkVampiresCapeRelic(): void {
  const label = "Phase 19 Vampire's Cape relic";
  const state = openFloorState();
  state.run.relics = ['vampires_cape'];
  state.run.playerX = 5;
  state.run.playerY = 5;
  state.run.maxHp = 100;
  state.run.currentHp = 50;
  state.run.equippedWeapon = createWeapon('RUNE_AXE', 'w-cape');
  const enemy = createEnemy('BONE_GRUNT', 'e-cape', 6, 5);
  enemy.hp = 1;
  enemy.maxHp = 1;
  state.dungeon.enemies = [enemy];
  playerAttackEnemy(state, enemy);
  if (state.run.currentHp !== 51) fail(label, `expected +1 HP on a bump kill (50 -> 51), got ${state.run.currentHp}`);
}
checkVampiresCapeRelic();

function checkPickRandomUnheldRelic(): void {
  const label = 'Phase 19 pickRandomUnheldRelic';
  const allEffects = RELIC_KEYS.map((k) => RELICS[k].effect);
  const oneMissing = allEffects.filter((e) => e !== 'phoenix_feather');
  const picked = pickRandomUnheldRelic(oneMissing);
  if (picked !== 'phoenix_feather') fail(label, `expected the one unheld Relic back, got ${picked}`);
  if (pickRandomUnheldRelic(allEffects) !== null) fail(label, 'expected null once every Relic is held');
}
checkPickRandomUnheldRelic();

console.log('Phase 19 checked: 15-Relic/10-Elite-Affix rosters, Elite stat mods, and a sample of new relic/affix mechanics.');

// Eyeball dump of one floor.
console.log(`\nSample floor (seed ${hash(0xdecafbad, 0)}, floor 1):\n${floorToAscii(generateFloor(hash(0xdecafbad, 0), 1))}\n`);

console.log(`${floorsChecked} floors checked; worst spawn->stairs path = ${worstPath} tiles (budget ${PATH_BUDGET}).`);
if (failures > 0) throw new Error(`Generator verification FAILED: ${failures} check(s) failed`);
console.log('Generator verification PASSED: determinism + 99-floor path budget + placement/depth invariants all hold.');
