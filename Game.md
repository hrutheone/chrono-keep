# Chrono-Keep: The 100-Turn Descent (Specification & Planning Document)

## 1. Project Overview
`Chrono-Keep` is a turn-based, grid-based roguelite descent RPG rendered on a HTML5 Canvas with retro pixel art and an amber-CRT-styled HTML UI.

*   **Core Loop:** Descend a 99-floor dungeon. The player has exactly 100 turns per floor to explore, loot, fight, and reach the stairs down.
*   **Time Loop Mechanic:** When turns hit 0 or player dies, they return to the Hub (Floor 0). Inventory/weapons are lost. Echoes (currency) and Temporal Anchors (checkpoints) are retained. From the Hub, players start at F1 or warp to anchored Biomes. Floor layouts are identical across loops within a save.
*   **Biome Structure:** 99 floors divided into 10-floor Biomes. Every 10th floor is a Mini-Boss Arena that drops a Temporal Anchor.

### Narrative Framing: The "Why"
**The Fall of Oakhaven:** The Chrono-Keep was not always a prison; it was once the Grand Conservatory of Oakhaven. Decades ago, as a mysterious plague threatened to wipe out the kingdom, the brilliant Court Wizard made a desperate choice. To save his people, he attempted to freeze Oakhaven at the exact moment before its ruin using the kingdom's most sacred artifact: the Hourglass of Eternity. But mortal hands were never meant to halt the river of time. The ritual violently backfired, mutating him into the mad Chrono-Lich and shattering the Keep downward into the earth.

**The Temporal Anomaly (The 100-Turn Limit):** The Keep did not physically collapse; it fractured into 99 stacked strata of broken time. Time inside the Keep is entirely frozen. When a living, breathing entity steps onto a floor, the timeline attempts to resume — but the shattered reality can only sustain exactly 100 seconds (turns) of linear time before the paradox reaches critical mass. When the clock hits zero, the floor violently collapses, expelling the intruder back to the surface to preserve itself.

**The Protagonist (The Last Watchwarden):** You are the Last Watchwarden. When the Hourglass shattered, your proximity to the epicenter locked you in a cruel, unending loop. You are cursed with lucidity: you remember every death, every failure, and every reset. The monsters wandering the halls — the Bone-Grunts and Frost-Wraiths — are your former comrades and the citizens of Oakhaven, trapped in a mindless state of decay because they forgot their purpose across a thousand loops. Your duty is no longer to guard the Keep, but to grant it the mercy of a final death. You must descend the 99 floors, wrest the Temporal Anchors from the Lich's corrupted wardens, and stitch reality back together just enough to reach the bottom and end the Lich's reign.

**The Currencies of Time:**
*   **Echoes**: Crystallized memories of your past deaths. By absorbing them, you refuse to let your past failures be in vain, using your own trauma to permanently strengthen your body and mind.
*   **Time Shards**: Splintered seconds dropped by enemies. By taking a life, you steal their remaining moments, buying yourself a few extra heartbeats against the collapsing floor.
*   **Temporal Anchors**: Surviving heavy pivot-stones of the original Hourglass. Driving them into the rift at the Hub physically pins a section of the Keep to reality, creating a permanent safe haven.

### "The Shattering" (Loop 0)
Loop 0 drops players into Floor 99 against the Chrono-Lich with an endgame loadout. This is a scripted loss: when the boss hits <=25% HP or player HP hits 0, the timeline collapses. The player awakens in the Hub with the Rusty Sword, resetting all progression and starting Loop 1.

---

## 2. Technical Stack
*   **Language:** TypeScript / JavaScript (ES6+).
*   **Rendering:** HTML5 Canvas for game world, HTML/CSS for UI overlays.
*   **Storage:** `localStorage` for permanent upgrades, live run snapshot, and audio settings.
*   **Audio:** Web Audio API (procedural SFX, pre-rendered BGM loops).

---

## 3. Game State Schema (Overview)
*See `src/types.ts` for actual field names.*
*   **Element:** `PHYSICAL` | `FIRE` | `VOLT` | `FROST` | `CHRONO`
*   **StatusEffect:** `NONE` | `BURN` | `STUN` | `CHILLED`
*   **Persistent:** RNG seed, loop count, echoes, upgrades, skill unlock/loadout, anchors, bestiary.
*   **Run:** HP, stamina, turns remaining, current floor, coordinates, inventory, active equipment/skills, current statuses, charges.
*   **Dungeon:** Map dimensions, tiles, enemies, items, spawn/stairs coordinates, hazards.
*   **UI:** Current screen state, action log.

---

## 4. Pixel Art Rendering Engine
*   **Spritesheet:** Full-color 16x16 pixel art (`assets/new-spritesheet.png`).
*   **Scale & Camera:** Crisp integer scaling, smooth camera tracking.
*   **Wall Autotiling:** dynamically calculates wall sprite connections based on neighbors.
*   **Biome Themes:** Floor tiles and walls get ambient tints and random scatter based on biome depth to differentiate regions without unique assets per biome.

---

## 5. Elements & Status Effects System
**Elemental Wheel:** Fire beats Frost -> Frost beats Volt -> Volt beats Physical -> Physical beats Fire. Chrono is neutral.
*   **Weakness (2x DMG):** Attacking down the wheel.
*   **Resist (0.5x DMG):** Attacking up the wheel.
*   **Status Effects:** 
    *   **Burn (Fire):** 2 DMG per turn (3 turns).
    *   **Stun (Volt):** Skips next turn (1 turn).
    *   **Chilled (Frost):** Movement requires 2 turns (3 turns).

---

## 6. Detailed Game Content Lists

### A. Weapons
Weapons are categorized in overlapping drop pools (Early, Mid, Late stages).

| Weapon Name | Base ATK | Element | Special Effect / Passive | Drop Source | Lore / Flavor Text |
|-------------|----------|---------|---------------------------|--------------|---------------------|
| Laevateinn  | 9        | Fire    | 2x damage vs a Burning target. | Late Tier pool | "The legendary fire sword that reduces everything to ash. It burns hottest when the fuel is already lit." |
| Vajra       | 9        | Volt    | Ranged 1-2, pierces the tile behind the target, and guarantees a Stun on hit. | Late Tier pool | "A spear of mythic thunder. It never misses, and its strike freezes the nervous system." |
| Niflheim    | 9        | Frost   | Instantly executes a Chilled enemy at or below 25% HP. | Late Tier pool | "A axe colder than the void. It does not cut; it simply shatters what is already frozen." |
| Rusty Sword  | 3        | Physical | None (Starter weapon).                            | Starter | "Your service weapon from a timeline long forgotten. It remembers the taste of blood, but its edge has dulled across a thousand failed resets." |
| Bone Dagger  | 2        | Physical | Free to equip/swap even mid-combat.               | Chests (Early)  | "Carved from the femur of a fallen Watchwarden. It demands so little weight to wield, you can draw it between the ticks of a clock." |
| Flametongue  | 3        | Fire     | Attacking removes Chilled from yourself.          | Ember-Bat          | "A campfire given an edge. It never quite stops smoldering." |
| Mage Masher  | 3        | Volt     | 10% chance on hit to restore 1 Stamina.           | Volt-Turret        | "A duelist's parrying blade, repurposed. It hums faintly, siphoning static off every failed guard." |
| Ice Lance    | 4        | Frost    | Ranged attack, pierces 2 tiles in a line.         | Frost-Wraith       | "A shard of the Undercroft, sharpened. It skewers straight through whatever stands in its way." |
| Thunder Rod  | 4        | Volt     | On hit: also strikes both tiles flanking the target. | Chests (Early/Mid) | "A lightning rod bent into a weapon. The charge always finds more than one target." |
| Assassin's Dagger | 5  | Chrono   | Knocks the enemy back 2 tiles and randomly reassigns their element. | Time-Weaver (Elite) | "It bends reality upon impact. You never quite know what you'll leave behind." |
| Coral Sword  | 5        | Volt     | On hit: pulls the enemy 1 tile closer; 25% chance to Stun. | Volt-Hound  | "Grown, not forged, in a flooded sub-level that used to be a power station." |
| Dark Knight's Blade | 8 | Physical | Blood Magic: you take 2 HP damage per swing.      | Bone-Knight        | "It cuts deeper than any living wrist could bear to swing it." |
| Diamond Mace | 5        | Frost    | Deals 2x damage to Chilled enemies.               | Frost-Sentinel     | "Faceted ice that never melts. It shatters what the cold has already made brittle." |
| Save the Queen | 6      | Frost    | Negates the first hit taken on each floor.        | Frost-Sentinel     | "A ceremonial blade, repurposed for a war it wasn't built for. It still remembers how to shield someone." |
| Ifrit's Blade | 6       | Fire     | Cleaves the 3 tiles in front on every attack.     | Inferno-Golem | "A shard of the Undercroft's opposite — a sliver of something that never stopped burning." |
| Blitz Whip   | 6        | Volt     | On hit: lightning chains to 1 additional nearby enemy. | Storm-Caller | "Live current, coiled. It never stops looking for a second target." |
| Ice Brand    | 6        | Frost    | On kill: spreads Chilled to nearby enemies.       | Glacial-Knight | "A killing blow with this blade leaves the cold looking for somewhere else to go." |
| Excalibur    | 8        | Physical | Ignores 50% of the target's DEF.                  | Chests (Mid/Late)  | "A relic from a story that didn't happen here — armor simply forgets to matter around it." |
| Masamune     | 10       | Chrono   | Kills refund 3 Turns to the turn counter.         | Chests (Mid/Late)  | "A legendary blade... Mythic-tier — it steals back a real handful of moments with every kill." |

### B. Skills
Costs Stamina. Up to 4 equipped at a time (Q/E/R/F). Evolve through 3 levels.
*   **The Striker:** Dash, Bash, Mug, Grapple, Static Shift, Omnislash, Vanish. (Focus: Mobility, Assassination)
*   **The Sentinel:** Cleave, Ice Aegis, Provoke, Reflect Barrier, Chakra, Fortify, Aura. (Focus: Defense, Survival)
*   **The Weaver:** Flame Arc, Defuse, Blizzard Wave, Slow, Chain Lightning, Meteor. (Focus: Area Control, Magic)
*   **The Chronomancer:** Recall, Haste, Time-Stop, Paradox, Ultima. (Focus: Time Manipulation)

### C. Monsters
Stats scale with floor depth (+8% every 5 floors). Elites and Mini-bosses do not scale as their floors are fixed.

| Monster              | Element | Behavior / Lore |
|----------------------|---------|-----------------|
| **Bone-Grunt**       | Phys    | Chases player. "Once your comrades-in-arms, now trapped in a cycle of endless decay." |
| **Ember-Bat**        | Fire    | Erratic movement. "Scavengers mutated by the friction of fractured time." |
| **Volt-Turret**      | Volt    | Shoots 4-tile line. "The citadel's automated defense grid." |
| **Frost-Wraith**     | Frost   | Phases walls, hits Chill. "Frozen souls of Oakhaven's nobility." |
| **Bone-Knight**      | Phys    | High DEF. "The honor guard never abandoned their posts." |
| **Cinder-Shaman**    | Fire    | AOE firebombs. "Performs rain-summoning rite... what falls is not water." |
| **Volt-Hound**       | Volt    | Lunges, Stuns. "Kennels of the citadel guard, warped into living capacitors." |
| **Frost-Sentinel**   | Frost   | AOE frost cross. "Statues of old kings, animated by the cold." |
| **Clockwork Scarab** | Chrono  | Flees, steals 3 Turns. "A gnawing little paradox... it bites for time." |
| **Time-Weaver (Elite)**| Chrono| Teleports away. "The Lich's corrupted apprentices." |
| **Inferno-Golem**    | Fire    | F10 Boss. Magma Slam. |
| **Storm-Caller**     | Volt    | F20 Boss. Chain Bolt. |
| **Glacial-Knight**   | Frost   | F30 Boss. Frozen Sweep, Ice Barricade. |
| **Chrono-Lich**      | Chrono  | F99 Final Boss. Summons grunts, Time-Blast, Rewind. "Hoarding what remains of the Hourglass in a mad bid to ascend." |

*Enemies can spawn with Elite Affixes (Shielded, Swift, Colossal, etc.), guaranteeing a Relic/Weapon drop.*

### D. Accessories
| Accessory      | Passive                                   | Lore / Flavor Text |
|----------------|-------------------------------------------|----------------------|
| Iron Ring      | +2 DEF.                                   | "A crude signet of the lower guard." |
| Ring of Vigor  | +10 Max HP.                               | "Pulses with a steady heartbeat." |
| Boots of Haste | Dash skill costs 1 Stamina instead of 2.  | "Slipping them on makes the world around you feel like it's moving through syrup." |
| Echo Charm     | +20% Echoes earned (rounded up).          | "A jagged piece of crystallized memory. Whispers mistakes of your past lives." |
| Ember Pendant  | Immune to Burn; walk fire hazards freely. | "Recognizes you as a son of Oakhaven, granting safe passage through the flames." |
| Winged Anklet  | Immune to Chilled.                        | "Rejects the stagnation of the void." |
| Grounding Band | Immune to Stun.                           | "Grounds your very consciousness, preventing sudden shocks." |
| Berserker's Cuff | +4 Total ATK, -2 Total DEF.              | "Restricts blood flow just enough to induce a permanent state of rage." |
| Paladin's Mantle | +3 Total DEF, -10 Max HP.                | "Absorbs blows perfectly but exhausts the wearer." |
| Battery Cell   | +3 Max Stamina.                           | "A glowing hum of ancient energy that hooks directly into your nervous system." |
| Kindling Pouch | Synergy: all Fire weapons/skills deal +2 DMG. | "Contains the ever-burning embers of the citadel's first hearth." |
| Capacitor Ring | Synergy: all Volt weapons/skills deal +2 DMG. | "It sparks constantly, desperate to ground itself into an unlucky target." |
| Permafrost Vial | Synergy: all Frost weapons/skills deal +2 DMG. | "A liquid so cold it freezes the air around your fingertips." |
| Vampire Tooth  | Lifesteal: heal 1 HP per enemy killed.    | "A morbid keepsake. It pulses warmly when blood is spilled." |
| Shattered Hourglass | Safety Net: if Turns hit 0, restore 15 Turns instead of triggering the loop reset; item is destroyed. | "A broken promise of more time. Use it to finish what you started." |
| Spiked Pauldrons | Retaliation: deal 2 Physical DMG back to any enemy that hits you in melee. | "The best defense is a jagged piece of rusted metal aimed at their throat." |
| Gambler's Dice | Raises Time Shard drop chance from 25% to 50%. | "Fate is fluid in the time loop. Roll the bones and steal back some seconds." |
| Adrenaline Gland | When below 10 HP, Active Skills cost 0 Stamina. | "Panic is just a resource waiting to be harnessed." |
| Alchemist's Belt | Using Potion/Tactical Consumable costs 0 Turns. | "A perfectly organized bandolier. Your hand finds what it needs instantly." |

### E. Consumables
Include Potions (HP restores) and Tactical Consumables (grenades, scrolls, runes, geodes). Consumable uses take 0 turns out of combat, 1 turn in combat (Tactical Consumables always take 1 turn).

### F. Relics
Infinite-stacking passives lost on loop reset. Found in chests or via Elites. Examples: Phoenix Feather (revive), Giant's Anvil (+ATK, no Dash), Vampire's Cape (lifesteal), Static Generator (auto-Stun).

### G. Cursed Rifts
Rare tile events (12% chance/floor) triggering 1 of 6 events: Rift Shop, Blood-Infused Anvil, Frozen Watchwarden, Paradox Mirror, Chrono-Lich's Projection, or Echo Geode.

---

## 7. System Mechanics
*   **Turn-Based Loop:** Player moves/attacks/skills, then enemies act, then turns decrement. 100 turns per floor limit. Wait (Space) grants +1 DEF (Brace).
*   **Combat:** Bumping into enemies attacks. Damage = `max(1, ATK - DEF) * Elemental_Multiplier`. Skills cost stamina, regenerated per turn. Kills with skills refund stamina.
*   **Echo Economy:** Earn Echoes from kills and Flawless Floors (no damage taken on floor). Spend Echoes in the Hub on permanent Stats, Skill unlocks, and Gear Slot unlocks. Unwanted items can be Melted for Echoes.
*   **Biomes & Hub:** 10-floor biomes with Mini-Bosses at the end. Mini-Bosses drop Temporal Anchors (checkpoints) to warp to from the Hub. Hub features upgrade shop, shortcut gate, and NPCs.
*   **Dungeon Generation:** Deterministic layouts per loop (seeded), dynamic chest loot (rolled fresh each loop). Cursed Rifts and Room Events (Echo Well, Chrono-Anvil) are randomized. 

---

## 8. User Interface & Controls
*   **HUD:** Tracks HP, Stamina, Turns, Floor, Status, Relics, and Skills.
*   **Menu Tabs:** Status, Inventory (5x5 grid), Relics, Skills, Bestiary, Settings. 
*   **Controls:** WASD to move/attack, Space to Brace. Q/E/R/F for skills.

---

## 9. Audio Design & Feel
*   **Web Audio API:** Procedurally generated SFX (chiptune-style).
*   **BGM:** Pre-rendered OGG files, manipulated dynamically (pitch/filter) based on game state (e.g. low turns speeds up the clock and music).
*   **Juice:** Screen shake on crits/kills, pixel particle bursts, floating damage text, CRT "Time-Warp" death transition, accelerating heartbeat sound at low health.
