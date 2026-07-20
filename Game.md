# Chrono-Keep: The 100-Turn Descent (Specification & Planning Document)

## 1. Project Overview
`Chrono-Keep` is a turn-based, grid-based roguelite descent RPG rendered on a single HTML5 Canvas with retro 16x16 full-color pixel art (external spritesheet, Section 4) framed by an amber-CRT-styled HTML UI.

*   **Core Loop:** The player descends a **99-floor** dungeon. The temporal anomaly collapses floors *individually*: the player has exactly **100 turns per floor** to explore, loot, fight, and reach the stairs down. Entering the stairs resets the counter to 100 for the next floor. The **Chrono-Lich** waits on Floor 99.
*   **Time Loop Mechanic (Per-Floor Collapse):** When the current floor's turn counter hits 0 or the player dies, the time loop triggers: they are pulled back to the **Hub** (the Watchwarden's Post, "Floor 0"). Inventory, equipment, and weapons are lost. "Echoes" (currency) are retained to purchase permanent skill unlocks/upgrades and passive stats, and **Temporal Anchors** (permanent checkpoints dropped by Mini-Bosses — Section 7) are retained forever. From the Hub, the player restarts at Floor 1 OR warps via the **Shortcut Gate** to the start of any anchored Biome (Floor 11, 21, 31, ...). Critically, floor layouts are IDENTICAL across loops within one save: player knowledge of the routes is itself a form of progression. Only starting a New Game generates a fresh dungeon.
*   **Biome Structure:** The 99 floors are divided into **Biomes of 10 floors**. Every 10th floor (10, 20, 30, ... 90) is a fixed **Mini-Boss Arena**; defeating its Mini-Boss drops that Biome's Temporal Anchor. See Section 7, "Biomes, Temporal Anchors & the Hub."
*   **Target Gameplay Duration:** 10 to 15 hours of optimization, tactical combat, and progression per winning save. Tuning target: each Biome takes roughly 2-4 loop-attempts to anchor; a full first clear spans many loops, but checkpoints mean lost progress is never more than one Biome deep.

### Narrative Framing: The "Why"
**The Fall of Oakhaven:** The Chrono-Keep was not always a prison; it was once the Grand Conservatory of Oakhaven. Decades ago, as a mysterious plague threatened to wipe out the kingdom, the brilliant Court Wizard made a desperate choice. To save his people, he attempted to freeze Oakhaven at the exact moment before its ruin using the kingdom's most sacred artifact: the Hourglass of Eternity. But mortal hands were never meant to halt the river of time. The ritual violently backfired, mutating him into the mad Chrono-Lich and shattering the Keep downward into the earth.

**The Temporal Anomaly (The 100-Turn Limit):** The Keep did not physically collapse; it fractured into 99 stacked strata of broken time. Time inside the Keep is entirely frozen. When a living, breathing entity steps onto a floor, the timeline attempts to resume — but the shattered reality can only sustain exactly 100 seconds (turns) of linear time before the paradox reaches critical mass. When the clock hits zero, the floor violently collapses, expelling the intruder back to the surface to preserve itself.

**The Protagonist (The Last Watchwarden):** You are the Last Watchwarden. When the Hourglass shattered, your proximity to the epicenter locked you in a cruel, unending loop. You are cursed with lucidity: you remember every death, every failure, and every reset. The monsters wandering the halls — the Bone-Grunts and Frost-Wraiths — are your former comrades and the citizens of Oakhaven, trapped in a mindless state of decay because they forgot their purpose across a thousand loops. Your duty is no longer to guard the Keep, but to grant it the mercy of a final death. You must descend the 99 floors, wrest the Temporal Anchors from the Lich's corrupted wardens, and stitch reality back together just enough to reach the bottom and end the Lich's reign.

**The Currencies of Time:**
*   **Echoes** are the crystallized memories of your past deaths. By absorbing them, you refuse to let your past failures be in vain, using your own trauma to permanently strengthen your body and mind (Upgrades).
*   **Time Shards** are splintered seconds dropped by enemies. By taking a life, you steal their remaining moments, buying yourself a few extra heartbeats against the collapsing floor (extends the 100-turn limit).
*   **Temporal Anchors** are the surviving heavy pivot-stones of the original Hourglass. Driving them into the rift at the Hub physically pins a section of the Keep to reality, creating a permanent safe haven (Shortcut Gate destinations).

### "The Shattering": the Loop 0 opening (fake endgame -> scripted loss)
`persistent.loopCount === 0` is special-cased, entirely in `src/shattering.ts`: clicking **New Game** does not spawn the player in the Hub — it drops them directly into the Floor 99 Chrono-Lich Arena with a fully-decked-out "vision" loadout (100 HP / 10 Stamina, Masamune equipped, Save the Queen + 4 Max Potions in the pack, Dash/Cleave/Flame Arc/Ice Aegis all shown at Lv3 on Q/E/R/F). None of this is real progression — `persistent.skills`/`skillLoadout` are only *temporarily* bumped for the fight. The moment the Chrono-Lich drops to <=25% HP, or the player's HP hits 0, "Shatter Eternity" fires unconditionally (`turnController.ts`'s `runCheckPhase`): a held screen-shake + purple flash + a `TIMELINE COLLAPSE` floating text, then the normal CRT Time-Warp / DEATH flow. Continuing from DEATH resets `persistent.skills`/`skillLoadout` back to the real starting defaults (`{ dash: 1 }`), logs the Awakening line, increments `loopCount` to 1, and drops the player in the Hub with the Rusty Sword like any other loop start — the real game begins from there. Floor 99 has no stairs/rifts and Dev Warp refuses to leave it during the Shattering (`menus.ts`'s `devWarp`), since that's the only way out besides the scripted loss — leaving any other way would skip the Awakening reset and leave the vision loadout stuck forever. `main.ts` also self-heals this at boot: a loaded run snapshot sitting off Floor 99 while `loopCount` is still 0 (an impossible state under normal play) forces the same reset.

---

## 2. Technical Stack
*   **Language:** Vanilla TypeScript or JavaScript (ES6+).
*   **Rendering:** HTML5 Canvas (2D Context), `imageSmoothingEnabled = false` for crisp pixel-art scaling. **The canvas is strictly for game-world rendering** (tiles, sprites, particles). All UI — HUD, Inventory, Skill Menu, Upgrade Shop, dialogs — is built as **HTML/CSS overlays** positioned over the canvas (crisper text, easier layout/scrolling, no per-frame UI redraw).
*   **Storage:** three `localStorage` keys. One persists permanent upgrades, the dungeon seed, and run statistics across loops (`persistent`). A second holds a live JSON snapshot of the in-progress run (`run` — HP, inventory, position, current floor; `dungeon` is deliberately never serialized, since every floor-entry function already rebuilds it deterministically from `currentFloor`) so backgrounding the tab or reloading mid-floor resumes exactly where the player left off instead of dropping back to TITLE. Saved on every turn and at every screen-visibility change; cleared on New Game (stale seed) and Victory (would respawn an already-dead boss); validated before trusting it on load, falling back to TITLE if stale or corrupt. A third, independent key persists audio settings (master mute/volume, and an independent BGM mute/volume) across sessions.
*   **Audio:** Web Audio API throughout. Every sound effect is synthesized procedurally (oscillators, noise buffers, short envelopes) — no SFX files loaded from disk. Background music is the one exception: six pre-rendered `.ogg` loops (`audio/`) are decoded into `AudioBufferSourceNode`s and played with live `playbackRate`/lowpass mutation per game state, imported like the spritesheet asset rather than a `public/` folder. See Section 9, Audio Design.
*   **Build/Serve:** Simple local server (e.g., vite or a lightweight Node.js static server) configured via Claude Code.

**Implementation patterns (established, not to regress):**
*   Cross-cutting engine state — the turn-freeze, loss conditions, and which music track plays — gates on `run.currentFloor === HUB_FLOOR` rather than a separate "in Hub" flag, so there's one source of truth for "is the player safe right now" instead of two that could drift out of sync.
*   Pure state-mutation modules (`hub.ts`, `echoes.ts`, `arenas.ts`, `bossArena.ts`) never touch `ui.currentScreen` or play audio directly — `menus.ts`'s click-dispatch wrappers own screen transitions and SFX. This keeps every state helper callable from `scripts/verify-phase1.ts`/`scripts/simulate.ts` without a DOM. (`shop.ts` is the one exception: its purchase functions call their SFX and `saveGame` directly rather than routing through `menus.ts`.)

---

## 3. Game State Schema (with Inventory, Elements & Skills)

This block mirrors `src/types.ts`, the authoritative current schema — check
there directly for exact field names before relying on this doc for a code
change; this is a reading aid, not the source of truth.

```typescript
type Element = 'PHYSICAL' | 'FIRE' | 'VOLT' | 'FROST' | 'CHRONO';
type StatusEffect = 'NONE' | 'BURN' | 'STUN' | 'CHILLED';

// Player baseline (constants, not saved): PLAYER_BASE_ATK = 2, PLAYER_BASE_DEF = 0.
// Total ATK = PLAYER_BASE_ATK + persistent.baseAtkUpgrade + equippedWeapon.atk + accessory/relic/temp bonuses.
// Total DEF = PLAYER_BASE_DEF + accessory/weapon/temp bonuses + Brace.

interface GameState {
  persistent: {
    rngSeed: number;         // Seeded ONCE per save; dungeon layout is derived
                             // from hash(rngSeed, floorNumber) so it is identical
                             // across loops. New Game = new seed.
    loopCount: number;       // Total loops attempted on this save
    echoes: number;          // Currency spent on upgrades and skills
    // Permanent Stat Upgrades (uncapped; 25/50/100/150/200/300/400/500/650/800
    // for Levels 1-10, then +200/level with no ceiling)
    maxHpUpgrade: number;
    maxStamUpgrade: number;
    turnBonusUpgrade: number;// Applied to EVERY floor's 100-turn counter
    baseAtkUpgrade: number;  // +1 ATK/level, uncapped (own curve to Lv10 then +2,000/level, Section 7)
    skills: Record<string, number>;   // Skill ID -> level (0 = locked, 1-3 = unlocked/upgraded).
                                       // New saves start with { dash: 1 }.
    skillLoadout: string[];           // Up to 4 skill IDs -> hotkeys Q/E/R/F; persists across
                                       // loop resets, seeds `run.activeSkills` on every loop start.
    unlockedAnchors: number[];        // Biome start-floors pinned by collected Temporal Anchors
                                       // (e.g. [11, 21]) — permanent Shortcut Gate destinations.
    bestiaryKnown: string[];          // EnemyKinds encountered — gates the Bestiary tab
    ngPlusLevel: number;              // New Game+ cycles completed — scales enemy HP +10%/level
    cheatModeEnabled: boolean;        // Testing-only: locks HP and Stamina to max every turn.
                                       // Survives loop resets (only a full New Game clears it).
    weaponSlot2Unlocked: boolean;      // One-time Upgrade Shop unlock, 800 Echoes (Section 7)
    accessorySlot2Unlocked: boolean;   // One-time Upgrade Shop unlock, 600 Echoes (Section 7)
    accessorySlot3Unlocked: boolean;   // One-time Upgrade Shop unlock, 1,500 Echoes, requires Slot 2
    stats: { deepestFloor: number; bestTurnsRemaining: number; wins: number };
  };

  // Active Run State (reset each loop; a live snapshot also persists to a
  // second localStorage key so backgrounding/reloading resumes mid-floor)
  run: {
    currentHp: number;
    maxHp: number;
    currentStamina: number;
    maxStamina: number;
    turnsRemaining: number;  // PER-FLOOR: reset to 100 (+ turnBonusUpgrade) on every floor entry
    currentFloor: number;    // 0 = Hub (timer frozen), 1-99. 10/20/.../90 = Mini-Boss Arenas, 99 = Chrono-Lich.
    startFloor: number;      // Where this run began (1, or a Shortcut Gate Biome start)
    playerX: number;
    playerY: number;
    facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

    // Inventory & Equipment
    inventory: Item[];              // Max 25 slots (5x5 grid); Potions/Consumables stack by
                                     // name into one slot (`Item.count`) instead of one-per-unit
    equippedWeapon: Weapon | null;    // The ACTIVE weapon — every combat calc reads only this field
    equippedWeapon2: Weapon | null;   // Benched Slot 2 weapon (needs weaponSlot2Unlocked) — swappable
                                       // with equippedWeapon, but grants no passive bonuses while benched
    equippedAccessory: Accessory | null;
    equippedAccessory2: Accessory | null;  // Needs accessorySlot2Unlocked — active simultaneously with Slot 1
    equippedAccessory3: Accessory | null;  // Needs accessorySlot3Unlocked — active simultaneously with 1 & 2
    activeSkills: string[];         // Up to 4 skill IDs -> hotkeys Q/E/R/F
    status: StatusEffect;
    statusTurns: number;
    braced: boolean;                // +1 DEF until the player's next turn (Section 7's Brace)

    // Charge/timer state each mechanic below owns (kept as small independent
    // counters rather than one grab-bag "buffs" list, mirroring how each was
    // added — see the relevant Section 6/7 subsection for what sets/reads it)
    iceAegisCharges: number; iceAegisChillsAttacker: boolean;
    quicksilverCharges: number; whetstoneCharge: boolean;
    reflectBarrierCharges: number; reflectBarrierStuns: boolean;
    vanishCharges: number;
    tempAtkBonus: number; tempAtkBonusTurns: number;
    tempDefBonus: number; tempDefBonusTurns: number;
    statusImmuneTurns: number;
    recallMarkX: number | null; recallMarkY: number | null;
    staticGenSteps: number; staticGenCharged: boolean;
    trollBloodCounter: number;

    // Echo-economy-per-loop bookkeeping
    floorDamageTaken: boolean;        // Cleared on floor entry; gates the Flawless Floor bonus
    floorsVisitedThisLoop: number[];  // Already-awarded "first reached" floors this loop
    floorFirstHitNegated: boolean;    // Save the Queen's negate-first-hit, cleared on floor entry

    relics: string[];  // Relics held this run — infinite-stacking, never equipped (Section 6F)
  };

  // Map and Entities (regenerated deterministically on floor entry; lazy —
  // only the current floor is ever materialized)
  dungeon: {
    width: number;
    height: number;
    tiles: number[][];       // 0 Void, 1 Floor, 2 Wall, 3 Door, 4 Stairs, 5 Shortcut Gate (Hub),
                             // 6 Boss Gate, 7 Fire Hazard, 8 Shop Terminal (Hub), 9 Frost Hazard.
                             // Fire/Frost Hazard are also spawnable at runtime as transient
                             // `expiringTiles` overlays without touching this seeded grid.
    enemies: Enemy[];
    items: WorldItem[];
    spawnX: number; spawnY: number;   // This floor's entry point (Recall Rune's teleport target)
    stairsX: number; stairsY: number; // This floor's Stairs (Wealthy Elites flee toward it)
    riftX: number | null; riftY: number | null; // A Cursed Rift's position, if this floor has one —
                                                 // a coordinate marker, not a `tiles` grid value, so
                                                 // it can never land on the one BFS-guaranteed path tile
    expiringTiles: { x: number; y: number; turnsLeft: number; tileType: number }[];
    telegraphTiles: { x: number; y: number; turnsUntil: number; payload: 'stun' | 'fire_aoe' | 'chill_pulse'; sourceAttack: number; hazard?: boolean; hazardTurns?: number }[];
  };

  // Engine state
  ui: {
    currentScreen: 'TITLE' | 'GAME' | 'MENU' | 'UPGRADE_SHOP' | 'SHORTCUT_GATE' | 'CURSED_RIFT' | 'CONFIRM' | 'DEATH' | 'VICTORY';
    // 'MENU' is one unified tabbed overlay (Status/Inventory/Relics/Skill/Bestiary/Settings —
    // see Section 8) rather than separate screens per tab; there is no distinct 'HELP' screen.
    log: string[];           // Message log for combat actions (last 3 shown in HUD)
  };
}

type EnemyKind =
  | 'BONE_GRUNT' | 'EMBER_BAT' | 'VOLT_TURRET' | 'FROST_WRAITH'        // Regulars (Biome 1-2+)
  | 'BONE_KNIGHT' | 'CINDER_SHAMAN' | 'VOLT_HOUND' | 'FROST_SENTINEL'  // Deep-Biome Regulars (Biome 3+)
  | 'TIME_WEAVER'                                                     // Elite archetype
  | 'INFERNO_GOLEM' | 'STORM_CALLER' | 'GLACIAL_KNIGHT'                // Mini-Bosses (Arena floors)
  | 'CHRONO_LICH';                                                     // Final Boss (Floor 99)

interface Enemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number; maxHp: number;   // Stored POST-scaling — Depth Scaling (Section 6C) applied at spawn
  attack: number;
  defense: number;
  element: Element;
  weakness: Element | null;    // Cached from the Elemental Wheel (null for Chrono)
  speed: number;                // Tiles moved per turn (0 = stationary)
  awake: boolean;
  status: StatusEffect;
  statusTurns: number;
  // Temporary stat overrides (Defuse/Slow skills), restored once their timer runs out
  defuseTurnsLeft?: number; defuseOriginalDef?: number;
  slowTurnsLeft?: number; slowOriginalSpeed?: number;
  affix?: string;               // Elite Affix ID if this is a rolled Elite (Section 6C)
  shieldedHitsLeft?: number;    // [Shielded] Elites only: hits remaining before damage lands
}

interface Item {
  id: string;
  kind: 'WEAPON' | 'ACCESSORY' | 'POTION' | 'CONSUMABLE' | 'ANCHOR' | 'TIME_SHARD' | 'RELIC';
  name: string;
  value: number;             // Meaning is per-kind: heal amount (Potion), +turns (Time Shard),
                             // an effect's numeric parameter (Consumable), unused otherwise.
  count?: number;            // Potion/Consumable stack size when merged by name (undefined/1 = not stacked)
  effect?: string;           // Potion's heal-shape ID, mirroring Consumable's own required `effect`
}

interface Weapon extends Item { kind: 'WEAPON'; atk: number; element: Element; passive: string; upgradeBonus?: number; }
  // upgradeBonus: bonus ATK from an Elite drop or the Blood-Infused Anvil (Section 6G/6C), already folded into `atk`.
  // Tracked separately purely so the UI can show it as a "+N" name suffix — never mutates `name` itself.
interface Accessory extends Item { kind: 'ACCESSORY'; passive: string; }
interface Consumable extends Item { kind: 'CONSUMABLE'; effect: string; }
interface WorldItem { item: Item; x: number; y: number; chestLoot?: boolean; }
```

---

## 4. Pixel Art Rendering Engine

**The game world uses a full-color external spritesheet** — `assets/new-spritesheet.png` (a Kenney-style RPG/UI icon pack) — replacing the original procedural 1-bit amber sprite matrices. The sheet is a tightly-packed **16x16-pixel grid** (no margins or spacing; the shipped image is 784x352 = 49 columns x 22 rows). A labeled reference copy with `(col,row)` stamped on every tile lives at `assets/new-spritesheet-withcolrow.png` for picking new coordinates by eye.

*Migration note:* the project originally shipped with an 8x8 Kenney Micro Roguelike sheet (128x80, 16x10) at `assets/spritesheet.png`, still present on disk but no longer imported. Every `{col, row}` in `src/sprites.ts` was re-picked from scratch for the new sheet's layout — the two files are not coordinate-compatible.

**Asset Loader:** an `Image` object loads `assets/new-spritesheet.png` (bundled through Vite as an imported asset URL) at startup; the render loop does not start until `image.onload` fires. All drawing goes through `ctx.drawImage` with `imageSmoothingEnabled = false` strictly applied for crisp integer scaling.

**Native tile resolution:** the canvas's internal resolution (`main.ts`'s `VIEW_W`/`VIEW_H`) is 480x320 — a 30x20-tile viewport at the spritesheet's own 16px/tile (`render.ts`'s `TILE_SIZE`, matching `assets.ts`'s `SPRITE_PX`). Every draw is therefore a single clean scale from source to destination; CSS/`resize()` then scales the whole canvas up further for on-screen display (integer multiples on desktop, a fractional fill on mobile), same as before. (The original 8x8 sheet ran this at 240x160/8px-per-tile; keeping the tile size at 8 after the art migration would have forced every sprite through a lossy 16->8 downscale immediately undone by the same upscale, blurring away half the new art's detail — hence the resolution bump.)

**Sprite Registry:** a configuration dictionary (`SPRITES` in `src/sprites.ts`) assigns a `{col, row}` cell to every drawable — player, each enemy kind, terrain tiles (floor, wall, door, stairs, gates, hazards), and the seven `Item.kind` pickup types' generic icons. Source coordinates derive from the grid:

```
sx = col * 16,  sy = row * 16,  sWidth = 16,  sHeight = 16
```

Drawing is one call: `drawTile(ctx, col, row, canvasX, canvasY)` -> `ctx.drawImage(spritesheet, sx, sy, 16, 16, dx, dy, TILE_SIZE, TILE_SIZE)`. Facing LEFT is rendered by mirroring with `ctx.translate` + `ctx.scale(-1, 1)` around the tile. Re-pointing an entity's art is a data edit (change its `{col, row}`), never a code edit.

**Per-item icons:** on top of the one-icon-per-`Item.kind` fallback above, every individual Weapon, Accessory, Potion, and Consumable has its own dedicated sprite — `WEAPON_SPRITE_BY_NAME` / `ACCESSORY_SPRITE_BY_NAME` / `POTION_SPRITE_BY_NAME` / `CONSUMABLE_SPRITE_BY_NAME` in `src/sprites.ts`, keyed by the item's own `name` field exactly as written in `content.ts`'s catalogs (40 Weapons, 19 Accessories, 6 Potions, 8 Consumables — every catalog entry has a matching sprite entry, checked by diffing the two lists). The Inventory grid/detail panel (Section 8) and world-dropped items on the floor both look a name up first, falling back to the kind-level generic only if a name is ever missing. Relics use the equivalent `RELIC_SPRITE_BY_EFFECT`, keyed by `effect` instead of `name` (one map per Relic, Section 6F).

**Spring-Lerp Movement & Camera:** grid-snapping logical positions are chased visually rather than tweened over a fixed duration — `animation.ts`'s `getEntityVisual` and `render.ts`'s camera both close 30% of the remaining distance to their target every frame (`pos += (target - pos) * 0.3`, snapping once within 0.01 tiles), giving buttery 60fps pixel scrolling without any per-move animation-duration bookkeeping. The camera's fractional position means the tile-render loop draws one extra tile past each viewport edge (`Math.floor`/`+1`) to avoid black cut-offs while panning. `resetVisualLerps()` (`animation.ts`) and `resetCameraLerp()` (`camera.ts`) are called on every floor/Hub/Arena/Boss transition so the camera and entities snap cleanly to the new layout instead of swooshing across it.

**Walking Hop, No Idle Bob:** entities are perfectly still when idle — there is no time-based idle animation. `render.ts`'s `walkHopOffsetY` derives a small vertical hop (up to 4px) purely from how far an entity's spring-lerped visual position still lags its logical tile (Section 4 above): while that gap exceeds 0.05 tiles the hop follows `-|sin(((tileX+tileY) mod 1) * pi)| * 4`, so the bounce is driven by *position*, not a `performance.now()` clock — it starts and stops exactly with movement and never runs while stationary. Applies to both the Player and Enemies, `Math.round`ed before the sprite draws.

**Palette (Amber UI theme — retained for all HTML/CSS overlays and canvas UI accents)**
*   Background / Dark: `#1a0f00` (Dark Amber Black)
*   Foreground / Light: `#ffb300` (Bright Amber Neon)
*   Midtone / UI: `#996600` (Muted Amber)

Only the canvas game-world graphics moved to the full-color sheet. The HUD, Inventory, Menus, and all other HTML/CSS overlays keep the retro amber palette, as do canvas-drawn UI accents (floating combat text, telegraph pulses, particles, enemy health bars).

Required registry entries: Player, Bone-Grunt, Ember-Bat, Volt-Turret, Frost-Wraith, Bone-Knight, Cinder-Shaman, Volt-Hound, Frost-Sentinel, Time-Weaver, Inferno-Golem, Storm-Caller, Glacial-Knight, Chrono-Lich, Floor, Wall (straight/corner/T/cross/end, see below), Door, Stairs, Anchor, Shortcut Gate (Hub), Boss Gate, Shop Terminal (Hub), Chest, Weapon pickup, Accessory pickup, Potion, Consumable pickup, Time Shard, Fire Hazard, Frost Hazard, Cursed Rift — plus the per-item Weapon/Accessory/Potion/Consumable/Relic maps described above.

**Wall autotiling:** `TILE.WALL` is not a single sprite — `render.ts` computes a 4-bit bitmask each frame from which cardinal neighbors (N/E/S/W) are also walls (honoring `expiringTiles` overlays, so a temporary Ice-Barricade blends into the corridor it's placed in) and picks one of 5 sprites — straight, corner, T-junction, 4-way cross, or dead-end — rotated in 90-degree steps via `drawTile`'s `rotQuarters` param so the art always meets its neighbors correctly. This replaces a single static wall sprite used everywhere.

**Mini-Boss 2x-scale composite:** Inferno-Golem, Storm-Caller, Glacial-Knight, and the Chrono-Lich draw at 32x32 (2x the regular 16x16 tile) instead of needing dedicated "big" spritesheet art — `drawTile`/`drawRef` take an optional `size` parameter (default `TILE_SIZE`) that scales the same source cell up on draw, anchored to the tile's bottom-center so the sprite grows upward/outward rather than shifting the entity's actual tile-based position. A third, smaller tier (1.5x) reuses the same mechanism for the Colossal Elite Affix (Section 6C).

**Biome Visual Themes & Subtle Floor Decor:** two purely cosmetic touches keep the same tileset from looking identical across 99 floors. Every Wall sprite (including the autotiled corner/T/cross/end variants and expiring Ice-Barricade overlays) is drawn through `drawTintedRef` (`render.ts`), which recolors the sprite on the shared scratch canvas with a `source-atop` composite — a translucent per-Biome wash (`BIOME_WALL_TINTS` in `palette.ts`, indexed 0-9) blended over the original line art rather than replacing it, so wall detail stays visible under the tint. Biome 1 keeps the sheet's native untinted color. Separately, Floor tiles get a faint (15% alpha) dirt or grass speckle sprite (`DECOR_DIRT`/`DECOR_GRASS` in `sprites.ts`) picked from a coordinate-and-floor-seeded deterministic pseudo-random value, so the scatter is dense enough to break up flat floors but reproducible per tile (no per-frame flicker) and rare enough (~20% of Floor tiles total) to stay out of the way of gameplay-relevant tiles and readability. **Hand-authored floors are exempt from both:** the Hub and every Mini-Boss/Final-Boss Arena render walls untinted and Floor tiles as the plain blank sprite, regardless of what Biome their floor number would otherwise map to — a fixed, curated room shouldn't inherit a coincidental ambient tint or get cluttered with random decor.

**Wall Tint Offscreen Canvas Caching:** `drawTintedRef` (`render.ts`) pre-renders tinted and rotated wall sprite variants into a 16x16 offscreen canvas cache (`tintedTileCache`, keyed by sprite position, tint color, and 90-degree rotation steps; max ~200 tile combinations across all biomes). Drawing a tinted wall tile is a single direct `drawImage` call per tile with zero offscreen context clearing or `globalCompositeOperation` state switching per frame.

**Batched Pixel Glyph Rendering:** `drawGlyphText` (`floatingText.ts`) renders floating combat text and damage numbers by batching pixel glyph paths into a single `ctx.beginPath()`, `ctx.rect()` sequence per text line followed by a single `ctx.fill()`, minimizing canvas draw call overhead.

---

## 5. Elements & Status Effects System
To add tactical depth to each floor's 100 turns, combat uses a hard-coded Rock-Paper-Scissors loop — the **Elemental Wheel** — so players never have to memorize arbitrary weaknesses:

*   **Fire** melts/beats **Frost** (ice).
*   **Frost** freezes/beats **Volt** (slows current).
*   **Volt** shocks/beats **Physical** (conducts through armor).
*   **Physical** smothers/beats **Fire** (dirt puts out flames).
*   **Chrono** sits outside the wheel: it is never resisted and has no weakness — but Chrono weapons/enemies are rare.

**Multipliers** (every monster's weakness/resistance is derived from the wheel, never hand-assigned):
*   **Weakness (2x):** attacking "down the wheel" — your element beats the defender's (e.g., Volt attack vs. a Physical Bone-Grunt).
*   **Resist (0.5x, rounded down):** attacking "up the wheel" — the defender's element beats yours (e.g., Physical attack vs. a Volt-Turret: it conducts through armor).
*   All other matchups deal 1x — including same-element and anything vs./from Chrono. (Same-element is deliberately NOT resisted so the starter Physical sword stays effective against Floor 1's Physical Bone-Grunts.)
*   **Minimum damage:** every successful hit deals at least 1 damage after modifiers — except a Weakness hit (2x), which is guaranteed at least 3, so exploiting the wheel still feels meaningful even against a heavily armored target where `ATK - DEF` alone would round down to 1-2 (`computeDamage` in `combat.ts`).

**Status Effects** (applied by certain skills, weapons, and enemies — affect both player and enemies):
*   **Burn (Fire):** Takes 2 damage at the start of its turn for 3 turns.
*   **Stun (Volt):** Skips its next turn (1 turn duration).
*   **Chilled (Frost):** Movement requires 2 turns per tile (3 turns duration). Enemies with speed 2 drop to speed 1.

Sources of status effects **on the player** (so the `run.status` field matters): Frost-Wraith melee hits have a 25% chance to inflict Chilled; standing on a Fire Hazard tile inflicts Burn; the Chrono-Lich's Time-Blast inflicts Stun on hit. Accessories grant immunities (see 6D).

---

## 6. Detailed Game Content Lists

Lore / flavor text in the tables below is UI content: it is displayed in the HTML Inventory overlay when an item is selected, and in a "Bestiary" tab of the pause/skill menu for monsters (wired up alongside those overlays in Phases 3-4). **In the Inventory, lore always renders BELOW the item's Stat Block** (Section 8, Item Stat Block) — mechanics first, flavor second.

### A. Weapons (Dropped by Monsters or Found in Chests)
Weapons are lost on loop reset. Players must adapt their run based on what drops.

The roster below (16 weapons) was the original set; it later grew to **43
weapons across 3 tiers** (Early F1-20 / Biomes 1-2, Mid F21-50 / Biomes 3-5, Late F51-99 / Biomes 6-10) to fill the
99-floor drop pool. All loot generators — regular chests (`rollChestItem`), Elite drops (`rollEliteDrop`), Cursed Rift bargains (`resolveLichProjection`), Chrono Anvils (`tryChronoAnvil`), and the Hub Smuggler (`buySmugglerOffer`) — use stage-overlapping pools (`rollWeaponForDepth`): Early Stage (F1-20) drops Early Tier weapons; Mid Stage (F21-50) drops both Early and Mid Tier weapons; Late Stage (F51-99) drops both Mid and Late Tier weapons (excluding Early Tier weapons). Every one of the original 16 sample weapons besides the two starters was subsequently renamed/replaced during a content pass. The full current roster — including per-tier ATK ranges and every passive ID — lives in `src/content.ts`'s `WEAPONS` table; this section stays as a representative sample rather than a duplicated 43-row copy.

**Ultimate Elemental weapons:** three Tier-3 chase items, one per non-Chrono
element that lacked a signature top-end weapon, added to the Late Tier drop
pool so every element has a viable Floor 80-99 chase item:

| Weapon Name | Base ATK | Element | Special Effect / Passive | Drop Source | Lore / Flavor Text |
|-------------|----------|---------|---------------------------|--------------|---------------------|
| Laevateinn  | 9        | Fire    | 2x damage vs a Burning target. | Late Tier pool (Chests/Elites, F51+) | "The legendary fire sword that reduces everything to ash. It burns hottest when the fuel is already lit." |
| Vajra       | 9        | Volt    | Ranged 1-2, pierces the tile behind the target, and guarantees a Stun on hit. | Late Tier pool (Chests/Elites, F51+) | "A spear of mythic thunder. It never misses, and its strike freezes the nervous system." |
| Niflheim    | 9        | Frost   | Instantly executes a Chilled enemy at or below 25% HP (Mini-Bosses/Chrono-Lich exempt) before normal damage. | Late Tier pool (Chests/Elites, F51+) | "A axe colder than the void. It does not cut; it simply shatters what is already frozen." |

| Weapon Name  | Base ATK | Element  | Special Effect / Passive                          | Drop Source        | Lore / Flavor Text |
|--------------|----------|----------|---------------------------------------------------|--------------------|--------------------|
| Rusty Sword  | 3        | Physical | None (Starter weapon).                            | Starter / Bone-Grunts | "Your service weapon from a timeline long forgotten. It remembers the taste of blood, but its edge has dulled across a thousand failed resets." |
| Bone Dagger  | 2        | Physical | Free to equip/swap even mid-combat.               | Chests (Biome 1+)  | "Carved from the femur of a fallen Watchwarden. It demands so little weight to wield, you can draw it between the ticks of a clock." |
| Flametongue  | 3        | Fire     | Attacking removes Chilled from yourself.          | Ember-Bat          | "A campfire given an edge. It never quite stops smoldering." |
| Mage Masher  | 3        | Volt     | 10% chance on hit to restore 1 Stamina.           | Volt-Turret        | "A duelist's parrying blade, repurposed. It hums faintly, siphoning static off every failed guard." |
| Ice Lance    | 4        | Frost    | Ranged attack, pierces 2 tiles in a line.         | Frost-Wraith       | "A shard of the Undercroft, sharpened. It skewers straight through whatever stands in its way." |
| Thunder Rod  | 4        | Volt     | On hit: also strikes both tiles flanking the target. | Chests (Biome 2+) | "A lightning rod bent into a weapon. The charge always finds more than one target." |
| Assassin's Dagger | 5  | Chrono   | Knocks the enemy back 2 tiles and randomly reassigns their element. | Time-Weaver (Elite) | "It bends reality upon impact. You never quite know what you'll leave behind." |
| Coral Sword  | 5        | Volt     | On hit: pulls the enemy 1 tile closer; 25% chance to Stun. | Volt-Hound  | "Grown, not forged, in a flooded sub-level that used to be a power station." |
| Dark Knight's Blade | 8 | Physical | Blood Magic: you take 2 HP damage per swing.      | Bone-Knight        | "It cuts deeper than any living wrist could bear to swing it." |
| Diamond Mace | 5        | Frost    | Deals 2x damage to Chilled enemies.               | Frost-Sentinel     | "Faceted ice that never melts. It shatters what the cold has already made brittle." |
| Save the Queen | 6      | Frost    | Negates the first hit taken on each floor.        | Frost-Sentinel     | "A ceremonial blade, repurposed for a war it wasn't built for. It still remembers how to shield someone." |
| Ifrit's Blade | 6       | Fire     | Cleaves the 3 tiles in front on every attack.     | Inferno-Golem (Mini-Boss) | "A shard of the Undercroft's opposite — a sliver of something that never stopped burning." |
| Blitz Whip   | 6        | Volt     | On hit: lightning chains to 1 additional nearby enemy. | Storm-Caller (Mini-Boss) | "Live current, coiled. It never stops looking for a second target." |
| Ice Brand    | 6        | Frost    | On kill: spreads Chilled to nearby enemies.       | Glacial-Knight (Mini-Boss) | "A killing blow with this blade leaves the cold looking for somewhere else to go." |
| Excalibur    | 8        | Physical | Ignores 50% of the target's DEF.                  | Chests (Biome 3+)  | "A relic from a story that didn't happen here — armor simply forgets to matter around it." |
| Masamune     | 10       | Chrono   | Kills refund 3 Turns to the turn counter.         | Chests (Biome 3+)  | "A legendary blade, somehow, in a timeline that has no business having legends. Mythic-tier — it steals back a real handful of moments with every kill." |

### B. Skills (Purchased/Upgraded with Echoes in the Upgrade Shop)
Skills cost Stamina. The player maps skills to up to **4 hotkeys (Q/E/R/F)**
via the Skill Menu; the loadout persists across loop resets
(`persistent.skillLoadout`). Skill levels are permanent (`persistent.skills`).
**Dash starts at Level 1 on every new save.**

**Skill Tree:** with a strict 4-slot loadout and a Stamina economy, overlapping
skills become dead content players simply math around — so skills are grouped
into four Branches radiating from the starter Dash skill, each gated behind a
prerequisite skill-and-level (or, for the two Chronomancer capstones Recall
and Ultima, behind an "unlock N other skills" count instead of a specific
skill). A skill's Level 1 unlock is hidden behind its prerequisite in the
Upgrade Shop and Skill tab, shown with a lock icon and "Requires: X Lvl N"
text (`isSkillUnlocked` / `skillRequirementLabel` in `shop.ts`/`content.ts`).

Source of truth: `src/content.ts`'s `SKILLS` / `SKILL_LEVEL_EFFECTS` /
`SKILL_BRANCHES` / `SKILL_REQUIREMENTS` — this table is a reading aid, kept in
sync with it.

**Branch A — The Striker** (Mobility, Positioning, Assassination)

| Skill Name   | Element  | Stamina | Requires             | Lvl 1 (Base)                             | Lvl 2 Upgrade                    | Lvl 3 Upgrade                          |
|--------------|----------|---------|----------------------|-------------------------------------------|-----------------------------------|------------------------------------------|
| Dash         | Physical | 2       | None (Starter)        | Move 2 tiles in one turn.                  | Move 3 tiles.                     | +1 Turn refunded on use.                 |
| Bash         | Physical | 2       | Dash Lvl 1            | 1x ATK + Knockback 2 tiles.                 | 1.5x ATK + Knockback 2.           | Stuns instead if it hits a wall.         |
| Mug          | Physical | 2       | Dash Lvl 1            | 0.5x ATK, 25% chance to steal a Consumable. | 35% chance to steal.              | 50% chance to steal.                     |
| Grapple      | Physical | 2       | Bash Lvl 1            | Pulls target up to 3 tiles directly to you. | Pulls up to 4 tiles.               | Next attack against them deals 1.5x.     |
| Static Shift | Volt     | 3       | Dash Lvl 2            | Teleport 3 tiles, Stun adjacent.            | Range becomes 4 tiles.             | Costs 2 Stamina instead of 3.            |
| Omnislash    | Physical | 3       | Grapple or Static Shift Lvl 1 | 1.5x ATK (3x vs. Stunned/Chilled).  | 2x ATK (4x vs. Stunned/Chilled).  | Resets Stamina to Max on a kill.         |
| Vanish       | Chrono   | 2       | Mug Lvl 2             | Next move ignores enemy/wall collision.     | Next 2 moves ignore collision.     | Grants +1 Turn on cast.                  |

**Branch B — The Sentinel** (Defense, Survival, Brawling)

| Skill Name      | Element  | Stamina | Requires              | Lvl 1 (Base)                                            | Lvl 2 Upgrade            | Lvl 3 Upgrade                     |
|-----------------|----------|---------|------------------------|------------------------------------------------------------|--------------------------|------------------------------------|
| Cleave          | Physical | 3       | Dash Lvl 1              | Deal 1.2x ATK to 3 front tiles.                              | Deal 1.5x ATK.           | Inflicts Knockback 1.             |
| Ice Aegis       | Frost    | 4       | Dash Lvl 1              | Block the next 1 attack entirely.                            | Blocks the next 2 attacks. | Attackers are Chilled.          |
| Provoke         | Fire     | 2       | Cleave Lvl 1            | +5 DEF for 1 turn, pulls enemies within 5 tiles closer.      | +7 DEF for 1 turn.       | Also Burns adjacent enemies on cast. |
| Reflect Barrier | Volt     | 3       | Ice Aegis Lvl 1         | Block 1 hit, return 2x ATK to attacker.                      | Block 1 hit, return 3x ATK. | The reflected hit also Stuns them. |
| Chakra          | Physical | 3       | Provoke Lvl 1           | Costs 0 Turns; restores 20% Max HP.                          | Restores 30% Max HP.     | Also grants +2 ATK for 3 turns.   |
| Fortify         | Physical | All*    | Reflect Barrier Lvl 2   | Consumes all Stamina; grants +2 DEF per Stamina spent for 3 turns. | +3 DEF per Stamina spent. | Also grants status immunity while active. |
| Aura            | Physical | 3       | Chakra Lvl 2            | Cleanses Status, grants immunity for 3 turns.                | Immunity lasts 4 turns.  | Heals 20 HP on cast.              |

**Branch C — The Weaver** (Magic, Area Control, Debuffs)

| Skill Name      | Element | Stamina | Requires           | Lvl 1 (Base)                                | Lvl 2 Upgrade   | Lvl 3 Upgrade                       |
|-----------------|---------|---------|---------------------|------------------------------------------------|-----------------|----------------------------------------|
| Flame Arc       | Fire    | 4       | Bash or Cleave Lvl 1 | Deal 5 Fire DMG to adjacent enemies.             | Chance to Burn (50%). | Leaves Fire Hazard on floor (3 turns). |
| Defuse          | Volt    | 2       | Flame Arc Lvl 1      | Strips a target's DEF to 0 for 1 turn.           | Lasts 2 turns.  | Lasts 3 turns.                        |
| Blizzard Wave   | Frost   | 4       | Flame Arc Lvl 1      | 3x3 AOE Frost damage + Chilled.                  | 1.3x damage.    | Also Knocks back 1 tile.              |
| Slow            | Frost   | 3       | Defuse Lvl 1         | Target's speed becomes 0 for 2 turns.            | Lasts 3 turns.  | Affects a 3x3 area instead of single target. |
| Chain Lightning | Volt    | 4       | Defuse Lvl 2         | Hits target, arcs to 2 nearest enemies for 1x ATK. | Arcs to 3 enemies. | 25% chance to Stun all hit targets. |
| Meteor          | Fire    | 5       | Blizzard Wave Lvl 2  | 4-range, 1-turn-delay 3x3 explosion (2x ATK).    | 3x ATK.         | Leaves Fire Hazard at center.          |

**Branch D — The Chronomancer** (Time Manipulation, Endgame)

| Skill Name | Element | Stamina | Requires          | Lvl 1 (Base)                                    | Lvl 2 Upgrade              | Lvl 3 Upgrade                       |
|------------|---------|---------|---------------------|----------------------------------------------------|------------------------------|----------------------------------------|
| Recall     | Chrono  | 4       | Unlock 10 Skills     | Mark a tile, recast to teleport back instantly.      | Recast restores 1 Stamina.   | Recast costs 0 Turns.                 |
| Haste      | Chrono  | 4       | Recall Lvl 1         | Next 2 actions (Move/Attack) cost 0 Turns.           | Also restores 1 Stamina on cast. | Next 3 actions cost 0 Turns.      |
| Time-Stop  | Chrono  | 5       | Recall Lvl 2         | Freezes the floor's 100-Turn counter for 3 turns.    | Freezes for 5 turns.         | Freezes for 7 turns.                  |
| Paradox    | Chrono  | 4       | Haste Lvl 2          | Swaps your current HP % with target's HP %.          | Also swaps Status effects.   | Refunds 2 Turns if used on an Elite/Boss. |
| Ultima     | Chrono  | All*    | Unlock 15 Skills     | Consumes all Stamina; 5x5 AOE for (Stamina x2) DMG.  | (Stamina x2.5) DMG.          | (Stamina x3) DMG.                     |

*Ultima's and Fortify's Stamina cost is dynamic — they always spend whatever
Stamina the player currently has (`skillStaminaCost` in `skills.ts`), rather
than a fixed number.

**Skill costs (Echoes), by Cost Tier (`SKILL_TIER` in `content.ts`):**
- **Tier 1 (Core/Setup)** — Dash, Bash, Cleave, Mug, Flame Arc, Ice Aegis, Defuse: Unlock 25, Lvl 2 50, Lvl 3 100 (175 total).
- **Tier 2 (Advanced/Tactical)** — Grapple, Static Shift, Omnislash, Provoke, Reflect Barrier, Chakra, Blizzard Wave, Slow, Chain Lightning, Vanish: Unlock 75, Lvl 2 150, Lvl 3 300 (525 total).
- **Tier 3 (Chronomancer/Endgame)** — Recall, Haste, Time-Stop, Paradox, Meteor, Fortify, Aura, Ultima: Unlock 200, Lvl 2 400, Lvl 3 800 (1,400 total).

### C. Monsters (Bestiary & Stats)
**Damage Formula:** `max(1, (Attacker_ATK - Defender_DEF)) * Elemental_Modifier`

Weaknesses below follow the Elemental Wheel (Section 5) automatically — the element that beats the monster's own element.

**Depth Scaling (automatic):** the stats below are **base stats**. At spawn time, an enemy's HP and ATK are multiplied by the **Depth Multiplier** for the floor it spawns on:

```
tier            = floor((currentFloor - 1) / 5)      // 0 on Floors 1-5, 1 on 6-10, ... 19 on 96-99
depthMultiplier = 1.08 ^ tier                         // +8% compounding every 5 floors (4.3x by Floor 99)
scaledHP        = round(baseHP  * depthMultiplier)
scaledATK       = round(baseATK * depthMultiplier)
```

DEF and Speed do NOT scale (armor and mobility stay a readable, fixed property of each kind; raw threat comes from HP/ATK). NG+ HP scaling (`persistent.ngPlusLevel`, +10%/level) multiplies ON TOP of the Depth Multiplier. Mini-Bosses and the Chrono-Lich use their own hand-tuned stats below and are exempt from Depth Scaling (their floors are fixed, so scaling is baked in).

#### Regular Enemies (Biomes 1-2, then everywhere)

| Monster              | Base HP | Base ATK | DEF | Speed        | Element / Weakness | Behavior                                | Drops                    | Lore / Origin |
|----------------------|-----|-----|-----|--------------|--------------------|------------------------------------------|--------------------------|----------------|
| Bone-Grunt           | 12  | 4   | 1   | 1 tile/turn  | Phys / Volt        | Chases player.                           | Rusty Sword, Potion      | "Once your comrades-in-arms, now trapped in a cycle of endless decay and resurrection. They attack blindly, trying to enforce a quarantine that failed lifetimes ago." |
| Ember-Bat            | 8   | 5   | 0   | 2 tiles/turn | Fire / Physical    | Erratic movement.                        | Flametongue              | "Scavengers mutated by the friction of fractured time. They feed on the ambient heat of collapsing realities, moving with jarring, erratic bursts." |
| Volt-Turret          | 25  | 6   | 3   | Stationary   | Volt / Frost       | Shoots 4-tile line every 2 turns.        | Mage Masher              | "The citadel's automated defense grid. Unaware that the kingdom has already fallen, they patiently charge their capacitors to vaporize intruders." |
| Frost-Wraith         | 18  | 5   | 2   | 1 tile/turn  | Frost / Fire       | Phases through walls. Hits may Chill (25%). | Ice Lance             | "The frozen souls of Oakhaven's nobility, trapped at the exact moment the Hourglass shattered. Their touch induces the chilling lethargy of stopped time." |

#### Deep-Biome Regulars (first appear in Biome 3, Floors 21+; mixed into all deeper biomes)

| Monster              | Base HP | Base ATK | DEF | Speed        | Element / Weakness | Behavior                                | Drops                    | Lore / Origin |
|----------------------|-----|-----|-----|--------------|--------------------|------------------------------------------|--------------------------|----------------|
| Bone-Knight (Armored)| 22  | 5   | **6** | 1 tile/turn | Phys / Volt       | Chases player. High DEF wall — punishes wrong-element bumping; Volt or high-ATK weapons required to break through efficiently. | Dark Knight's Blade, Potion | "The honor guard never abandoned their posts. Centuries of resets have fused their plate to their bones." |
| Cinder-Shaman        | 14  | 6   | 1   | 1 tile/turn  | Fire / Physical    | **Ranged AOE:** keeps 4-6 tiles away; every 3rd turn lobs a firebomb at the player's tile — after a 1-turn telegraph, it detonates in a 3x3 area, dealing ATK Fire damage and leaving a 2-turn Fire Hazard on the center tile. | Liquid Fire Flask, Flamberge | "It still performs the rain-summoning rite of old Oakhaven. What falls now is not water." |
| Volt-Hound           | 10  | 6   | 0   | 2 tiles/turn | Volt / Frost       | Pack hunter: spawns in pairs; lunges the last 2 tiles in a straight line. Hits have a 25% chance to Stun. | Coral Sword, Stamina Draught | "The kennels of the citadel guard, warped into living capacitors. They hunt in pairs, herding prey into each other's arcs." |
| Frost-Sentinel (Armored)| 20 | 5  | **5** | Stationary  | Frost / Fire       | **Ranged AOE:** stationary; every 2nd turn fires a frost pulse in a cross (+) pattern 3 tiles in all four directions; hits inflict Chilled (50%). | Diamond Mace, Save the Queen | "Statues of the old kings, animated by the cold between seconds. Their gaze sweeps the halls in four directions at once." |

#### Clockwork Scarab (Chrono; mixed into the pool from Floor 31+)

| Monster              | Base HP | Base ATK | DEF | Speed        | Element / Weakness | Behavior                                | Drops                    | Lore / Origin |
|----------------------|-----|-----|-----|--------------|--------------------|------------------------------------------|--------------------------|----------------|
| Clockwork Scarab     | 6   | 1   | **9** | 1 tile/turn | Chrono / None      | Skittish: chases from range, but once the player is adjacent it flees instead of bump-attacking — must be herded into a chokepoint to be caught. A hit still deals only 1 flat damage and instead steals 3 Turns from the floor timer, directly attacking the 100-turn budget rather than the HP bar. | Time Shard (standard roll) | "A gnawing little paradox, small enough to slip through the cracks in the loop. It does not bite for blood — it bites for time." |

#### Tier-3 Upgrades (replace their Tier-1/2 counterpart in the spawn pool from Floor 41+; same sprite, tinted by a glowing aura)

| Monster (Upgrade of) | Base HP | Base ATK | DEF | Speed        | Element / Weakness | Aura Color   | Behavior Twist |
|-----------------------|-----|-----|-----|--------------|--------------------|--------------|-----------------|
| Dread-Legion (Bone-Grunt)     | 16 | 6 | 2 | 1 tile/turn  | Phys / Volt  | Blood Red     | Unstoppable: immune to Knockback. |
| Doom-Guard (Bone-Knight)      | 28 | 7 | 5 | 1 tile/turn  | Phys / Volt  | Deep Purple   | Enraged: below 50% HP, Speed permanently rises to 2. |
| Ash-Fiend (Ember-Bat)         | 12 | 7 | 0 | 2 tiles/turn | Fire / Physical | Ash Grey   | Volatile: leaves a 2-turn Fire Hazard where it dies. |
| Hellfire-Magus (Cinder-Shaman)| 18 | 8 | 1 | 1 tile/turn  | Fire / Physical | Blinding Yellow | Rapid Cast: firebomb cadence every 2nd turn instead of every 3rd. |
| Tesla-Coil (Volt-Turret)      | 35 | 8 | 4 | Stationary   | Volt / Frost | Bright Cyan   | Long-Range: line-shot reaches 8 tiles instead of 4. |
| Storm-Stalker (Volt-Hound)    | 15 | 8 | 0 | 2 tiles/turn | Volt / Frost | Dark Blue     | Paralyzing Bite: Stun chance raised to 50% (from 25%). |
| Void-Spirit (Frost-Wraith)    | 24 | 7 | 3 | 1 tile/turn  | Frost / Fire | Pitch Black   | Lethargy: phases through walls; hits have 50% Chill chance and drain 1 Stamina. |
| Glacial-Monolith (Frost-Sentinel)| 28 | 7 | 4 | Stationary | Frost / Fire | Pure White    | Blizzard Pulse: telegraph shape is a stationary 3x3 square instead of a cross. |

#### Elite

| Monster              | Base HP | Base ATK | DEF | Speed        | Element / Weakness | Behavior                                | Drops                    | Lore / Origin |
|----------------------|-----|-----|-----|--------------|--------------------|------------------------------------------|--------------------------|----------------|
| Time-Weaver (Elite)  | 40  | 8   | 4   | 1 tile/turn  | Chrono / None      | Teleports away when hit.                 | Assassin's Dagger, Max Potion | "The Lich's corrupted apprentices. They desperately stitch the tears in the loop together. Striking them causes them to slip backwards through the timeline, appearing elsewhere." |

#### Mini-Bosses (fixed Arena floors — every 10th floor; each drops a Temporal Anchor, Section 7)

Stats below are final (no Depth Scaling). The three archetypes cycle through the deeper Arena floors as **empowered variants** (e.g., Floor 40 "Inferno-Golem Mk II") with a x2.5 HP / x1.6 ATK multiplier per repeat appearance and one added ability twist, so every Arena stays a distinct wall without requiring nine fully bespoke fights.

| Mini-Boss            | Floor | HP  | ATK | DEF | Speed        | Element / Weakness | Behavior / Arena Mechanics | Drops |
|----------------------|-------|-----|-----|-----|--------------|--------------------|-----------------------------|-------|
| **Inferno-Golem**    | 10    | 120 | 9   | 4   | 1 tile/turn  | Fire / Physical    | Slow, relentless chaser. Every 5th turn: **Magma Slam** — telegraphs a 3x3 area under the player for 1 turn, then slams it for 1.5x ATK and leaves Fire Hazards for 3 turns. Below 50% HP the slam cadence quickens to every 4th turn — tuned deliberately loose (not every 3rd) so the player still gets a normal attack window between casts. Arena has permanent Fire Hazard strips that constrain kiting lanes. | Temporal Anchor (Biome 1), Ifrit's Blade, guaranteed Time Shard x2 |
| **Storm-Caller**     | 20    | 100 | 11  | 3   | 1 tile/turn  | Volt / Frost       | Keeps mid-range; every 3rd turn casts **Chain Bolt** — a 4-tile Volt line that forks 90° once off the first wall it hits. Every 5th turn summons 1 Volt-Hound (max 2 alive). Below 50% HP, Chain Bolt gains a 25% Stun chance. Arena has 4 copper-pylon pillars that block bolts — cover is the mechanic. | Temporal Anchor (Biome 2), Blitz Whip, guaranteed Time Shard x2 |
| **Glacial-Knight**   | 30    | 140 | 10  | **5** | 1 tile/turn | Frost / Fire       | Armored duelist: high DEF punishes non-Fire attackers. Every 3rd turn: **Frozen Sweep** — hits all 8 adjacent tiles, 50% Chilled. Every 6th turn raises an Ice-Barricade wall segment (3 tiles, melts in 5 turns) to cut off retreat lanes. Below 50% HP its walk gains +1 speed while the player is Chilled. | Temporal Anchor (Biome 3), Ice Brand, guaranteed Time Shard x2 |
| Empowered variants   | 40-90 | x2.5 per repeat | x1.6 per repeat | — | — | (as archetype) | Cycle: F40 Inferno-Golem Mk II, F50 Storm-Caller Mk II, F60 Glacial-Knight Mk II, F70 Mk III, F80 Mk III, F90 Mk III — each Mk adds one ability twist (e.g., Mk II Golem's slam is 5x5; Mk II Storm-Caller summons Frost-Sentinels; Mk III Knight's barricades don't melt). Exact twists tuned during implementation. | Temporal Anchor (their Biome), themed weapon, Time Shard x2 |

#### Final Boss (Floor 99)

| Boss                 | HP  | ATK | DEF | Speed        | Element / Weakness | Behavior | Drops |
|----------------------|-----|-----|-----|--------------|--------------------|----------|-------|
| **Chrono-Lich**      | 600 | 22  | 8   | 1 tile/turn  | Chrono / None      | Summons Grunts (scaled to Floor-99 depth), casts Time-Blast (Stuns). HP-threshold escalation: below 50% HP, attack/summon cadence shortens (plus jitter so repeat fights aren't purely memorizable). Below 25% HP he casts **Rewind** once — restoring 15% of max HP and stealing 10 Turns from the floor counter (telegraphed 2 turns ahead; interrupted if he is Stunned when it resolves). | Victory | 

*Chrono-Lich lore:* "The architect of this purgatory. He sits at the bottom of the temporal well, ninety-nine floors deep, hoarding what remains of the Hourglass in a mad bid to ascend. He no longer remembers why he wanted to live forever."

**Time Shards (Risk/Reward):** every normal (non-Elite, non-Boss) enemy has a **25% chance to drop a Time Shard**, which restores **+5 Turns** to the *current floor's* counter when picked up. This turns combat into a gamble: spend turns killing the enemy hoping to buy the floor more time, or go around? Unlike layout and enemy placement, Time Shard drops are rolled fresh each loop (intentionally non-deterministic — that's the gamble), same as chest contents (Section 7, Dynamic Chest Loot).

**Enemy mix by Biome:** Biome 1 (F1-10): Grunts, Ember-Bats. Biome 2 (F11-20): adds Volt-Turrets, Frost-Wraiths. Biome 3 (F21-30): adds all four Deep-Biome Regulars and the Time-Weaver Elite. Biome 4 (F31-40): full roster plus the Clockwork Scarab, with the biome's thematic element over-represented (see Section 7's Biome table) and Elites appearing more frequently every 2 biomes. Biome 5+ (F41+): the eight Deep-Biome Regulars/Bone-Knight-and-friends are replaced in the pool by their Tier-3 Upgrades (above) — same roles and pairing/summon rules, tougher stats and one added twist each; the Clockwork Scarab and Time-Weaver Elite are unaffected.

**Elite Affixes:** any regular spawn (never a Mini-Boss/Chrono-Lich) has a **10% chance** to roll one of 10 Elite Affixes instead — a randomized prefix (`Enemy.affix`) that modifies stats/behavior and guarantees a Relic-or-Weapon drop on kill (50/50). Affixes: Blinking (dodge chance), Shielded (blocks the first 3 hits), Armored (+5 DEF, knockback-immune), Swift (+1 Speed), Colossal (+300% Max HP, 2x ATK, turn-skip movement), Wealthy (halved HP/ATK, flees toward the Stairs instead of fighting), Volatile (explodes on death), Cursed (steals a Turn instead of dealing damage), Vampiric (self-heals on hit), Toxic (leaves a damaging hazard tile on death). A Bottom-HUD banner pulses within 3 tiles of an awake Elite (Section 8). Full stat-mod math: `src/content.ts`'s `ELITE_AFFIXES` / `applyEliteAffixStats`, hooks in `combat.ts`/`enemyAI.ts`.

**Elite weapon drops scale with depth** (`content.ts`'s `rollEliteDrop(id, heldRelics, currentFloor)`): Floor 51+ rolls the Late Tier pool with a random `+2 to +4` ATK bonus, Floor 21-50 rolls Mid Tier with `+1 to +3`, and Floor 1-20 rolls a new Early Tier pool (the F1-20 weapons minus the Rusty Sword starter) with `+1 to +2` — via a shared `getRandomBonus(min, max)` helper. The bonus is added directly to the dropped `Weapon`'s `atk` and mirrored into a new `upgradeBonus` field so the UI can show it as a suffix (e.g. "Flametongue +3") without ever touching the base `name` sprite lookups key off. The Blood-Infused Anvil Cursed Rift event (Section 6G) stacks onto the same field — a weapon that's both an Elite drop and Anvil-sharpened shows its combined bonus.

### D. Accessories (Found in Chests; lost on loop reset)
One equipped by default; the Upgrade Shop's one-time Accessory Slot 2/3 unlocks (Section 7) let up to 3 be equipped **simultaneously**, all passives stacking at once — not a swappable bench like the Weapon Slot 2 below.

| Accessory      | Passive                                   | Drop Source          | Lore / Flavor Text |
|----------------|-------------------------------------------|----------------------|----------------------|
| Iron Ring      | +2 DEF.                                   | Chests               | "A crude signet of the lower guard. It bears the dents of countless skirmishes that never technically happened." |
| Ring of Vigor  | +10 Max HP.                               | Chests               | "Pulses with a steady heartbeat. Holding it reminds your body that it is still alive, anchoring your physical form." |
| Boots of Haste | Dash skill costs 1 Stamina instead of 2.  | Chests (Biome 2+)    | "The leather is pristine, untouched by the sands of time. Slipping them on makes the world around you feel like it's moving through syrup." |
| Echo Charm     | +20% Echoes earned (rounded up).          | Chests (Biome 2+)    | "A jagged piece of crystallized memory. It whispers the mistakes of your past lives into your ear, ensuring you do not waste the blood you spill." |
| Ember Pendant  | Immune to Burn; walk fire hazards freely. | Chests (Biome 2+)    | "A piece of the citadel's original hearthstone. It recognizes you as a son of Oakhaven, granting safe passage through the flames." |
| Winged Anklet  | Immune to Chilled.                        | Chests (Biome 2+)    | "Woven with feathers from the mythical Sun-Bird. It rejects the stagnation of the void, keeping your blood rushing when the cold closes in." |
| Grounding Band | Immune to Stun.                           | Chests (Biome 3+)     | "A heavy, copper torc. It grounds not just electricity, but your very consciousness, preventing sudden shocks from interrupting your flow." |
| Berserker's Cuff | +4 Total ATK, -2 Total DEF.              | Chests               | "Restricts blood flow just enough to induce a permanent state of rage." |
| Paladin's Mantle | +3 Total DEF, -10 Max HP.                | Chests               | "Heavy leaden weave. It absorbs blows perfectly but exhausts the wearer." |
| Battery Cell   | +3 Max Stamina.                           | Chests               | "A glowing hum of ancient energy that hooks directly into your nervous system." |
| Kindling Pouch | Synergy: all Fire weapons/skills deal +2 DMG. | Chests           | "Contains the ever-burning embers of the citadel's first hearth." |
| Capacitor Ring | Synergy: all Volt weapons/skills deal +2 DMG. | Chests           | "It sparks constantly, desperate to ground itself into an unlucky target." |
| Permafrost Vial | Synergy: all Frost weapons/skills deal +2 DMG. | Chests          | "A liquid so cold it freezes the air around your fingertips." |
| Vampire Tooth  | Lifesteal: heal 1 HP per enemy killed.    | Chests               | "A morbid keepsake. It pulses warmly when blood is spilled." |
| Shattered Hourglass | Safety Net: if Turns hit 0, restore 15 Turns instead of triggering the loop reset; the item shatters (is destroyed) after use. | Chests | "A broken promise of more time. Use it to finish what you started." |
| Spiked Pauldrons | Retaliation: deal 2 Physical DMG back to any enemy that hits you in melee. | Chests | "The best defense is a jagged piece of rusted metal aimed at their throat." |
| Gambler's Dice | Raises the Time Shard drop chance from 25% to 50% (see Section 6C). | Chests | "Fate is fluid in the time loop. Roll the bones and steal back some seconds." |
| Adrenaline Gland | When below 10 HP, Active Skills cost 0 Stamina. | Chests       | "Panic is just a resource waiting to be harnessed." |
| Alchemist's Belt | Using a Potion or Tactical Consumable (Section 6E) costs 0 Turns, even mid-combat. | Chests | "A perfectly organized bandolier. Your hand finds what it needs instantly." |

### E. Consumables (One-Time Use; lost on loop reset)
`Item.kind` for everything in this section is `'CONSUMABLE'` (Section 3). Two different turn-cost rules apply:
*   **Potions** follow the existing Section 7 inventory-action rule: **0 turns out of combat, 1 turn if an awake enemy is within 7 tiles** (same as equipping gear).
*   **Tactical Consumables** (the 8 new items below) always cost **1 turn to use, in or out of combat** — they represent an active combat maneuver, not a quick gear swap. Alchemist's Belt (Section 6D) overrides this and makes both categories free.

| Consumable | Effect | Drop Source | Lore / Flavor Text |
|---|---|---|---|
| Potion | Heals 10 HP. | Bone-Grunts, Chests | "A murky, lukewarm brew. It tastes like failure, but it works." |
| Minor Potion | Heals 20 HP. | Chests | "A cleaner brew than the Watch usually manages. Small comforts." |
| Max Potion | Fully restores HP. | Time-Weaver | "Distilled from a Watchwarden's final, desperate moment. It remembers what it means to be whole." |
| Hi-Potion | Heals 40% of Max HP. | Chests (later Biomes) | "Bottled by someone who actually knew what they were doing, once." |
| Megalixir | Heals 100% of Max HP and cleanses any Status effect. | Chests (later Biomes) | "The last good thing the old alchemists ever made. It burns every ailment out along with the pain." |
| Soma Drop | Not a heal — permanently +5 Max HP. Fixed 3-Turn cost (not the usual 0-1). | Chests (later Biomes) | "Not a heal — a rewrite. It takes its time settling into your bones." |
| Liquid Fire Flask | Throwable (range 3): creates a Fire Hazard on the target tile for 4 turns. | Chests | "Ignites upon exposure to the air. Excellent for blocking corridors." |
| Shock Grenade | Throwable (range 3): inflicts Stun on every tile in a 3x3 area around the target tile. | Chests | "Overloads the nervous system of anything caught in the flash." |
| Ice-Barricade Scroll | Creates a temporary Wall tile directly ahead of you (along `run.facing`); it melts after 5 turns. | Chests | "Draw the rune, summon the frost, and buy yourself a moment to breathe." |
| Stamina Draught | Instantly restores Stamina to maximum. | Chests | "Tastes like copper and ozone. Your muscles twitch violently." |
| Quicksilver Flask | Buff: your next 3 Moves or Attacks cost 0 Turns. | Chests | "Time stretches. You move between the raindrops." |
| Recall Rune | Instantly teleports you back to this floor's spawn point. | Chests | "A coward's exit, or a tactician's reset. Depends on who is asking." |
| Echo Geode | Crush to instantly gain 50 Echoes. | Chests | "A massive cluster of memories. Cash it in before you forget." |
| Whetstone | Buff: your next weapon attack deals 2x damage. | Chests | "A few quick strikes along the blade ensures the next cut will be deep." |

Every Weapon/Accessory/Potion/Consumable also has a **Melt value** — see
Section 8's Menu Inventory tab — for converting an unwanted item to Echoes
instead of it being lost for nothing on loop reset.

### F. Relics
Infinite-stacking, never-equipped passives — a distinct `Item.kind: 'RELIC'`
that is an **instant pickup** (same shape as an Anchor/Time Shard: it never
occupies an inventory slot, adding straight to `run.relics: string[]`
instead). Slay-the-Spire/Hades-style in flavor, but `run.relics` lives on the
reset-each-loop `run` object like every other piece of gear — **Relics ARE
lost on loop reset**, same as weapons/accessories/consumables. Sourced
from: a rare chest-pool entry (Biome 3+), a guaranteed drop on any Elite
kill, or a Cursed Rift's Rift Shop event below. 15 total: Phoenix Feather (revive once on
fatal damage), Giant's Anvil (+5 flat ATK, Dash disabled), Vampire's Cape
(heal on bump-kill), Static Generator (auto-Stun every few steps),
Executioner's Coin, Cartographer's Lens (floor-entry Stairs/Chest distance
callout, since there's no fog-of-war to actually reveal), Troll Blood (slow
passive heal), Gunpowder Flask, Duelist's Glove, Mirror Shield, Hourglass
Shard, Golden Scarab, Echo Magnet (+50% Echoes earned, stacks with Echo
Charm's +20%), Alchemist's Satchel, Time-Eater's Jaw (feed it a Time Shard
for a bonus). A duplicate Relic pickup falls back to Echoes instead of
wasting the reward (`pickRandomUnheldRelic`). Full list and effects:
`src/content.ts`'s `RELICS`. UI: the Relic Tray (Section 8) and the Menu's
Relics tab.

### G. Cursed Rifts — Event Roulette
A rare (12% chance, Floor 3+) coordinate marker per floor (`dungeon.riftX/Y`
— never baked into the `tiles` grid, so it can never land on the one
BFS-guaranteed path tile). Stepping onto it (`movement.ts`'s
`tryRiftInteraction`) immediately rolls one of 6 random events
(`content.ts`'s `rollCursedRiftEvent`, uniform 1-in-6) and clears the Rift
coordinate — the Rift resolves into exactly one of these the instant it's
touched. The result is tracked as `run.cursedRiftEvent` (kind + any
event-specific state) and opens `ui.currentScreen = 'CURSED_RIFT'`, rendered
by `menus.ts`'s `renderCursedRift` (one branch per kind) and resolved by
`cursedRift.ts`. A pulsing purple anomaly aura still bleeds onto the walls/
floor tiles within a 2-tile radius of the Rift's last position while it's
present (`render.ts`), same as before.

1. **The Rift Shop:** offers 3 random unheld Relics (`pickRandomUnheldRelics`), bought in any order at an escalating price *within this one visit* — 1st 50 Echoes, 2nd 150, 3rd 300 (`RIFT_SHOP_PRICES`); the price resets to 50 on the next Rift encountered, since each Rift only ever resolves into one event once. Buying doesn't close the modal — "Leave" does.
2. **The Blood-Infused Anvil:** sacrifices 50% of current HP (floored, HP never drops below 1) for a permanent +2 ATK on the equipped weapon (mutates that `Item` instance directly, so it persists for the rest of the run) — also adds +2 to the weapon's `upgradeBonus` (Section 6C), so the name-suffix UI reflects it. Locked (Accept disabled) if unarmed.
3. **The Frozen Watchwarden:** sacrifices 1 Potion from the inventory for +1 persistent Level on a random currently-active skill below `MAX_SKILL_LEVEL` (3). Locked if there's no Potion to spare or every active skill is already maxed.
4. **The Paradox Mirror:** immediately spawns a "Shadow Warden" (visually a Bone-Knight, purple-auraed, `enemy.isShadowWarden = true`) adjacent to the player, its HP/ATK/DEF/element set to an exact snapshot of the player's own Max HP/`totalAtk`/`totalDef`/equipped-weapon element at that instant. `combat.ts`'s `killEnemy` special-cases `isShadowWarden` to guarantee a Soma Drop + Time Shard instead of the kind's normal loot table.
5. **The Chrono-Lich's Projection:** Accept trades 10 Max HP for a gold chest (`chestLoot: true`) on the Rift's tile holding a guaranteed Late Tier weapon (`rollLateTierWeapon`); Decline spawns 2 awake Bone-Knights adjacent to the player instead.
6. **The Echo Geode:** resolved entirely inside its own modal, not on the map — a "Mine" button awards +15 Echoes per click, up to 5 clicks (`ECHO_GEODE_MAX_TURNS`). On the 3rd and 5th click there's a 50% chance the vibrations draw an ambush (one awake Bone-Grunt adjacent to the player) that ends mining immediately; reaching 5 clicks without one also ends it. Either way the modal closes and mining can't resume — the Rift is spent.

All 6 share `cursedRift.ts`'s `freeAdjacentTiles` helper (checks the 8 neighbors for walkable + unoccupied) for their ambush/spawn placement, and `closeCursedRiftEvent` to leave (`run.cursedRiftEvent = null`, screen back to `GAME`) once resolved.

---

## 7. System Mechanics

### Turn-Based Loop
*   **Player Move Phase:** The player moves or takes an action (attack, skill, wait, use item). Standard Move/Attack costs 1 turn. Skills cost Stamina plus 1 turn. Moving updates `run.facing`.
*   **Brace (Wait):** passing a turn (Space) is not a pure no-op — it grants **+1 DEF** until the start of the player's next turn ("Bracing"). Waiting for an enemy to step into range is a standard grid-roguelike trick; giving it a small defensive payoff makes it read as an active tactical choice instead of "doing nothing." Tracked as a short-lived flag separate from `run.status`, so it can stack with Burn/Stun/Chilled rather than overwriting them.
*   **Inventory actions are context-sensitive:** if NO awake enemy is within a 7-tile taxicab radius, using a Potion and equipping/swapping gear costs **0 turns** (out-of-combat is free). If an aggroed enemy is within that radius, each inventory action costs **1 turn** (mid-combat penalty). The Bone Dagger is always free to swap, even in combat. **Tactical Consumables (Section 6E) are the exception:** they always cost 1 turn to use, in or out of combat, since throwing a flask or popping a grenade is an active combat maneuver rather than a gear swap — unless Alchemist's Belt (Section 6D) is equipped, which makes all item use free.
*   **Enemy Phase:** Enemies wake when the player comes within a 7-tile taxicab radius; once awake they stay awake and act per their Behavior and Speed (Ember-Bats move 2 tiles; Volt-Turrets fire every 2nd turn; Frost-Wraiths ignore walls when pathing). Stunned enemies skip the phase; Chilled enemies act at half speed; Burning enemies take 2 damage at phase start.
*   **Tick Phase:** Environmental hazards update, status durations decrement, turn counter decrements by 1.
*   **Check Phase:** If turns remaining <= 0 or HP <= 0, trigger the Time Loop sequence.

### Combat System
*   **Bumping Combat:** Moving into a tile occupied by an enemy initiates an attack with the equipped weapon (or 2 ATK unarmed).
*   **Damage:** `max(1, (Attacker_ATK - Defender_DEF)) * Elemental_Modifier` (see Section 5). Player Total ATK = 2 (base) + `persistent.baseAtkUpgrade` + weapon ATK; Total DEF = 0 (base, +1 while Braced) + accessory bonuses.
*   **Stamina Regeneration:** +1 Stamina at the end of any turn whose action was not a Skill cast (a Bone Dagger swap, a ranged-weapon bump-attack that spent Stamina, etc. all still regen), up to max.
*   **Execution Refund:** landing the killing blow on an enemy with an Active Skill (Cleave, Flame Arc, Static Shift, etc. — not a plain bump-attack) immediately refunds **1 Stamina**, on top of normal end-of-turn regeneration. Without this, players tend to hoard Stamina purely for a Dash escape and never throw the flashier offensive skills ("hoarding syndrome"); rewarding a skill kill directly counters that and makes aggressive play feel good.
*   **Weakness Exploit:** landing a Weakness hit (2x, Section 5) on a Mini-Boss or the Chrono-Lich refunds **+1 Stamina**, gated by a 3-turn cooldown tracked per boss so it can't be chained every hit.
*   **Tactical Brace:** if the player is Braced (see above) when a Mini-Boss/Final Boss's telegraphed AOE (e.g. Magma Slam, Time-Blast) resolves on their tile, it grants **+2 Stamina** on top of Brace's usual +1 DEF — a reward for reading the telegraph instead of dodging it outright.
*   **Dynamic Loot:** whenever `run.currentHp / run.maxHp` drops below 30%, Potion/Minor Potion entries in a killed regular enemy's drop table count twice in the roll (`rollEnemyDrop` in `content.ts`) — a low-HP player is roughly twice as likely to see a heal drop instead of a weapon.

### Echo Economy (meta-progression)
**Strict economy separation (design rule):** Echoes are ONLY spent on permanent upgrades (Stats & Skills) at the Hub's Upgrade Shop terminal between runs — nothing in-dungeon can be bought with them. Conversely, everything found in the dungeon (weapons, accessories, consumables, Time Shards) serves ONLY the current run and is lost on loop reset. The two economies never mix. This guarantees the player is permanently stronger after every loop, no matter how badly the run went. (The Echo Geode — Section 6E — is the one exception worth noting: it's found in-dungeon but converts directly to Echoes on use, rather than aiding the current run.)

Earning (banked to `persistent.echoes` immediately, kept on death/timeout; Echo Charm adds +20%, and the Echo Magnet relic (Section 6F) adds a further +50%, stacking multiplicatively):
*   **Enemy Bounty**, tied to the floor's **Depth Multiplier** (Section 6C): `round(1 * depthMultiplier(floor))` per normal enemy killed — flat 1 Echo through the early biomes, rising to ~4 by Floor 99. It scales far slower than the Upgrade Shop's own cost curves, so farming shallow floors yields diminishing returns as those costs climb — the economy still rewards diving deeper over grinding Floor 1. +5 per Elite (Time-Weaver, or any regular that rolled an Elite Affix, Section 6C).
*   **+25 Echoes per Mini-Boss defeated**, plus **another +25 Echoes on picking up the Temporal Anchor it drops** — 50 Echoes total per Mini-Boss.
*   **+50 Echoes for killing a [Wealthy] Elite** (25 instead if every Relic is already held — a duplicate-proofing fallback, Section 6F).
*   **+3 Echoes the first time a floor is reached within a loop.**
*   **"Flawless Floor" bonus** for reaching a floor's Stairs without taking any HP damage since arriving on it: `round(7 * depthMultiplier(floor))` Echoes — +7 on early floors, ~13-14 around Floors 41-50, up to +30 by Floor 99. Tracked per floor (a hit on one floor doesn't forfeit the next floor's bonus, and healing back to full afterward doesn't restore a forfeited one). Since players repeat the same memorized layouts every loop, this gives early, already-solved floors a fresh mastery goal instead of becoming rote, and rewards it more as the run gets harder.
*   **Melt** (Section 8's Menu Inventory tab) converts any unwanted item to Echoes on the spot instead of it being lost for nothing on loop reset — a per-item value (`itemMeltValue` in `content.ts`).
*   +25 Echoes on victory, plus 1 per turn remaining on Floor 99.

Spending (in the Upgrade Shop, accessed at the Hub between runs):
*   **Passive stat tracks** — Max HP, Max Stamina, and Turn Bonus (uncapped: 25/50/100/150/200/300/400/500/650/800 for Levels 1-10, then +200/level with no ceiling — a late-game Echo Sink, since these three can theoretically scale forever; Turn Bonus applies to EVERY floor's 100-turn counter) — plus a 4th track, **Base ATK** (+1 ATK/level, mathematically the strongest stat in the game — no longer hard-capped: 50/150/300/600/1200/2000/3000/4500/6000/8000 for Levels 1-10, then +2,000/level with no ceiling, same open-ended shape as the other three tracks).
*   **Skills** — tiered by the skill's placement in the Skill Tree (Section 6B): Tier 1 costs 25/50/100, Tier 2 costs 75/150/300, Tier 3 costs 200/400/800. A skill's Level 1 purchase is also gated by its prerequisite (`isSkillUnlocked` in `shop.ts`) — locked skills render with a lock icon and "Requires: X Lvl N" text instead of a buy price.
*   **One-time gear-slot Upgrades** (`shop.ts`'s `ONE_TIME_UPGRADES`, permanent, not part of the leveled tracks above): **Second Weapon Slot** (800 Echoes) — hold 2 weapons, swap which one is active from the Status tab, only the active one contributes combat stats/passives; **Second Accessory Slot** (600 Echoes) and **Third Accessory Slot** (1,500 Echoes, requires Slot 2) — each additional slot is equipped and active *simultaneously* with the others. In the Upgrade Shop overlay these render as a compact icon grid directly below the Stats grid (same square-slot style, select-then-buy in the shared detail panel) rather than full-width rows, so they don't crowd out the Skills grid below.
*   **Upgrade Shop layout:** the Stats/Upgrades/Skills icon grids sit in one scrollable region; the shared detail panel plus the Continue/New Game buttons below it stay fixed in place and are never scrolled out of view. Selecting a Stat Track shows its current level's actual bonus (e.g. `Lv2 +10 HP`), not just the level number. Selecting a Skill shows the same all-levels bright/dim effect list as the Skill tab (Section 8), updating live the moment it's purchased. The Skills grid is grouped under per-Branch headers (The Striker/Sentinel/Weaver/Chronomancer) instead of one flat list, matching the Skill tab.

A typical run earns roughly 200-600 Echoes; costs above were cut by ~3x from an earlier, far grindier pass (stats topped out a 10-level curve at 2,500/level-equivalent and gear slots ran 1,500-5,000) so meaningful purchases land within a run or two instead of a dozen, while the post-Lv10 stat curve and Tier-3 skills still taper into a genuine long-run Echo Sink at depth.

### Biomes, Temporal Anchors & the Hub

**Biome structure:** the 99 floors are divided into 10-floor Biomes, each with a thematic identity that drives its enemy mix (Section 6C), ambient audio layer (Section 9C), and hand-authored Mini-Boss Arena on its final floor:

| Biome | Floors | Theme                    | Arena Floor / Mini-Boss        |
|-------|--------|--------------------------|--------------------------------|
| 1     | 1-10   | The Crumbling Ramparts (Physical) | F10 — Inferno-Golem   |
| 2     | 11-20  | The Storm Galleries (Volt)        | F20 — Storm-Caller    |
| 3     | 21-30  | The Glacial Undercroft (Frost)    | F30 — Glacial-Knight  |
| 4-9   | 31-90  | Escalating remixes of the three elemental themes (Fire/Volt/Frost cycle), each visually distinguished by a palette-accent shift | F40-F90 — empowered Mini-Boss variants (Section 6C) |
| 10    | 91-99  | The Temporal Well (Chrono)        | F99 — Chrono-Lich (final boss) |

**Temporal Anchors (permanent checkpoints):** each Mini-Boss drops a Temporal Anchor. Collecting it immediately pins that Biome: the NEXT Biome's start floor (11, 21, 31, ...) is appended to `persistent.unlockedAnchors`, permanently, across all future loops of the save. Anchors are meta-progression, not run inventory — they cannot be lost on death.

**The Hub (Watchwarden's Post, "Floor 0"):** a small, hand-authored safe room outside the anomaly where every loop begins and every loop reset returns the player. The turn counter is frozen here; no hazards, statuses, or loss conditions apply. It contains:
*   **The Shop Terminal** (tile type 8): non-walkable — bumping it (like the Tree/Silas/Smuggler, not walking onto it) opens the Upgrade Shop overlay (Echoes -> permanent stats & skills) and leaves the player standing where they bumped from.
*   **The Shortcut Gate** (tile type 5): non-walkable — bumping it opens a destination picker — **Floor 1**, or the start of any anchored Biome (Floor 11, 21, ...). Warping starts a fresh run at that floor with starter gear (Rusty Sword), full HP/Stamina, and a fresh 100-turn counter.
*   **The Eternity Tree** (tile type 12, a fixed corner of the Hub, always present): non-walkable — bumping it opens the same dialogue box as Silas/the Smuggler, its portrait matching the Tree's current growth-stage sprite, showing a growth-stage lore line keyed to `persistent.unlockedAnchors.length` across 4 stages (0-2, 3-5, 6-8, 9+ — full text in `content.ts`'s `ETERNITY_TREE_FLAVOR`). A slow-burn permanence cue — the Tree only ever grows, in lockstep with meta-progression, never resets by a loop.
*   **The Temporal Smuggler** (tile type 13): a Hub encounter, one tile diagonally down-right of the Shortcut Gate, evaluated fresh on every Hub entry (`hub.ts`'s `enterHub`) with a priority spawn rule — **guaranteed (100%)** once `persistent.unlockedAnchors.length > 0` (a resource sink once the player is warping into deep Biomes), otherwise the original 30% chance once `persistent.loopCount > 2`, otherwise absent. When present it sits at its tile; bumping it opens a one-time black-market offer of 3 current-run-only deals paid in Echoes — Smuggled Relic (100, a random unheld Relic), Sharpened Edge (50, instantly reforges the equipped weapon into a random tier-scaled one matching the player's highest unlocked anchor depth), Lifeblood (75, a Max Potion). Buying any one removes the Smuggler from the Hub for the rest of the run; insufficient Echoes or already holding every Relic leaves the offer open rather than charging for nothing.
*   **Silas, the Old Watchwarden:** a wandering, dialogue-only NPC (`dungeon.npc`, `npc.ts`) — not a tile fixture, and not an `Enemy`. He takes at most one step per player action in the Hub (mostly Waits — "he's old"), never onto a fixture or the player's tile. Bumping him costs **0 turns** and opens a small dialogue box centered over the screen (not a full-screen modal — the Hub stays visible behind it), closing instantly on click-anywhere/Space/Esc with no typing animation. His lines come from a 100-entry data-driven pool (`dialogue.ts`): Priority 1 Milestones (10, e.g. first death, each Anchor, Floor 50/99, victory — flagged in `persistent.dialogueSeenIds` so they never repeat), Priority 2 Reactive (30, keyed to `persistent.lastRun`'s death cause/floor/element/status and current loadout — can repeat), Priority 3 Lore (50, always eligible, pure worldbuilding/bestiary flavor), and Priority 4 short dismissal barks (10, shown instead of anything else once `talkedToSilasThisHubVisit > 0` for the rest of that Hub visit). Selection filters to the lowest eligible priority group, then picks randomly within it. The same centered dialogue box (`renderDialogue` in `menus.ts`) is shared with the Eternity Tree — `dialogue.ts`'s `getActiveDialogue()` returns the current speaker's text/name/icon so the box always shows the right portrait.

**Loop Reset (death or floor collapse):** the player loses all items/gear/consumables, keeps Echoes and Anchors, and wakes at the Hub. The strategic choice each loop: restart at Floor 1 to farm easy Echoes and re-gear on known layouts, or warp deep and push the frontier under-geared. Warping deep means facing Depth-Scaled enemies with a starter sword — re-gearing from early drops/chests within the new Biome is part of the intended tension.

### Turn Budget (design guarantee, per floor)
The 100-turn counter is **per floor** and refills on every stairs transition, so the budget question is no longer "can the whole game fit in 100 turns" but "is 100 turns per floor generous enough to explore yet tight enough to pressure":
*   **Generator guarantee:** on every floor, walking distance spawn -> stairs is at most **40 tiles** (verified with BFS at generation time; regenerate with a new derived seed on failure). A beeline is therefore always comfortably affordable.
*   Full-loot clear of a floor (all chests + most enemies) should cost **60-90 turns** — possible, but only barely, so "loot everything vs. bank turns and descend" stays a real decision. Time Shards (+5 turns each) and the Turn Bonus upgrade buy greed back.
*   Mini-Boss Arenas: fights designed to be winnable in 25-40 turns, leaving slack within the arena floor's own 100.
*   A blind first visit to a new Biome is NOT expected to be fully lootable — route knowledge across loops is the point of the time loop.

**Timeout = death:** when a floor's counter hits 0, the floor collapses — the time loop triggers exactly as if the player died (CRT Time-Warp, Section 10), returning them to the Hub.

### Procedural Dungeon Generator
A simple Room and Corridor algorithm is preferred for readability and reliability:
*   Generate N random non-overlapping rectangles within a 32x32 grid. Room count/density may step up slightly with Biome depth for a sense of descent, but stays within the same grid and the 40-tile path guarantee.
*   Connect rooms using L-shaped corridors.
*   Place one Staircase, 1-2 loot chests, and 3-6 enemies per procedural floor. Enemy mix and count follow the Biome table (Sections 6C and 7): deeper Biomes draw from the full roster, over-represent the Biome's element, and lean toward the higher end of the count range. All spawns apply the Depth Scaling multiplier for the current floor.
*   **Chokepoints:** on each floor, deliberately place 1-2 enemies inside 1-tile-wide corridors that lie on the path to the Stairs. The player must fight through (a Time Shard gamble), burn Stamina on a mobility skill (Static Shift/Dash past), or find a longer route around. The BFS path-budget check runs on geometry only — chokepoint enemies do not exempt a floor from the <= 40-tile guarantee.
*   **Determinism:** each floor is generated from `hash(persistent.rngSeed, floorNumber)` — layout, enemy placement, and chest *positions* are identical every loop of a save, so players "learn" the route and plan chokepoint fights around known enemy placement. Only starting a New Game rerolls `rngSeed`. Stairs are one-way down (no backtracking), so floors can be regenerated on entry without persisting mid-run map state. With 99 floors, generation stays lazy: only the current floor is ever materialized.
*   **Dynamic Chest Loot (non-deterministic by design):** a chest's position is deterministic, but its *contents* are rolled fresh every loop from gameplay RNG (`Math.random()`, the same non-deterministic stream as Time Shards — never the seeded generator stream). A chest that held a Bone Dagger last loop might hold an Ice Lance this loop. Without this, a memorized chest's contents become a known quantity the player skips to save turns; randomizing it keeps every chest worth a detour and forces the player's build to adapt run to run, even on a fully-learned map. Chest loot tables use stage-overlapping pools (`CHEST_POOL_B1` F1-20 for Early Stage items, `CHEST_POOL_B2` F21-50 combining Early+Mid Stage items, `CHEST_POOL_B3` F51-99 combining Mid+Late Stage items and excluding Early Stage items) so warp-in players can re-gear appropriately for the local Depth Scaling.
*   **Mini-Boss Arenas (Floors 10, 20, ... 90) and the Floor 99 Boss Arena** are fixed, hand-authored layouts — not procedurally generated. Each Arena's stairs down are sealed behind a Boss Gate (tile type 6) that opens only when the Arena's boss is defeated, making every 10th floor a mandatory wall.
*   **Cursed Rifts** (Section 6G) have a 12% chance to appear on any procedural floor from Floor 3 onward, placed as a coordinate marker rather than a `tiles` grid value specifically so they can never land on the single BFS-guaranteed path tile and falsely flag a floor unreachable.
*   **Random Room Events:** two independent low-probability spawns add spice to procedural floors. **Echo Well** (tile type 10, 20% chance per floor) fully restores HP, Stamina, and clears Status on contact, then reverts to Floor — a mid-run "oasis" against a bad run. **Chrono-Anvil** (tile type 11, 10% chance per floor) destroys the equipped weapon and instantly forges a random depth-scaled weapon (Early Tier F1-20, Mid Tier F21-50, Late Tier F51-99) in its place, then reverts to Floor; with no weapon equipped it just logs a warning and stays put. Loot chests always guarantee safe, positive rewards — there is no chest trap.
*   **Arena Threshold Warning:** taking the stairs INTO an Arena floor (10, 20, ... 90, 99) always triggers a confirmation prompt — *"The temporal density beyond this stair is overwhelming. Something old and hungry guards the descent. Steady yourself — there is no retreat once you cross."* Declining leaves the player on the current floor (with its still-ticking counter) to heal, re-equip, or hunt Time Shards first. Since the turn counter refills to 100 on entry, the warning is really about HP/consumable readiness — and it doubles as a "boss ahead" telegraph so the wall never feels like an ambush. (This replaces the old 4-floor version's Boss Gate Threshold Warning, which keyed off the shared turn counter that no longer exists.)
*   **Victory Flow:** defeating the Chrono-Lich on Floor 99 shows the VICTORY screen with run stats (loops used, deepest-floor history, turns remaining on 99), increments `persistent.stats.wins`, and offers New Game+ (new rngSeed, upgrades kept, Anchors RESET — re-anchoring the fresh dungeon is the NG+ challenge) or a full reset.

---

## 8. User Interface & Controls

**All UI in this section is HTML/CSS overlays layered above the canvas — no UI is drawn on the canvas itself.** The canvas renders only the game world; HTML elements (flex/grid layouts, absolutely positioned over the canvas) handle bars, menus, and text, styled with the amber palette and a monospace/pixel font.

**Mobile portrait layout:** below a 768px viewport width, a vertical flex layout takes over (HUD top -> canvas at a clamped scale -> action log -> a virtual D-Pad + Q/E/R/F button pad in an ABXY-style diamond) with larger fonts, every side-by-side overlay row stacked into a column, and >=44px touch targets. Touch input dispatches the same synthetic keydown events the keyboard listeners consume, so touch and desktop share one input code path (`touchControls.ts`). Mobile-only trims: the keyboard-oriented hint strip and the textual `Q: skill Lv3 ...` HUD row are both hidden (`.hint-strip`/`.hud-row-skills`, display:none under the mobile media query) — redundant once the action-pad buttons show the assigned skill's own sprite icon in place of the bare Q/E/R/F letter. The action-pad's menu row is three direct-access buttons — **STAT**/**INV**/**SKL** — instead of one generic MENU button, each opening the unified Menu straight on that tab (`U`/`I`/`K` respectively; `U` for Status is a new hotkey with no other binding).

### Main Game HUD (Top/Bottom Bars, HTML)
*   **Top Bar:** Current Floor Indicator (`HUB` for Floor 0, `F01` to `F99` for dungeon floors), Turn Counter (large, animated on tick via CSS), HP Bar, Stamina Bar, current Status icon, an **Immunity Tray** (greyed-out, semi-transparent icon per status the player is currently immune to via an equipped accessory, e.g. Ember Pendant -> Burn Immunity — a constant reminder of active immunities rather than something the player has to remember), the **Relic Tray** (horizontally-scrolling tap-for-tooltip icons, one per distinct Relic held — Section 6F). `updateHud` (`hud.ts`) caches DOM element references and dirty-checks state properties before mutating DOM nodes or `.innerHTML` strings, eliminating per-frame DOM updates in `requestAnimationFrame`.
*   **Bottom Bar:** Equipped Weapon info, Active Skills 1-4 (Keys: Q/E/R/F) — each assigned slot shows that skill's sprite icon (not just its name) alongside its level, stamina costs, Action Log (last 3 lines, each hard-capped to one row via `nowrap`/ellipsis truncation — a long line is clipped rather than wrapping, which on the mobile static-flow layout would otherwise grow the log and push the D-Pad/skill buttons down). An **Elite Warning banner** pulses here whenever an awake Elite (Section 6C) is within 3 tiles.

### The Menu (`ui.currentScreen = 'MENU'`) — a unified tabbed overlay
Rather than a separate screen per function, Inventory, Skills, Relics, Bestiary, and Settings/Help are all **tabs of one overlay** (`menuTab: 'status' | 'inventory' | 'relics' | 'skill' | 'bestiary' | 'settings'`). Opening any tab's hotkey while the Menu is already showing that same tab closes the Menu back to GAME (toggle behavior); opening a different tab's hotkey switches tabs without closing.

*   **Status tab (default tab on open):** live HP/Stamina/Turns, Total ATK/DEF, current Status, and the equip slots — Weapon (plus a benched Weapon Slot 2 + a Swap Active Weapon button, once unlocked, Section 7), and Accessory Slots 1-3 (2 and 3 shown once unlocked; all equipped accessories are active simultaneously).
*   **Inventory tab (Key: `I` or `Tab`):** 5x5 tile-icon grid for inventory (25 slots, scrollable) — each slot shows the item's own sprite (Section 4's per-item icons), not its name as text. Potions/Consumables of the same name stack into one slot (a small `xN` count badge) instead of one slot per unit. Melting or using an item that empties its slot keeps the selection on whatever shifted into that slot instead of dropping back to "nothing selected."
*   **Item Stat Block (required):** when an item is selected or hovered, the detail panel MUST show a clean, machine-readable **Stat Block line ABOVE the lore/flavor text**, so tactical decisions never require parsing prose. Format: pipe-separated `LABEL: value` pairs in a fixed order — stats first, element, then effects. Examples:
    *   Weapon: `ATK: 5 | Element: Fire | Effect: 25% Burn`
    *   Accessory: `DEF: +2` or `Effect: Immune to Stun`
    *   Consumable: `Heals: 10 HP | Cost: 0-1 Turns` / `Range: 3 | AOE: 3x3 Stun`
    *   Time Shard: `Turns: +5 (current floor)`
    The Stat Block is visually distinct from the lore (e.g., bright-amber monospace on its own line, lore in muted midtone below). For weapons, append a comparison marker against the active weapon where applicable (e.g., `ATK: 5 (▲ +2)`); Accessories show flat values without a comparison marker, since up to 3 can be equipped at once (Section 6D) and "the" equipped accessory is no longer a single, unambiguous baseline to diff against.
*   **Use:** opening/browsing the menu is always free. Using a Potion or swapping equipment costs **0 turns out of combat** and **1 turn while an awake enemy is within 7 tiles** (see Section 7; Bone Dagger always free). Tactical Consumables (Section 6E) are always **1 turn**, in or out of combat, unless Alchemist's Belt is equipped. The overlay shows a "DANGER — actions cost 1 turn" banner when the context-sensitive penalty is active. Weapon items also get a **Stash (Slot 2)** button once the Second Weapon Slot is unlocked, benching the weapon without disturbing the active one.
*   **Melt:** the selected slot's other action, alongside Use — converts the item to Echoes instead of discarding it for nothing. The button shows the exact payout (`Melt (+N)`) before committing; every item kind has a melt value (Weapons scale off ATK, everything else is hand-tuned per item in `content.ts`). Same context-sensitive turn cost as an equip/unequip swap; a stacked item pays out per unit.
*   On mobile/touch, a slot is tap-to-select (not instant-trigger) — the detail panel above with its Use/Melt buttons is how every action fires, since a stray tap on a crowded touch grid shouldn't cost gear or a consumable.

*   **Relics tab:** a grid of every Relic currently held this run (Section 6F), with a detail panel on selection — a fuller counterpart to the HUD's always-visible Relic Tray.
*   **Skill tab (Key: `K`, or `U` for the same Menu opened on Status):** lists every skill in the Skill Tree (Section 6B), grouped under Branch headers (The Striker/Sentinel/Weaver/Chronomancer), with unlocked ones showing level and stamina cost. Player assigns any unlocked skill to Slots 1-4 (Q/E/R/F). Free — costs no turn. The loadout persists across loop resets (`persistent.skillLoadout`). The detail panel lists **all 3 levels' effect lines together** (not just the current level's) — levels already obtained render bright/bold, levels not yet purchased render dim, so the full upgrade path is visible before spending Echoes on it. A still-locked skill's panel shows its prerequisite instead (e.g. "Requires: Cleave Lvl 1"). Same split layout as the Upgrade Shop's Skills section (below): the Branch grid scrolls in its own region while the detail panel stays fixed underneath, instead of being buried at the bottom of the full skill list.
*   **Bestiary tab:** every `EnemyKind` encountered this save (`persistent.bestiaryKnown`, Section 6C) with its stat block and lore on selection.
*   **Settings tab (Key: `?` or `F1`):** Master Mute toggle and Volume +/- controls (also bound globally to `M` / `[` / `]`, Section 9), plus an independent **Mute Music**/**BGM Volume** +/- row (mouse-only, no keybind) that scales only the music bus — muting BGM leaves SFX untouched and vice versa. Both pairs persist to the same audio-settings `localStorage` key. Then a **Developer Tools** panel (testing-only, visually set off from the rest of the tab), and the full controls list — this tab **is** the Help screen; there is no separate `HELP` value in `ui.currentScreen`. Developer Tools: a floor-number input (1-99) + **Warp** button that jumps straight to that floor via the normal stairs-transition logic (refuses to fire during The Shattering, Section 1 — use Force Death to end it instead); a **+1000 Echoes** button; a **Force Death (Reset/Skip)** button that zeroes HP and runs it through the normal turn-resolution/Check Phase (so it correctly triggers The Shattering's scripted loss too, Section 1); and the **Cheat Mode** toggle (`persistent.cheatModeEnabled`) — locks HP *and* Stamina to max every turn while on.

### Skill Targeting Logic
*   **Directional skills automatically target `run.facing` — the last direction the player moved.** No separate aiming step: press Q/E/R/F and the skill fires that way (Cleave hits the 3 tiles ahead, Static Shift teleports along facing, ranged weapons like Ice Lance fire their line along facing).
*   The player sprite must show LEFT/RIGHT facing by mirroring the spritesheet tile at draw time (`ctx.scale(-1, 1)`, Section 4). UP/DOWN reuse the base tile — the persistent facing cue for vertical aim is the HUD/skill-targeting affordance rather than a distinct sprite variant.
*   Self/adjacent skills (Flame Arc, Ice Aegis) ignore facing.
*   Skill casts and ranged attacks show color-coded on-screen feedback (particle bursts and beams, colored by element) — the same primitives Mini-Boss telegraphs (Chain Bolt, Magma Slam) reuse.

### The Hub's Shortcut Gate & Cursed Rift (world-triggered overlays)
*   **Shortcut Gate destination picker** (`ui.currentScreen = 'SHORTCUT_GATE'`): opened by interacting with the Hub's Shortcut Gate tile. Lists Floor 1 plus every anchored Biome start, sorted; picking one warps immediately (Section 7).
*   **Cursed Rift modal** (`ui.currentScreen = 'CURSED_RIFT'`): opened by stepping onto a procedural floor's Cursed Rift tile, which immediately rolls one of 6 random events (Section 6G) and renders that event's own modal — an escalating-price shop, an accept/decline bargain, a guaranteed-drop ambush fight, or a self-contained mining loop.

### Quick Controls Help
*   **Persistent hint strip:** one line in the HUD bottom bar shows the keys most relevant to the current screen, so a new player never has to leave the game to look something up — e.g. on GAME: `WASD Move · Space Brace · Q/E/R/F Skill · I Inv · K Skills · ? Help`; on the Menu's Inventory tab: `Tap an item, then Use or Melt · I/Esc Close`.
*   **Settings tab as Help (Key: `?` or `F1`):** opens the Menu directly on its Settings tab, which lists every control below in one place. Always reachable, including from TITLE. Free — costs no turn. Toggle closed with the same key or Esc.

| Key | Action | Available on |
|-----|--------|--------------|
| `W`/`A`/`S`/`D` or Arrows | Move / bump-attack (sets facing) | GAME |
| `Space` | Brace / pass turn (+1 DEF until your next turn, see Section 7) | GAME |
| `Q` / `E` / `R` / `F` | Use the mapped skill toward facing | GAME |
| `U` | Open Menu on its Status tab, or close if already there | GAME, MENU |
| `I` / `Tab` | Open Menu on its Inventory tab, or close if already there | GAME, MENU |
| `K` | Open Menu on its Skill tab, or close if already there | GAME, MENU |
| `?` / `F1` | Open Menu on its Settings tab (Help), or close if already there | any screen |
| `M` | Toggle mute | any screen |
| `[` / `]` | Volume down / up by 10% | any screen |
| `Esc` | Close the current overlay | MENU, UPGRADE_SHOP, SHORTCUT_GATE, CURSED_RIFT, CONFIRM |
| Click / Tap | Equip/use/melt an item, switch tabs, assign a skill, buy an upgrade, pick a Shortcut Gate destination, answer a Cursed Rift or Confirm prompt | MENU, UPGRADE_SHOP, SHORTCUT_GATE, CURSED_RIFT, CONFIRM |

---

## 9. Audio Design

SFX are synthesized procedurally via the Web Audio API (Section 2) — no external sound files, matching the sprite engine's "generate everything" philosophy. Sounds are short and chiptune-style (square/triangle/noise oscillators with a fast envelope), consistent with the amber-CRT retro aesthetic.

BGM is the one exception: `audio.ts` loads six pre-rendered `.ogg` loops from `audio/` (`biome1`-`biome4`, `boss`, `final_boss`) via `fetch` + `decodeAudioData` into an `AudioBufferSourceNode`-backed player, imported like the spritesheet asset rather than served from a `public/` folder. One track plays at a time through a shared `musicFilter` (lowpass) -> `musicGain` -> `master` bus; switching tracks stops the old `AudioBufferSourceNode` and starts a new looping one (a no-op if the requested track is already playing). `playbackRate` and the lowpass cutoff are mutated live per game state rather than swapping files: TITLE/Hub plays `biome1` slowed to 0.7x through an 800Hz filter (calm); Biomes 1-4 play their own track at 1.0x/20000Hz (transparent); Biomes 5-9 cycle `biome2`-`biome4` at a heavier 0.85x/3000Hz; Biome 10 settles on `biome4` at a demonic 0.6x/2000Hz; Mini-Boss Arenas play `boss` at 1.0x plus +0.05x per empowered repeat (Section 6C); Floor 99 plays `final_boss` at 1.0x. A tense override (any procedural floor once `turnsRemaining < 20`) snaps to 1.3x/20000Hz regardless of Biome. The Menu's Tactical Muffling override always ducks the filter to 500Hz on top of whichever track is playing.

### A. Action SFX
| Trigger | Sound | Notes |
|---|---|---|
| Move (successful step) | Soft single-tick footstep | Kept very quiet — it repeats up to ~100 times a run |
| Move blocked (wall/gate) | Dull "thud" | Distinct from a successful step |
| Bump-attack (player hits enemy) | Weapon-element clang/whoosh/zap/crackle/chime (Physical/Fire/Volt/Frost/Chrono) | One sound per element, reused across every weapon of that element |
| Bump-attack (enemy hits player) | Short impact thump + a player damage grunt | |
| Weakness hit (2x, Section 5) | Attack sound layered with a bright "crit" chime | Rewards exploiting the Elemental Wheel without needing to read the log |
| Resist hit (0.5x, Section 5) | Attack sound, dulled/muffled | Signals "wrong element" |
| Pickup (weapon/accessory/consumable) | Ascending 2-note chime | |
| Pickup (Time Shard) | Distinct sparkling/reversed chime | Must read as different from normal loot — it's the turn-refund gamble payoff (Section 6C) |
| Pickup (Temporal Anchor) | Triumphant 3-note fanfare | Bigger progression beat, rarer |
| Pickup (Relic) | Distinct chime, tonally different from a weapon/accessory pickup | Instant pickup — never occupies a slot (Section 6F) |
| Equip weapon/accessory | Mechanical "clunk" | |
| Unequip | Reverse of the equip clunk | |
| Use Potion / consumable | Glass-clink + rising heal tone (Potions), or an effect-specific sound for Tactical Consumables (fire whoosh for the Flask, electric pop for the Grenade, etc.) | |
| Skill cast — Dash | Quick whoosh | |
| Skill cast — Cleave | Slash + impact | |
| Skill cast — Flame Arc | Fire whump | |
| Skill cast — Static Shift | Electric zap + teleport blip | |
| Skill cast — Ice Aegis | Crystalline shield chime | |
| Enemy death | `playEnemyDeathSfx(element)`, one cue per Element rather than per-kind: Physical a sharp white-noise burst (bone shatter), Fire a slow brown-noise fade (extinguishing flame), Volt a sawtooth pitch-drop sweep 1000Hz->100Hz (power-down), Frost a 1200Hz triangle with fast amplitude-modulated tremolo (ice shatter), Chrono a sine pitch-up sweep 200Hz->800Hz (temporal pop) | Called from `killEnemy` (`combat.ts`), alongside the existing particle burst/death-fade (Section 10) |

### B. Status Effect SFX
| Status | Sound | Notes |
|---|---|---|
| Burn applied | Ignite crackle | |
| Burn tick (each turn, Section 5) | Soft crackle, quieter than the ignite | Plays up to 3x — must not fatigue |
| Stun applied | Short "dazed" star-ding | |
| Chilled applied | Descending icy tinkle | |
| Status expires | Very soft neutral blip | Optional — skip if it clutters the mix |

### C. Screens & Music
| Screen / Moment | Music / SFX | Notes |
|---|---|---|
| TITLE | `biome1.ogg` slowed to 0.7x, 800Hz filter | Sets the "trapped in a dying timeline" tone |
| Hub (Floor 0, Watchwarden's Post) | Same calm `biome1` mix as TITLE | The one place the Anxiety Clock never plays |
| GAME, procedural floors | `biome1`-`biome4.ogg` looped, cycling for Biomes 5-10 at a heavier rate/filter (Section 9 intro) | Snaps to a tense 1.3x/20000Hz mix once `turnsRemaining` drops below 20 |
| Mini-Boss Arenas (F10-F90) | `boss.ogg`, `playbackRate` +0.05x per empowered repeat (Section 6C) | Shared across arenas |
| Floor 99 (Chrono-Lich Arena) | `final_boss.ogg`, highest intensity | |
| Temporal Anchor pickup (Mini-Boss kill) | Extended triumphant fanfare + a deep "anchor slam" hit | The biggest progression beat in the game — must outclass the normal Anchor chime |
| Menu open/close & interactive overlays | Generic UI SFX layer: `playHoverSound()` (20ms 800Hz sine) on hovering any `[data-action]` button, `playSelectSound()` (100ms square, 400->600Hz sweep) on tab switches/selection/close/confirm clicks, `playErrorSound()` (150ms 150Hz sawtooth) on hovering a disabled button. Music behavior: opening any overlay (`MENU`, `UPGRADE_SHOP`, `SHORTCUT_GATE`, `CURSED_RIFT`, `SMUGGLER`, `CONFIRM`, `DIALOGUE`) maintains background music playback for the current floor while applying the Tactical Muffling low-pass filter (500Hz, Section 10); returning to `GAME` seamlessly lifts the filter back to full frequency | |
| DEATH | Descending "failure" stinger, then silence, under the CRT Time-Warp visual (Section 10) | Followed by the loop-reset rewind cue (Section 9D) |
| VICTORY | Full fanfare + stat-reveal chimes | |

### D. Progression SFX
| Trigger | Sound | Notes |
|---|---|---|
| Turn tick / low-turns warning | Superseded by the Anxiety Clock's continuous 3-threshold tempo/pitch curve — see Section 10 | Formerly two separate flat rules; kept as one entry to avoid contradicting Section 10 |
| Low HP (< 25%) | Deep bass "thump-thump" heartbeat loop | See Section 10's Low-Health Bass Heartbeat |
| Loop reset (death or timeout) | "Rewind" whoosh — literally reverse-played tick sounds | Reinforces the time-loop framing (Section 1) |
| Echoes earned | Small coin/crystal chime, pitch scaling slightly with amount | |
| Melt an item | `playMeltSound()` — a fast descending triangle arpeggio (800->600->400Hz) layered with a brief high-pass-filtered noise burst, reading as a crystalline shatter rather than the Upgrade Shop's confirm chime | Followed immediately by the normal Echoes-earned chime for the payout |
| Upgrade Shop purchase | Confirm chime + stat-specific flourish | |
| Skill unlock/upgrade | Distinct "power up" arpeggio | |
| New Biome anchored (Shortcut Gate destination unlocked) | Mechanical unlock + door groan | Once per Biome per save (Section 7) |
| Shortcut Gate warp (Hub) | Temporal whoosh + arrival chime | Distinct from the loop-reset rewind — this one is empowering |
| Boss telegraph (Time-Blast warning) | Rising warning tone on the marked tiles | Must read clearly across the full 2-turn warning (Section 6C) |
| New Game+ | Reset chime distinct from a loss-reset | Signals an intentional fresh start, not a failure |

---

## 10. Game Feel & Juice

Feedback layered on top of state that already changes correctly — none of it changes any rule, number, or outcome from Sections 3-7. All eight mechanics fit the Section 2 engine split (Canvas = game-world, HTML/CSS = UI, Web Audio = all sound), with one exception: Hit-Stop needed the turn engine's first genuine async pause.

### Visual Juice

#### 1. Hit-Stop & Screen Shake ("The Crunch")
Landing a Weakness hit (2x, Section 5) or a killing blow freezes the game for 100ms, then the view shakes up to 3px for 0.2s — fighting-game weight/impact feedback.
*   **Implemented as:** Screen Shake is a CSS random-jitter `translate` on `#game` only (HUD stays readable mid-shake). Hit-Stop made `resolvePlayerTurn` (`turnController.ts`) `async`, awaiting the freeze before the Enemy Phase — the engine's first async turn-resolution step — with an `isTurnBusy()` gate locking input in `movement.ts`/`skills.ts` for that window.

#### 2. Floating Combat Text
Damage numbers and short strings (`CRIT!`, `IMMUNE`, `+2 TURNS`) spawn over a sprite's head and float up/fade.
*   **Implemented as:** drawn on the canvas, not HTML (camera-relative, per-sprite — the "particles" carve-out from Section 2), via a hand-authored 3x5 pixel glyph font (`fillRect`, not `ctx.fillText`, to avoid antialiasing against the crisp-pixel guarantee). Spawn hooks (`notifyFloatingText`) sit alongside `animation.ts`'s existing `notifyAttack`/`notifyDeath`, called from `combat.ts` and `inventory.ts` (Time Shard's `+2 TURNS`).

#### 3. The "CRT Time-Warp" Death Transition
On death/timeout, the canvas inverts, squeezes horizontally like an old CRT powering off, then fades to black before DEATH appears — reinforcing the time-loop framing (Section 1) over a plain "Game Over."
*   **Implemented as:** pure CSS on the `#game` element, toggled by `turnController.ts`'s `triggerLossReset`: a `@keyframes` sequence (`filter: invert(1)` -> `transform: scaleX(0)` -> `opacity: 0`). `#hud-top`/`#hud-bottom` fade out in the same first beat. Plays alongside, not instead of, the per-enemy death-fade animation.

#### 4. 1-Bit Pixel Particles & Beams
On enemy death, 10-15 fading 1-2px squares scatter outward instead of the sprite just vanishing. Every skill cast spawns the same burst, colored by element, at its actual affected tiles; ranged attacks (Volt-Turret's line shot, and the Mini-Bosses' Chain Bolt/Magma Slam) draw a matching fading beam/AOE flash instead of reusing the melee lunge animation.
*   **Implemented as:** a pooled particle array (`{x, y, vx, vy, life, color}`) drawn via `fillRect`, spawned from `combat.ts`'s `killEnemy` and every skill caster; a parallel short-lived `beams` list (`notifyBeam`/`getBeams`) draws a fading line between two tiles. Both reuse the existing palette plus a small set of element accents (`COLOR_FIRE`/`COLOR_VOLT`/`COLOR_FROST`/`COLOR_CHRONO`) rather than per-element motion shapes (e.g. distinct "zigzag" paths) — that's a possible future refinement, not what's shipped.

#### 5. Title Screen: Sprite Wordmark, Reverse Time-Dust & Patrolling Player
While `ui.currentScreen === 'TITLE'`, the canvas swaps the Hub render for a standalone, fully canvas-drawn title screen: a "CHRONO KEEP" wordmark stamped one glyph-sprite per character, amber dust motes drifting upward against the dark background, and the player sprite pacing back and forth through the gap between the two words with a walk-hop and direction-flip. The HTML overlay (progress stats, Continue/New Game) sits transparent on top, letting all of it show through.
*   **Implemented as:** `render.ts`'s `renderWorld` short-circuits to `renderTitleScreen` on the TITLE screen, skipping world/entity rendering entirely for perf. A module-local dust-mote array reuses `COLOR_LIGHT`/`COLOR_MID`, drifting upward with sine horizontal wobble and wrapping from top back to the bottom. `TITLE_ASCII` (a 17-row `$`-banner-style string array) is stamped one sprite cell per non-space character; a module-local `titlePlayerX`/`titlePlayerDir` pair drives the player sprite back and forth through the blank gap row, with a `sin`-based hop and an `x`-flip at each turnaround. Every measurement (glyph cell size, wordmark start position, patrol bounds/speed/size) is authored against the 480x320 desktop canvas and scaled by `min(viewW/480, viewH/320)`, so the mobile 320x240 canvas gets a shrunk-but-proportional version instead of clipping. `menus.ts`'s `renderTitle` dropped its redundant HTML `<h1>Chrono-Keep</h1>` (the canvas wordmark replaces it); `#screen-overlay` gets a `title-open` class (toggled alongside `active`/`dialogue-open`) that keeps its background transparent instead of the usual opaque fill, and `.title-menu`'s content is pushed below the canvas art via a `::before` flex spacer (52% of the overlay's height on desktop). `hud.ts` hides `#hud-top`/`#hud-bottom`/`#touch-controls` while TITLE is active so the gameplay HUD and mobile d-pad don't bleed through the now-transparent overlay. On mobile, since `#screen-overlay` normally spans the full `#app` column (not just `#game`'s letterboxed box), the `title-open` overlay is instead pulled out of absolute positioning into the same static/`order`-based flex flow as `#hud-top`/`#hud-bottom`, landing right after the canvas — the desktop `::before` spacer is zeroed out there since it's no longer needed.

### Audio Juice

#### 1. The "Anxiety Clock" (Dynamic Tempo)
A background tick speeds up and rises in pitch as `turnsRemaining` drops through 20/10/5 — a visibly-accelerating clock as an adrenaline hook.
*   **Implemented as:** a Web Audio lookahead scheduler (`setInterval` polling ~25ms ahead of `AudioContext.currentTime`) that samples `run.turnsRemaining` each pass to pick the next tick's interval/pitch/volume. Supersedes Section 9D's separate "Turn tick"/"Low-turns warning" rows with one continuous three-threshold system.
*   **Sidechain Ducking:** the tick routes through its own gain node (`tickDuckGain`); any combat SFX (attacks, hits, skill casts) ducks it to 20% for a fast 30ms attack, then releases back to full over ~300ms. Keeps the tick felt as a low heartbeat under the action instead of piercing through it and causing auditory fatigue.

#### 2. Tactical Muffling (Low-Pass Filter)
Opening the unified Menu (Section 8) applies an underwater low-pass filter to the music; closing it lifts it — an audible gear-shift from "hectic survival" to "tactical planning."
*   **Implemented as:** one `BiquadFilterNode` permanently patched into the music chain, its cutoff ramped between ~20kHz (transparent) and ~500-800Hz (muffled) over ~200ms via `AudioParam.linearRampToValueAtTime` on `ui.currentScreen` transitions.

#### 3. The "Level-Up" Power Chord
Buying an Upgrade Shop purchase (Section 7) plays a short, rising, arpeggiated chord — the one reward signal that's never lost on a loop reset.
*   **Implemented as:** 3-4 oscillators at a power-chord interval stack, staggered ~40-60ms with a shared upward frequency ramp.

#### 4. Low-Health Bass Heartbeat
Below 25% HP, a slow bass thump joins the mix and the screen's corners pulse with a dark vignette — a visceral, wordless reminder of mortality.
*   **Implemented as:** a low sine oscillator (~55-80Hz) with a two-pulse envelope, looping only while `run.currentHp / run.maxHp < 0.25`. The vignette is a `pointer-events: none` overlay div (same family as `#hud-top`/`#hud-bottom`) with a `radial-gradient`, toggled to a pulsing-opacity CSS animation by the same threshold.

