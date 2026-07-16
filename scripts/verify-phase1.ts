// Generator acceptance check (GDD Section 9, run via `npm run verify:phase1`):
//  1. Determinism — the same seed always produces byte-identical floors.
//  2. Turn budget — across 100 seeds x 99 floors, spawn -> Stairs is <= 40
//     walked tiles (verified with an INDEPENDENT BFS, not the
//     generator's own) and generation never fails.
//  3. Placement invariants — entity counts, biome enemy mixes, depth-scaled
//     stats, and chokepoint guards.

import { generateFloor, floorToAscii, PATH_BUDGET, TILE, type GeneratedFloor } from '../src/mapgen';
import { enterFloor } from '../src/mapgen';
import { BESTIARY, depthMultiplier, enemyCountRangeForFloor, enemyPoolForFloor, weaknessOf } from '../src/content';
import { createNewGameState, DUNGEON_SIZE, floorTurnLimit } from '../src/state';
import { hash } from '../src/rng';
import { HUB_FLOOR, enterHub, gateDestinations, warpToFloor } from '../src/hub';
import { resolvePlayerTurn } from '../src/turnController';

const N = DUNGEON_SIZE;
let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`FAIL [${label}]: ${msg}`);
}

// Independent BFS (deliberately not reusing the generator's walkDistances).
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

  // Turn-budget guarantee, measured independently.
  const path = walkDist(tiles, floor.spawnX, floor.spawnY, floor.stairsX, floor.stairsY);
  if (path < 0) fail(label, 'stairs unreachable');
  else if (path > PATH_BUDGET) fail(label, `path budget exceeded: ${path} > ${PATH_BUDGET}`);

  // Tile census: exactly one Stairs, no old per-floor Shortcut Gate, nothing else exotic.
  const counts = new Map<number, number>();
  for (const row of tiles) for (const t of row) counts.set(t, (counts.get(t) ?? 0) + 1);
  if (counts.get(TILE.STAIRS) !== 1) fail(label, `expected 1 stairs tile, got ${counts.get(TILE.STAIRS) ?? 0}`);
  if (counts.has(TILE.SHORTCUT_GATE) || counts.has(TILE.BOSS_GATE) || counts.has(TILE.FIRE_HAZARD))
    fail(label, 'shortcut gate / boss gate / fire hazard tiles must not appear on procedural floors');

  // Items: no per-floor Anchor chest; 1-2 loot chests.
  const anchors = items.filter((i) => i.item.kind === 'ANCHOR');
  const chests = items.filter((i) => i.item.kind !== 'ANCHOR');
  if (anchors.length !== 0) fail(label, `expected 0 anchor chests, got ${anchors.length}`);
  if (chests.length < 1 || chests.length > 2) fail(label, `expected 1-2 loot chests, got ${chests.length}`);

  // Enemies: 3-6, biome-specific mix, depth-scaled HP/ATK, wheel-derived weaknesses.
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
    if (e.hp !== expectedHp || e.maxHp !== expectedHp || e.attack !== expectedAttack || e.defense !== t.defense || e.speed !== t.speed)
      fail(
        label,
        `${e.kind} stats do not match depth scaling: got HP ${e.hp}/${e.maxHp}, ATK ${e.attack}, DEF ${e.defense}, Speed ${e.speed}; expected HP ${expectedHp}, ATK ${expectedAttack}, DEF ${t.defense}, Speed ${t.speed}`,
      );
    if (e.element !== t.element || e.weakness !== weaknessOf(t.element))
      fail(label, `${e.kind} element/weakness does not follow the Elemental Wheel`);
  }
  if (floorNumber >= 21 && enemies.filter((e) => e.kind === 'TIME_WEAVER').length < 1)
    fail(label, 'Biome 3+ procedural floors must contain at least one Time-Weaver Elite');

  // Nothing stacked, everything on walkable ground, nothing on the spawn tile.
  const solid = (x: number, y: number): boolean =>
    x < 0 || x >= N || y < 0 || y >= N || (tiles[y][x] !== TILE.FLOOR && tiles[y][x] !== TILE.DOOR);
  const taken = new Set<number>([floor.spawnY * N + floor.spawnX]);
  for (const ent of [...enemies, ...items]) {
    const idx = ent.y * N + ent.x;
    if (taken.has(idx)) fail(label, `two entities share tile (${ent.x}, ${ent.y})`);
    taken.add(idx);
    if (solid(ent.x, ent.y)) fail(label, `entity on non-walkable tile (${ent.x}, ${ent.y})`);
  }

  // At least one chokepoint guard sits in a 1-wide passage.
  const guarded = enemies.some(
    (e) => (solid(e.x - 1, e.y) && solid(e.x + 1, e.y)) || (solid(e.x, e.y - 1) && solid(e.x, e.y + 1)),
  );
  if (!guarded) fail(label, 'no enemy stands in a 1-tile-wide chokepoint');

  return path;
}

// --- 1. Determinism: identical seeds -> deep-equal floors ---
for (const seed of [123456789, 0, 1, 2 ** 31 - 1]) {
  for (const f of [1, 10, 21, 50, 91, 99]) {
    if (JSON.stringify(generateFloor(seed, f)) !== JSON.stringify(generateFloor(seed, f)))
      fail(`seed ${seed} floor ${f}`, 'two generations from the same seed differ');
  }
}

// --- 2. Phase 11 timer refill: every floor entry resets to the upgraded cap ---
const timerState = createNewGameState();
timerState.persistent.turnBonusUpgrade = 3;
timerState.run.turnsRemaining = 1;
enterFloor(timerState, 37);
if (timerState.run.turnsRemaining !== floorTurnLimit(timerState))
  fail('timer refill', `expected ${floorTurnLimit(timerState)}, got ${timerState.run.turnsRemaining}`);

// --- 3 & 4. 100 seeds x 99 floors: no failures, budget + invariants hold ---
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

// --- 5. Phase 13: Hub & Shortcut Gate ---
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

  // Timer stays frozen across real turn resolution (move + wait), not just
  // because nothing ticks it down by construction elsewhere.
  const turnsBefore = hub.run.turnsRemaining;
  await resolvePlayerTurn(hub, 'move');
  await resolvePlayerTurn(hub, 'wait');
  if (hub.run.turnsRemaining !== turnsBefore)
    fail('hub', `timer must not decrement in the Hub: ${turnsBefore} -> ${hub.run.turnsRemaining}`);
  if (hub.run.currentHp <= 0 || hub.ui.currentScreen === 'DEATH')
    fail('hub', 'the Hub must never trigger a loss condition');

  // Warping to Floor 11 starts a correct fresh run there.
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

// Eyeball dump of one floor (@ spawn, $ chest, > stairs,
// + door, enemies g/b/t/w/W).
console.log(`\nSample floor (seed ${hash(0xdecafbad, 0)}, floor 1):\n${floorToAscii(generateFloor(hash(0xdecafbad, 0), 1))}\n`);

console.log(`${floorsChecked} floors checked; worst spawn->stairs path = ${worstPath} tiles (budget ${PATH_BUDGET}).`);
if (failures > 0) throw new Error(`Generator verification FAILED: ${failures} check(s) failed`);
console.log('Generator verification PASSED: determinism + 99-floor path budget + placement/depth invariants all hold.');
