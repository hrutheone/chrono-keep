# Chrono-Keep: The 100-Turn Descent (Specification & Planning Document)

## 1. Project Overview
`Chrono-Keep` is a turn-based, grid-based roguelite descent RPG rendered on a HTML5 Canvas with retro pixel art and an amber-CRT-styled HTML UI.

*   **Core Loop:** Descend a 99-floor dungeon. The player has exactly 100 turns per floor to explore, loot, fight, and reach the stairs down.
*   **Time Loop Mechanic:** When turns hit 0 or player dies, they return to the Hub (Floor 0). Inventory/weapons are lost. Echoes (currency) and Temporal Anchors (checkpoints) are retained. From the Hub, players start at F1 or warp to anchored Biomes. Floor layouts are identical across loops within a save.
*   **Biome Structure:** 99 floors divided into 10-floor Biomes. Every 10th floor is a Mini-Boss Arena that drops a Temporal Anchor.
*   **Mini-Boss Evolution:** Each of the 3 mini-bosses is fought 3 times across the descent (Mk I/II/III), gaining new attacks and summons each time instead of just scaling numbers. See Section 6C.

### Narrative Framing: The "Why"
**The Fall of Oakhaven:** The Chrono-Keep was not always a prison; it was once the Grand Conservatory of Oakhaven. Decades ago, as a mysterious plague threatened to wipe out the kingdom, the brilliant Court Wizard made a desperate choice. To save his people, he attempted to freeze Oakhaven at the exact moment before its ruin using the kingdom's most sacred artifact: the Hourglass of Eternity. But mortal hands were never meant to halt the river of time. The ritual violently backfired, mutating him into the mad Chrono-Lich and shattering the Keep downward into the earth.

**The Temporal Anomaly (The 100-Turn Limit):** The Keep did not physically collapse; it fractured into 99 stacked strata of broken time. Time inside the Keep is entirely frozen. When a living, breathing entity steps onto a floor, the timeline attempts to resume — but the shattered reality can only sustain exactly 100 seconds (turns) of linear time before the paradox reaches critical mass. When the clock hits zero, the floor violently collapses, expelling the intruder back to the surface to preserve itself.
**The Temporal Anomaly (The 100-Turn Limit):** The Keep did not physically collapse; it fractured into 99 strata of broken time. Time inside the Keep is entirely frozen. When a living, breathing entity steps onto a floor, the timeline attempts to resume — but the shattered reality can only sustain exactly 100 seconds (turns) of linear time before the paradox reaches critical mass. When the clock hits zero, the floor violently collapses, expelling the intruder back to the surface to preserve itself.

**The Protagonist (The Last Watchwarden):** You are the Last Watchwarden. When the Hourglass shattered, your proximity to the epicenter locked you in a cruel, unending loop. You are cursed with lucidity: you remember every death, every failure, and every reset. The monsters wandering the halls — the Bone-Grunts and Frost-Wraiths — are your former comrades and the citizens of Oakhaven, trapped in a mindless state of decay because they forgot their purpose across a thousand loops. Your duty is no longer to guard the Keep, but to grant it the mercy of a final death. You must descend the 99 floors, wrest the Temporal Anchors from the Lich's corrupted wardens, and stitch reality back together just enough to reach the bottom and end the Lich's reign.

**The Currencies of Time:**
*   **Echoes**: Crystallized memories of your past deaths. By absorbing them, you refuse to let your past failures be in vain, using your own trauma to permanently strengthen your body and mind.
*   **Time Shards**: Splintered seconds dropped by enemies. By taking a life, you steal their remaining moments, buying yourself a few extra heartbeats against the collapsing floor.
*   **Temporal Anchors**: Surviving heavy pivot-stones of the original Hourglass. Driving them into the rift at the Hub physically pins a section of the Keep to reality, creating a permanent safe haven.
*   **The Chrono-Anvil:** Spawns exclusively in the Elite combat arenas. Instead of an automatic upgrade, it provides a 4-outcome gamble when interacting with it (offering your equipped weapon).
  - **Jackpot (20%):** FLAWLESS FORGE! Destroys weapon, grants a Late Tier / endgame weapon.
  - **Upgrade (20%):** RESONANCE INCREASED! Grants permanent +1 ATK to current weapon.
  - **Sidegrade (40%):** REFORGED. Destroys weapon, grants a new weapon of the same tier.
  - **Catastrophe (20%):** SHATTERED... Destroys weapon, yields a useless "Shattered Scrap" (4 ATK).
  - The Anvil becomes an empty floor tile after one use.

### "The Shattering" (Loop 0)
Loop 0 drops players into Floor 99 against the Chrono-Lich with an endgame loadout. This is a scripted loss: when the boss hits <=25% HP or player HP hits 0, the timeline collapses. The player awakens in the Hub with the Rusty Sword, resetting all progression and starting Loop 1.

---

## 2. Technical Stack
*   **Language:** TypeScript / JavaScript (ES6+).
*   **Rendering:** HTML5 Canvas for game world (with offscreen dynamic lighting pass), HTML/CSS for UI overlays.
*   **Storage:** `localStorage` for permanent upgrades, live run snapshot, and audio settings.
*   **Audio:** Web Audio API (procedural SFX, pre-rendered BGM loops).
*   **Platform:** Progressive Web App (PWA) enabled for offline play and standalone installation.

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
Weapons are categorized in overlapping drop pools (Early, Mid, Late stages), on a 10x ATK curve from Trash Tier to the Ultimate Elemental chase weapons:
*   **Trash Tier:** Shattered Scrap (ATK 2).
*   **Early Game (F1-F20):** ATK 3-6 — Rusty Sword, Bone Dagger, Mythril Hammer, Mage Masher, Flametongue, Ice Lance, Partisan, Glass Sword, Broadsword, Ash Wand, Bone Club, Defender.
*   **Mid Game (F21-F50):** ATK 8-15 — Thunder Rod, Ifrit's Blade, Elven Bow, Blood Sword, Coral Sword, Dark Knight's Blade, Assassin's Dagger, Flamberge, Trident, Bio-Blade, Murasame, Gale Bow, Kotetsu, Diamond Mace.
*   **Late Game (F51-F99):** ATK 16-30 — Firaga Edge, Ice Brand, Blitz Whip, Rune Axe, Excalibur, Holy Lance, Ultima Weapon, Ragnarok, Gungnir, Save the Queen, Blood Lance, Deathbringer, Apocalypse, Masamune.
*   **Ultimate Elemental Chase (F80-F99):** ATK 32 — Laevateinn, Vajra, Niflheim.

| Weapon Name | Base ATK | Element | Special Effect / Passive | Drop Source | Lore / Flavor Text |
|-------------|----------|---------|---------------------------|--------------|---------------------|
| Laevateinn  | 32       | Fire    | 2x damage vs a Burning target. | Late Tier pool | "The legendary fire sword that reduces everything to ash. It burns hottest when the fuel is already lit." |
| Vajra       | 32       | Volt    | Ranged 1-2, pierces the tile behind the target, and guarantees a Stun on hit. | Late Tier pool | "A spear of mythic thunder. It never misses, and its strike freezes the nervous system." |
| Niflheim    | 32       | Frost   | Instantly executes a Chilled enemy at or below 25% HP. | Late Tier pool | "A blade colder than the void. It does not cut; it simply shatters what is already frozen." |
| Rusty Sword  | 3        | Physical | None (Starter weapon).                            | Starter | "Your service weapon from a timeline long forgotten. It remembers the taste of blood, but its edge has dulled across a thousand failed resets." |
| Bone Dagger  | 3        | Physical | Free to equip/swap even mid-combat.               | Chests (Early)  | "Carved from the femur of a fallen Watchwarden. It demands so little weight to wield, you can draw it between the ticks of a clock." |
| Flametongue  | 4        | Fire     | Attacking removes Chilled from yourself.          | Ember-Bat          | "A campfire given an edge. It never quite stops smoldering." |
| Mage Masher  | 4        | Volt     | 10% chance on hit to restore 1 Stamina.           | Volt-Turret        | "A duelist's parrying blade, repurposed. It hums faintly, siphoning static off every failed guard." |
| Ice Lance    | 5        | Frost    | Ranged attack, pierces 2 tiles in a line.         | Frost-Wraith       | "A shard of the Undercroft, sharpened. It skewers straight through whatever stands in its way." |
| Thunder Rod  | 8        | Volt     | On hit: also strikes both tiles flanking the target. | Chests (Early/Mid) | "A lightning rod bent into a weapon. The charge always finds more than one target." |
| Assassin's Dagger | 10 | Chrono   | Knocks the enemy back 2 tiles and randomly reassigns their element. | Time-Weaver (Elite) | "It bends reality upon impact. You never quite know what you'll leave behind." |
| Coral Sword  | 10       | Volt     | On hit: pulls the enemy 1 tile closer; 25% chance to Stun. | Volt-Hound  | "Grown, not forged, in a flooded sub-level that used to be a power station." |
| Dark Knight's Blade | 15 | Physical | Blood Magic: you take 2 HP damage per swing.      | Bone-Knight        | "It cuts deeper than any living wrist could bear to swing it." |
| Diamond Mace | 10       | Frost    | Deals 2x damage to Chilled enemies.               | Frost-Sentinel     | "Faceted ice that never melts. It shatters what the cold has already made brittle." |
| Save the Queen | 18     | Frost    | Negates the first hit taken on each floor.        | Frost-Sentinel     | "A ceremonial blade, repurposed for a war it wasn't built for. It still remembers how to shield someone." |
| Ifrit's Blade | 11      | Fire     | Cleaves the 3 tiles in front on every attack.     | Inferno-Golem | "A shard of the Undercroft's opposite — a sliver of something that never stopped burning." |
| Blitz Whip   | 16       | Volt     | On hit: lightning chains to 1 additional nearby enemy. | Storm-Caller | "Live current, coiled. It never stops looking for a second target." |
| Ice Brand    | 16       | Frost    | On kill: spreads Chilled to nearby enemies.       | Glacial-Knight | "A killing blow with this blade leaves the cold looking for somewhere else to go." |
| Excalibur    | 22       | Physical | Ignores 50% of the target's DEF.                  | Chests (Mid/Late)  | "A relic from a story that didn't happen here — armor simply forgets to matter around it." |
| Masamune     | 26       | Chrono   | Kills refund 3 Turns to the turn counter.         | Chests (Mid/Late)  | "A legendary blade... Mythic-tier — it steals back a real handful of moments with every kill." |

### B. Skills
Costs Stamina. Up to 4 equipped at a time (Q/E/R/F). Evolve through 3 levels.
*   **The Striker:** Dash, Bash, Mug, Grapple, Static Shift, Omnislash, Vanish. (Focus: Mobility, Assassination)
*   **The Sentinel:** Cleave, Ice Aegis, Provoke, Reflect Barrier, Chakra, Fortify, Aura. (Focus: Defense, Survival)
*   **The Weaver:** Flame Arc, Defuse, Blizzard Wave, Slow, Chain Lightning, Meteor. (Focus: Area Control, Magic)
*   **The Chronomancer:** Recall, Haste, Time-Stop, Paradox, Ultima. (Focus: Time Manipulation)

### C. Monsters
Regular-enemy stats scale with floor depth (+8% compounding every 5 floors, `Math.pow(1.08, floor((floor-1)/5))`, applied to hp/maxHp/attack). Mini-bosses and the Final Boss are exempt from this formula — their stats are hand-tuned per encounter (see Boss Evolution below).

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
| **Inferno-Golem**    | Fire    | F10/F40/F70 Mini-Boss. Magma Slam, evolving per Boss Evolution below. |
| **Storm-Caller**     | Volt    | F20/F50/F80 Mini-Boss. Chain Bolt, evolving per Boss Evolution below. |
| **Glacial-Knight**   | Frost   | F30/F60/F90 Mini-Boss. Frozen Sweep, Ice-Barricade, evolving per Boss Evolution below. |
| **Chrono-Lich**      | Chrono  | F99 Final Boss. HP 4500, ATK 120, DEF 25. Summons grunts, Time-Blast, Rewind. "Hoarding what remains of the Hourglass in a mad bid to ascend." |

*Enemies can spawn with Elite Affixes (Shielded, Swift, Colossal, etc.), guaranteeing a Relic/Weapon drop.*

#### Boss Evolution (Mk I / II / III)
Each mini-boss is fought 3 times across the descent. Stats are hand-tuned per floor (not a flat multiplier), and each return trip adds new mechanics on top of the last:

| Boss | Floor (Mk) | HP | ATK | DEF | New Mechanics |
|------|-----------|----|----|----|----------------|
| Inferno-Golem | 10 (Mk I) | 120 | 6 | 2 | Magma Slam (3x3 AOE). |
| Inferno-Golem | 40 (Mk II) | 650 | 24 | 6 | Cross-shaped Magma Slam; Ember Aura (self-centered pulse every 4 turns); summons up to 2 Ash-Fiends. |
| Inferno-Golem | 70 (Mk III) | 2400 | 75 | 12 | Magma Slam widens to 5x5; Supernova (3-turn channel that wipes the player unless sheltered beside a spawned Obsidian Pillar); summons up to 2 Hellfire-Magi. |
| Storm-Caller | 20 (Mk I) | 180 | 10 | 3 | Chain Bolt (4-tile line, forks once off a wall); 4 copper cover pillars; summons up to 2 Volt-Hounds. |
| Storm-Caller | 50 (Mk II) | 850 | 35 | 8 | Chain Bolt forks twice with a 25% Stun; Magnetic Pull (drags the player to a pillar and Stuns 1 turn); summons up to 2 Storm-Stalkers. |
| Storm-Caller | 80 (Mk III) | 2900 | 90 | 16 | Overload Rain (3-turn channel, safe only beside a surviving pillar; each cast permanently shatters one); summons up to 2 Tesla-Coils. |
| Glacial-Knight | 30 (Mk I) | 260 | 12 | 5 | Frozen Sweep (8 adjacent tiles, 50% Chill); spawns Ice-Barricades (expire after 5 turns). |
| Glacial-Knight | 60 (Mk II) | 1100 | 45 | 12 | Glacial Lunge (straight-line charge that smashes Ice-Barricades and slides the player back 2 tiles on impact); summons up to 2 Void-Spirits. |
| Glacial-Knight | 90 (Mk III) | 3500 | 110 | 24 | Ice-Barricades become permanent (only a Fire weapon melts them); Permafrost Storm drains an extra 2 Turns whenever a Chilled player moves; summons up to 2 Glacial-Monoliths. |

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
Rare tile events (12% chance/floor) triggering 1 of 5 events, rolled uniformly:
1. **Rift Shop:** Buy a Relic with Echoes at an escalating price (50/150/300).
2. **Blood-Infused Anvil:** Sacrifice 50% of current HP for +2 permanent ATK on the equipped weapon.
3. **Frozen Watchwarden:** Sacrifice 1 Potion for +1 Level on a random active skill.
4. **Paradox Mirror:** A Shadow Warden spawns, mirroring the player's own HP/ATK/DEF exactly.
5. **Echo Geode:** Mine for +15 Echoes per turn (up to 5 turns), risking an ambush on turns 3 and 5.

---

## 7. System Mechanics
*   **Turn-Based Loop:** Player moves/attacks/skills, then enemies act, then turns decrement. 100 turns per floor limit. Wait (Space) grants +1 DEF (Brace).
*   **Combat:** Bumping into enemies attacks. Damage = `max(1, ATK - DEF) * Elemental_Multiplier`. Skills cost stamina, regenerated per turn. Kills with skills refund stamina.
*   **Echo Economy:** Earn Echoes from kills and Flawless Floors (no damage taken on floor). Spend Echoes in the Hub on permanent Stats, Skill unlocks, and Gear Slot unlocks. Unwanted items can be Melted for Echoes.
    *   Standard Curve (Max HP/Max Stamina/Turn Bonus): Levels 1-10 cost 50/100/200/300/500/750/1000/1500/2000/2500, then +500/level uncapped.
    *   Base ATK Curve: Levels 1-10 cost 100/300/600/1200/2400/4000/6000/9000/12000/15000, then +3000/level uncapped.
    *   Skill Tiers (Core/Advanced/Chronomancer): 50/100/200, 150/300/600, 400/800/1500 per level.
    *   One-time Gear Slots: Second Weapon Slot 1500, Second Accessory Slot 1000, Third Accessory Slot 2500 (requires the second).
*   **Biomes & Hub:** 10-floor biomes with Mini-Bosses at the end. Mini-Bosses drop Temporal Anchors (checkpoints) to warp to from the Hub. Hub features upgrade shop, shortcut gate, and NPCs.
*   **Dungeon Generation:** Deterministic layouts per loop (seeded), dynamic chest loot (rolled fresh each loop). Cursed Rifts and Room Events (Echo Well, Chrono-Anvil) are randomized. Dynamic Floor Events (10% chance) add high-risk/high-reward challenges (e.g., Pacifist's Burden, The Bleeding Timeline, The Shadow's Pursuit) to occasional floors with unique rules and visual tints.

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
*   **Lighting:** Dynamic lighting system using offscreen canvas that adds ambient shadows while maintaining map visibility (capped opacity). Player, elites, hazards, and rifts punch holes in the darkness.
