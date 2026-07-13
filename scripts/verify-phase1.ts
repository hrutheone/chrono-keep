// Phase 1 acceptance check (GDD Section 9, run via `npm run verify:phase1`):
//  1. Determinism — the same seed always produces byte-identical floors.
//  2. Turn budget — across 100 seeds x 3 floors, spawn -> Anchor -> Stairs
//     is <= 20 walked tiles (verified with an INDEPENDENT BFS, not the
//     generator's own) and generation never fails.
//  3. Placement invariants — entity counts, floor-specific enemy mixes,
//     bestiary stats, and chokepoint guards.

import { generateFloor, floorToAscii, PATH_BUDGET, TILE, type GeneratedFloor } from '../src/mapgen';
import { BESTIARY, weaknessOf } from '../src/content';
import { DUNGEON_SIZE } from '../src/state';
import { hash } from '../src/rng';
import type { Enemy } from '../src/types';

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
  const legA = walkDist(tiles, floor.spawnX, floor.spawnY, floor.anchorX, floor.anchorY);
  const legB = walkDist(tiles, floor.anchorX, floor.anchorY, floor.stairsX, floor.stairsY);
  if (legA < 0 || legB < 0) fail(label, `anchor or stairs unreachable (legs ${legA}, ${legB})`);
  else if (legA + legB > PATH_BUDGET) fail(label, `path budget exceeded: ${legA} + ${legB} > ${PATH_BUDGET}`);

  // Tile census: exactly one Stairs and one closed Shortcut Gate, nothing else exotic.
  const counts = new Map<number, number>();
  for (const row of tiles) for (const t of row) counts.set(t, (counts.get(t) ?? 0) + 1);
  if (counts.get(TILE.STAIRS) !== 1) fail(label, `expected 1 stairs tile, got ${counts.get(TILE.STAIRS) ?? 0}`);
  if (counts.get(TILE.SHORTCUT_GATE) !== 1)
    fail(label, `expected 1 shortcut gate, got ${counts.get(TILE.SHORTCUT_GATE) ?? 0}`);
  if (counts.has(TILE.BOSS_GATE) || counts.has(TILE.FIRE_HAZARD))
    fail(label, 'boss gate / fire hazard tiles must not appear on floors 1-3');

  // Items: exactly one Anchor at its declared position, plus 1-2 loot chests.
  const anchors = items.filter((i) => i.item.kind === 'ANCHOR');
  const chests = items.filter((i) => i.item.kind !== 'ANCHOR');
  if (anchors.length !== 1 || anchors[0].x !== floor.anchorX || anchors[0].y !== floor.anchorY)
    fail(label, 'expected exactly 1 anchor chest at the declared anchor position');
  if (chests.length < 1 || chests.length > 2) fail(label, `expected 1-2 loot chests, got ${chests.length}`);

  // Enemies: 3-5, floor-specific mix, bestiary stats, wheel-derived weaknesses.
  if (enemies.length < 3 || enemies.length > 5) fail(label, `expected 3-5 enemies, got ${enemies.length}`);
  const allowed: Record<number, Enemy['kind'][]> = {
    1: ['BONE_GRUNT', 'EMBER_BAT'],
    2: ['BONE_GRUNT', 'EMBER_BAT', 'VOLT_TURRET', 'FROST_WRAITH'],
    3: ['BONE_GRUNT', 'EMBER_BAT', 'VOLT_TURRET', 'FROST_WRAITH', 'TIME_WEAVER'],
  };
  for (const e of enemies) {
    if (!allowed[floorNumber].includes(e.kind)) fail(label, `enemy kind ${e.kind} not allowed on floor ${floorNumber}`);
    const t = BESTIARY[e.kind];
    if (e.hp !== t.hp || e.attack !== t.attack || e.defense !== t.defense || e.speed !== t.speed)
      fail(label, `${e.kind} stats do not match the bestiary`);
    if (e.element !== t.element || e.weakness !== weaknessOf(t.element))
      fail(label, `${e.kind} element/weakness does not follow the Elemental Wheel`);
  }
  if (floorNumber === 3 && enemies.filter((e) => e.kind === 'TIME_WEAVER').length !== 1)
    fail(label, 'floor 3 must contain exactly one Time-Weaver Elite');

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

  return legA + legB;
}

// --- 1. Determinism: identical seeds -> deep-equal floors ---
for (const seed of [123456789, 0, 1, 2 ** 31 - 1]) {
  for (let f = 1; f <= 3; f++) {
    if (JSON.stringify(generateFloor(seed, f)) !== JSON.stringify(generateFloor(seed, f)))
      fail(`seed ${seed} floor ${f}`, 'two generations from the same seed differ');
  }
}

// --- 2 & 3. 100 seeds x 3 floors: no failures, budget + invariants hold ---
let floorsChecked = 0;
let worstPath = 0;
for (let i = 0; i < 100; i++) {
  const seed = hash(0xdecafbad, i);
  for (let f = 1; f <= 3; f++) {
    const label = `seed ${seed} floor ${f}`;
    try {
      worstPath = Math.max(worstPath, checkFloor(label, generateFloor(seed, f), f));
      floorsChecked++;
    } catch (err) {
      fail(label, `generation threw: ${err}`);
    }
  }
}

// Eyeball dump of one floor (@ spawn, A anchor, $ chest, > stairs, % gate,
// + door, enemies g/b/t/w/W).
console.log(`\nSample floor (seed ${hash(0xdecafbad, 0)}, floor 1):\n${floorToAscii(generateFloor(hash(0xdecafbad, 0), 1))}\n`);

console.log(`${floorsChecked} floors checked; worst spawn->anchor->stairs path = ${worstPath} tiles (budget ${PATH_BUDGET}).`);
if (failures > 0) throw new Error(`Phase 1 verification FAILED: ${failures} check(s) failed`);
console.log('Phase 1 verification PASSED: determinism + path budget + placement invariants all hold.');
