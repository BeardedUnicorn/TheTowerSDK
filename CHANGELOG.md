# Changelog

## 2.1.0 (2026-11-26)


### Bug Fixes

* **mcp:** check every structured answer against its schema before it leaves ([ddb80bf](https://github.com/BeardedUnicorn/TheTowerSDK/commit/ddb80bf80721a530de61bc6f49785367660d821a))


### Features

* **mcp:** give the Claude Desktop extension settings, prompts, tool titles and an honest version ([268f318](https://github.com/BeardedUnicorn/TheTowerSDK/commit/268f318325f3e4b030060cb990dc0dddd31bc977))
* **mcp:** send structured output with a schema for every standalone tool ([65ef76f](https://github.com/BeardedUnicorn/TheTowerSDK/commit/65ef76f3d6bf5a671f823bbae0bff8e85b96f659))
* **vault:** price the v29 vault in keys, and label the old calculators and charts pre-v29 ([86eb384](https://github.com/BeardedUnicorn/TheTowerSDK/commit/86eb384900ef416ad4004460e2e1838925d0adce))

## 2.0.0 (2026-11-26)


* fix(workshop)!: make the damage and health regen curves give the game's table ([d97886d](https://github.com/BeardedUnicorn/TheTowerSDK/commit/d97886d09f176e03681924069ec44e423d2e493b))
* fix(workshop)!: report every upgrade's value in the game's unit, and price several levels ([996255b](https://github.com/BeardedUnicorn/TheTowerSDK/commit/996255b7c78931fbbf7653e8d7e272e6fffefa01))


### Bug Fixes

* **charts:** open each bot's own chart and show every tier of elite spawn chance ([bf8cbe7](https://github.com/BeardedUnicorn/TheTowerSDK/commit/bf8cbe793e47ff3d04bbde2529f1ac93ac959448))


### Features

* **calculators:** price an upgrade run from one level to another ([22707b9](https://github.com/BeardedUnicorn/TheTowerSDK/commit/22707b9142a75c6613e779e52f2680f366ba8cf7))
* **charts:** chart guardian chips, module costs, unlock ladders, enemy scaling and per-tier tables ([504bc22](https://github.com/BeardedUnicorn/TheTowerSDK/commit/504bc2266600064c0fa5a73bda8cb0a152ed5b5a))
* **charts:** give every series an id, count the cost ladders, and add a chart_series tool ([a6581fe](https://github.com/BeardedUnicorn/TheTowerSDK/commit/a6581fedbdd25d75ab47e1863e446b49c7639bcd))
* **save:** read a save's history as series ([49662f9](https://github.com/BeardedUnicorn/TheTowerSDK/commit/49662f979dd564d1347c99ef0a8d7bb32c488587))
* **workshop:** give the Workshop screen value for Health Regen and Defense Absolute ([e0db27e](https://github.com/BeardedUnicorn/TheTowerSDK/commit/e0db27e83c550c799c0199c0df5c08b5ae646565))


### BREAKING CHANGES

* workshopDamageCurve, getOutOfRoundDamagePreview, healthRegenCurve, healthRegenTier249, healthRegenTier499, healthRegenTier5k and getOutOfRoundHealthRegenPreview return different numbers, the ones the game's table has. WORKSHOP_DAMAGE_QUAD_COEFF is 0.077, and the HEALTH_REGEN_TIER249_EXP, HEALTH_REGEN_TIER249_COEFF, HEALTH_REGEN_TIER499_COEFF and HEALTH_REGEN_TIER5K_EXP constants changed value with the formula.

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
* workshopStatValue returns the game's value with a unit field, not the Effective Paths sheet's number. Enemy Attack and Health Level Skip, Recovery Amount, Lifesteal, Land Mine Damage and Damage / Meter change value, and the eight upgrades it returned null for now return one. A caller feeding its Damage / Meter output to the eDamage model must read WORKSHOP_DATA instead. standardElsCoinUpgradeCost returns the price on the row being left, one row earlier than before. Four calculator ids moved: mechanics.workshopStatValue is workshop.statValue, mechanics.standardElsCoinUpgradeCost is workshop.levelSkipNextLevelPrice, mechanics.getWorkshopUtilityLevelSkipChance is workshop.levelSkipChance, and data.computeWorkshopStatNumericValueAtLevel is workshop.tableValue.

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>

## 1.7.2 (2026-11-25)


### Bug Fixes

* **save:** read game v29.2.3 (build 1301) exports as checked ([5363ebc](https://github.com/BeardedUnicorn/TheTowerSDK/commit/5363ebc6ef5d0be8e7aedc3d2fce5821e8dc6921))

## 1.7.1 (2026-11-24)


### Bug Fixes

* **events:** award an event its own relics, apart from the ones its shop sells ([7967206](https://github.com/BeardedUnicorn/TheTowerSDK/commit/79672061e3a57fa34e062f2e1c7aae1a2383f06b))

## 1.7.0 (2026-11-24)


### Features

* **calculators:** run the thorns, elite chart, level reduction and Guardian cost formulas by name ([ae54b3f](https://github.com/BeardedUnicorn/TheTowerSDK/commit/ae54b3f8535dce49fc995f3028bf13ec56203ca7))

## 1.6.0 (2026-11-24)


### Bug Fixes

* **mcp:** answer the call that was made, or refuse it ([a958164](https://github.com/BeardedUnicorn/TheTowerSDK/commit/a958164940873afdfaba4ee31b803e1345e92eb4))


### Features

* **calculators:** register every exported function, and run the one the entry point exports ([3f0b241](https://github.com/BeardedUnicorn/TheTowerSDK/commit/3f0b241522d17ee898f81d56de474291c5ff0d3c))

## 1.5.0 (2026-11-24)


### Bug Fixes

* **builders:** label the workshop calculator as enhancements only ([820fe31](https://github.com/BeardedUnicorn/TheTowerSDK/commit/820fe3186f6e4584ceadbb9c22c1641fd3b0d865))
* **data:** price a lab rush under an hour as the game does ([6daf1eb](https://github.com/BeardedUnicorn/TheTowerSDK/commit/6daf1eb0cdff4e884533550e7f581eae366b1574))
* **mechanics:** say what a hidden eEcon candidate is waiting on ([980fdf5](https://github.com/BeardedUnicorn/TheTowerSDK/commit/980fdf566f51ed954aec9cc859712ec1bab5dfc0))
* **save:** time a queued lab with its slot's speed-up ([182fd6b](https://github.com/BeardedUnicorn/TheTowerSDK/commit/182fd6b3a114082672b19ec4cc23ab5be91837ed))


### Features

* **mcp:** price the next unlocks and the coin bonus, and keep calculators current ([62e13d1](https://github.com/BeardedUnicorn/TheTowerSDK/commit/62e13d1849d1e7d1a3da911b6f368085ded96c8e))

## 1.4.0 (2026-11-24)


### Bug Fixes

* **formatting:** format 1e36, 1e111 and the other ladder steps exactly on Node 22 ([ce06448](https://github.com/BeardedUnicorn/TheTowerSDK/commit/ce064482549b184dc1cd4fc411343d1964bd9e0e))


### Features

* **mcp:** attach a Claude Desktop extension (.mcpb) to every release ([08d26f9](https://github.com/BeardedUnicorn/TheTowerSDK/commit/08d26f9e3a5f0807bebe19e2fdbe4eec2b417204))

## 1.3.0 (2026-11-24)


### Bug Fixes

* **milestones:** list the labs each milestone opens as the game does ([ea95040](https://github.com/BeardedUnicorn/TheTowerSDK/commit/ea950400d345f5d5aa5f870037b63e8c2e8f2ff6))


### Features

* **cards:** give the chance of drawing each card, as the Card Chances panel shows it ([17a6412](https://github.com/BeardedUnicorn/TheTowerSDK/commit/17a6412129103d92d833a1df24f4c18536e4957e))
* **data:** match labs, workshop, modules and numbers to the live v29.2.2 game ([325a6e3](https://github.com/BeardedUnicorn/TheTowerSDK/commit/325a6e392df8eb4a51d516ecb81f1f6d97d01934))
* **data:** price workshop unlocks and the next ultimate weapon ([6d17ab6](https://github.com/BeardedUnicorn/TheTowerSDK/commit/6d17ab61b49e46c3cfa0ae1066f9f0d3618f060b))
* **mechanics:** build the Battle tab's Total Coin Bonus row by row ([56902dd](https://github.com/BeardedUnicorn/TheTowerSDK/commit/56902dd9f174d125d756ce95e7c7fa8c14852407))
* **mechanics:** computeWorkshopScreenValue — the number the Workshop screen shows ([8c0f9f7](https://github.com/BeardedUnicorn/TheTowerSDK/commit/8c0f9f7827221233053680201aa3be65a33ac983))

## 1.2.1 (2026-11-24)


### Bug Fixes

* **data:** file the mid-2026 event relics under the events that awarded them ([c69af55](https://github.com/BeardedUnicorn/TheTowerSDK/commit/c69af55a568dd802bc87071c172b2db51c3fc956))

## 1.2.0 (2026-11-24)


### Features

* **mcp:** find tool_export.json on a Mac when no path is given ([84e89a8](https://github.com/BeardedUnicorn/TheTowerSDK/commit/84e89a8c7b2a4ff6f4e3c8066c436e152b327ed0))
* **save:** give the event shop's real prices and resolve an event named after its theme ([ce56c66](https://github.com/BeardedUnicorn/TheTowerSDK/commit/ce56c66c4100bfe5a35aec22ab8bfec3d5f89a34))

## 1.1.0 (2026-11-23)


### Bug Fixes

* **data:** match six relics' unlock text to the game's relic table ([6f0286b](https://github.com/BeardedUnicorn/TheTowerSDK/commit/6f0286bc94825a3d42d40ccbe0480e5c1bc1aedc))


### Features

* **save:** name every relic slot, say what each relic grants, and group relics by event ([034e572](https://github.com/BeardedUnicorn/TheTowerSDK/commit/034e572adfd1578a398c1687e5a9e20c26ff4a33))

## 1.0.1 (2026-11-21)


### Bug Fixes

* **mcp:** explain an unreadable export in a sentence, and guard decode_save ([35e4680](https://github.com/BeardedUnicorn/TheTowerSDK/commit/35e46802781f12dc8f3e8c67492915c3eb4faf42))

## 1.0.0

**First release of the fork, as `@beardedunicorn/thetowersdk`.** Forked from
[TmRxJD/TheTowerSDK](https://github.com/TmRxJD/TheTowerSDK); versions below 1.0.0 were published
upstream as `thetowersdk`. Import specifiers change with the name
(`thetowersdk/data` is now `@beardedunicorn/thetowersdk/data`); the MCP binary is still
`thetowersdk-mcp`.

**Checked against game v29.2.1 (build 1294).** v29.2.1 (patch note 1572999340027420755) fixed
ads for European users and a Workshop tutorial soft-lock. Its relics, tournament prizes, milestone
rewards, workshop enhancement caps, constants, enums and save fields are identical to v29.2.0, so
no data changed. `readExportInfoFromSaveRoot` now treats build 1294 as checked; the version
timeline and the list of notes missing from the patch-note archive include 29.2.1.

**Read from the v29.2.1 game data.** New facts files: `facts/v29.2.1/vault-upgrades.json` (every
vault upgrade and group) and `facts/v29.2.1/theme-names.json` (every theme slot by save index).
Tests pin the SDK to both.

Vault:

- **`VAULT_V29_VERIFIED` is now `true`.**
  - All 116 rows already had the game's key costs.
  - Each row now also carries `levelValues` (the total benefit at each level), `unit`, the game's
    own label in `gameName`, and `requirements` (the card, card mastery, ultimate weapon or
    league it needs).
  - Enemy categories carry their league requirement too: league id 6, Mythic.
  - New exported types: `VaultV29Unit` and `VaultV29Requirement`.
- **Elite Balance Toggle (VaultID 1320) added to Harmony ▸ Cards.** It costs 20 keys and needs
  the Enemy Balance mastery. It is the "Elite Mastery Balance" of v29.1.4. Saves that own it now
  decode it, where it used to be an unknown id.
- **Where the game data and the wiki disagree:**
  - Max Recovery runs 20/40/60/80/100%, with the 60% step that v29.2 restored.
  - The Protector special is Radius, not Mass.
  - The Basic Coin Bonus is a plain +0.01 per level, not a percent.
- **No row names or save keys changed.** Where the game words a row differently (for example
  "Attack Range" for the Ranged special), the game's label is in `gameName`.
- **Left out on purpose.** Bastion Automation (1300) and Smart Bastion Automation (1310) are in
  the game data, but both need the Bastion card, which is not released. Power tree tiers 2 and 3
  (6221, 6222) are ids with no upgrade defined.

Themes (save catalog):

- **New rows in `THEME_CATALOG`:**
  - index 0 "Default" for tower, background, menu and profile banner;
  - towers 85 Baby Dragon and 86 Morning Star;
  - backgrounds 60 Dragon Treasure and 61 Tower's Workshop;
  - menu 12 and profile banner 13, Dragon Treasure;
  - guardian skins 21-24: Dewdrop, Pal, Yorick, Mercy (also in `GUARDIAN_SKIN_IMPORT_CATALOG`);
  - songs 0-5.
- **Song rows 6 and 7 named the wrong tracks.** A song's index is its `trackAvailable` slot, and
  the game puts the event songs on tracks 4, 5 and 8.
  - "Krisu - Oceans Sings" moves from 6 to 4. It keeps that name, and its label is the game's
    "Krisu - The Ocean Sings".
  - "Krisu - Hiding in Himalaya" moves from 7 to 5.
  - 6 is now "Krisu - The Ethereal and I" and 7 is "Krisu - Embrace Oblivion".
  - A save with track 6 or 7 unlocked now reports these names.
- **The bonus catalog lists the new slots too**, by name, at each category's existing rate.
  - Index 0 (Default) is left out: the game counts owned themes from slot 1.
  - The songs' coin rate stays flagged as unresolved.
  - Whether the newest slots can be obtained yet is not settled.

Labs and card masteries (`facts/v29.2.1/labs.json`, with no coin or time modifier applied):

- **Fleet labs 246-248 corrected.** Overcharge Exponent Reducer, Commander Radius and Saboteur
  Attack Speed cost exactly 1.5x more each level, from 1e21 coins, and take 400 h longer each
  level. The old ladder was an enemy-lab curve scaled up and rounded to two digits (2.3e21 where
  the game has 2.25e21).
- **Global Presets (252) corrected.** It is one level at 1e14 coins and 960 h. The catalog had
  copied Card Presets level 1 (350,000 coins, 13:53:00).
- **Now pinned to the game.** Card Presets levels 1-5 and Primary Module Bonus 253-256 were
  already right; tests now hold them to the game data.
- **Land Mine Stun mastery is 2.5% to 25%, in 2.5% steps.** It was 2.7% to 27%. Fixed in
  `CARD_TEMPLATES`, `LAB_CATALOG`, the mastery chart table and both reference tables.
- **Every card mastery ladder is now tested against the game's base and increase.** The other 30
  already matched. Ultimate Crit's thirds of a percent are shown to one decimal.

Every lab ladder (`facts/v29.2.1/lab-ladders.json`, 180 labs, with no coin or time modifier):

- **`LAB_CATALOG` now agrees with the game at every level of those 180 labs.** A level may still
  differ by how it is written: a cost to its own significant figures, a time to the unit it is
  written in. 1186 levels of 65 labs differed by more and now carry the game's value.
- **Protector Health and Protector Radius** cost 10B more per level from L2 than the catalog had
  (90.005B at L2, not 80.01B).
- **Super Tower Bonus L7-L9 and L24-L26** held the next level's cost. L7 is 12.53B, so the ladder
  no longer falls at L7.
- **Labs Speed and Labs Coin Discount** had their own bonus already taken off their times and
  costs, so the SDK's modifiers took it off twice. They are now the base values, like every
  other lab.
- **Damage / Meter, Cash Bonus, Cash / Wave, Coins / Kill Bonus and Coins / Wave** start at 40
  coins and 20 s, not Damage's 30 coins and 14 s.
- **Death Wave Armor Stripping L1-L7** had lost their days (L1 is 200 h, not 8 h). **Death Wave
  Cells Bonus** was off by up to 8% at every level.
- **Other fixes include:**
  - costs: Double Death Ray L2-L10, Reroll Shards L6 (155.26M), Recovery Package Max L4
    (35.33B), Super Crit Chance L31, Module Coin Cost L3-L18, the Black Hole and Spotlight coin
    bonuses;
  - times: Module Coin Cost and Module Shard Cost L16 (225:40:53), Defense L40 and L46, Max
    Interest L14, Missiles Explosion, Waves Required L86-L88.
- **Ladders written to the minute that drifted** a minute every few levels now have the game's
  minutes: the eight assist-module labs, the enemy-type labs, the resistance labs, the three
  enhancement coin discounts and Ranged Enemy Range.
- **Unchanged:** Wall Health L2 (1.2B for 1.2001B) was only rounding. The card masteries, the
  effect-ban labs and the battle-condition labs' times are not in the facts. The
  battle-condition labs' costs match the game.
- **Removed `ray_enemy_defense`, `scatter_enemy_defense` and `vampire_enemy_defense` from
  `LAB_CATALOG`**, which now holds 231 labs. Neither the game nor the wiki has these labs.
  Ray, Scatter and Vampire have only Attack and Health labs. The rows were copies of the Health
  labs. The wiki page "Lab/Vampire Enemy Defense" is an old title for Vampire Enemy Health.
  `labCoinsRemaining` with no lab researched drops by 3.49e20 coins. Its `ep-port-baseline`
  total is now 0.04% above the Effective Paths sheet, down from 0.75%. The README's chartable
  series count is now 800 (462 from labs). It had said 808, two more than the catalogs held
  even before this change.
- **`lab-reference.test.ts` checks the Effective Paths sheet** as before. A level may now
  disagree with the sheet only where the game disagrees with the sheet too and the catalog
  follows the game. That is the case on 28 labs.

Campaign tier battle conditions (`facts/v29.2.1/tier-battle-conditions.json`):

- **Tiers 14-24 now match the game, condition by condition.**
- **The tier 21-24 entry the SDK called Basic's Ultimate is Mass Enforcement**, at 25/35/50/65.
  The SDK had 20 on tier 21.
- **There is no Mass Enforcement at level 1.** That 1 was the More Fleets overheat entry.
- **ELS Reduction on tiers 19-21 is 40, 55 and 70.** It was 30, 35 and 40. The counter-lab maths
  in `src/mechanics/labs/bc-counter-labs.ts` reads these levels.
- **Every tier also has two Tier Overheat entries**, Skip Decay 100 and More Fleets 1. They start
  at wave 15000 on tier 1, 250 waves earlier per tier, down to wave 10000 from tier 21. They are in
  the facts file and not in `TIER_DATA`, which lists what is active from the first wave.

Patch notes:

- The archive now runs to v29.2.1 (2026-11-19): 13 posts added, 259 in all. New are 29.1.1,
  29.1.2, 29.1.3, 29.1.4, the 29.2 preview (2026-11-13), 29.2 (2026-11-16) and 29.2.1. The
  existing 246 were compared with the channel and are unchanged.
- `npm run patch-notes:ingest` reads the bot token from `DISCORD_TOKEN` (the shell, or a
  gitignored `.env` at the package root) instead of from sibling bot projects. The `--bot` flag
  is gone. README has a "Patch notes: Discord token" section; `.env.example` is new.

MCP server:

- **New tools.**
  - `find_rows`: filter a table by field or text, pick columns, and page through it.
  - `patch_notes`: search the patch notes, find the first mention of a term, or read a version or
    date range.
  - `battle_history`: every run in a save, paged, with coins per hour and an average.
  - `chart_rows`: the published rows behind a chart.
  - `form_calc`: list, describe and run the form calculators.
  - `read_save_field`: one field of a save extractor's result, in full and a page at a time.
    `field` is a dotted path (`researches`, `active.levels`), `pick` keeps columns, `where` and
    `search` filter rows, and a negative `offset` counts from the end.
- **Existing tools can do more.**
  - `plan_effective_path` takes `savePath` for the economy family and plans from the account's
    levels and coins per hour. It reports the inputs the save could not supply.
  - `calc_run` takes `savePath` for calculators that read a save, and awaits async calculators.
  - `wiki_page` takes `offset`, so a page longer than 12,000 characters can be read to the end.
  - `list_exports` takes `offset` and says when it stopped at 300 names.
  - `calc_describe` lists the keys of an options parameter under `fields`, with units. The two
    lab calculators and six formatters declare them.
- **What clients receive changed.**
  - Descriptions are sent whole. They were cut to 180 characters; `TOWER_MCP_COMPACT=1` restores that.
  - A failed call sets `isError`. An answer carrying `error`, or `ok: false`, was sent as a success.
  - Arguments are checked against the tool's schema before it runs. A missing or mistyped
    argument is named.
  - The instructions name only tools the server advertises and documents that exist.
  - Tools carry `readOnlyHint` and `openWorldHint` annotations. `ping` is answered. The server
    replies in the protocol revision the client asked for (`2024-11-05` to `2025-06-18`).
  - Results are compact JSON. A `NaN` or `Infinity` in a result is named in a second text block.
- **Fixes.**
  - `begin_mechanic_task` no longer spawns the graph CLI when the development monorepo is absent.
    It returns the oracle's brief for the mechanic instead.
  - Notes and the ledger are written under the directory the server was started in. The fallback
    was three levels above `mcp/`, which under pnpm is inside `node_modules`.
  - Newlines in a note or ledger entry no longer start a second Markdown heading. A note with no
    fact or no source is refused. The ledger is rewritten by rename.
  - `describe_schema` returns a readable shape. It returned zod's internals twice over.
  - `plan_effective_path` refuses `family: "constructor"`, caps `steps` at 200 and ignores a
    `__proto__` key in `levels`.
  - `run_extractor` reports an extractor that throws, and suggests the nearest name.
  - `run_extractor` and `get_export` fit a preview into 12,000 characters. They returned up to
    40 rows or the first five keys whole, which reached 123,000 characters for a run history and
    left `researches` and `activeQueue` out of the labs result. Every key is now listed; a value
    too large to show is described by its count and columns and named in `outlined`.
  - `find_rows` stops a page at 12,000 characters as well as at `limit`, and says so. Its error
    for an unknown column suggests the nearest ones, and says a list has no `_key`.
  - `calc_run` refuses a key an options parameter does not declare. `lab.coinCost` with
    `modifiers: { coinDiscountLevel: 43 }` returned the undiscounted price; it now names the
    real key, `coinDiscountLabLevel`. An argument sent beside `args` is refused too.
    `runCalculator` in `thetowersdk/calculators` makes the same check: `CalculatorParam` gains
    an optional `fields` list (new type `CalculatorParamField`), and a key outside it throws
    `CalculatorError`. Six formatters now reject an option name they never read.
  - `sdk_sandbox_run` no longer reads Node's `fs` as an entry point, and explains a wrong save path.
  - `oracle_search` caps `limit` at 50. `oracle_brief` reports `matchedExactly`. `oracle_footguns`
    resolves a plain name before looking up its traps.
  - `wiki_search` honours `TOWER_WIKI_OFFLINE`.
  - A monorepo script that hangs is stopped after two minutes.

**Checked against game v29.2.0 (build 1286).** Data was re-read from the game's own tables
(`facts/v29.2.0/`), the wiki and the developers' patch notes through v29.2; a v29.2 official
export was read end to end.

Save readers (each pinned by a test shaped like a v29.2 export):

- **Misreads fixed.**
  - Module shard and reroll balances read the `_v2` keys v29.2 writes. Lifetime dice does the same.
  - All five workshop presets are read, and card presets, from their flat lists.
  - The tier-indexed lists (`highestWaveThisTier`, `highestWavePerTierThisCycle`) read slot 7 as
    tier 7. Highest tier and Echo-lab unlock were one tier high.
  - The per-cycle wave table is one wave per tier, not four dissonance types.
  - Lab time remaining uses the game's own finish date. The estimate uses the Labs Speed
    research, not the gem speed-up multiplier, which made it about 2x long.
  - Locked, empty assist slots are not equipped modules. Banned perks drop `-1`.
  - Bot and guardian presets come from the save's own lists, five at v29.2.
  - Battle reports read `totalVampires` and `healthFromDeathWaveThisRound`, show `gameTime` as a
    duration and health amounts compactly, add `dissonance`, never pass Death Wave hits off as
    kills, and no longer invent a `bountyCoins` of 0.
  - Relics resolve by their own index, so a gap in the catalog no longer shifts later names.
- **New readers.**
  - `readExportInfoFromSaveRoot`: build, data version, and every top-level field the SDK does not
    know, as a warning.
  - `readCurrenciesFromSaveRoot`, `readTournamentsFromSaveRoot`, `readEventsFromSaveRoot`,
    `readMilestonesFromSaveRoot`, `readGlobalPresetsFromSaveRoot`, `readTierRecordsFromSaveRoot`,
    `readModuleEconomyFromSaveRoot`, `readLifetimeBreakdownFromSaveRoot`,
    `readWorkshopUnlocksFromSaveRoot`, `readThemesFromSaveRoot`.
  - The guardian reader adds chip slot count, guild-gated `activeInBattle` and presets. The labs
    reader adds the completion log.

Game data:

- Relics 321-324, 326-329, 334 and 335 added. Six rarities, eleven premium/standard labels and
  four medal costs corrected. Relic totals are summed from the game's table.
- Tournament prizes: Platinum and Champion stones as v29.0.1 corrected them.
- Milestones: every cell of tiers 1-24 matches the game. Tiers 22-24 were almost entirely wrong;
  T23 W500 is the Primary Module Bonus labs.
- Workshop enhancements run to the game's caps: twelve at 600, Coin Bonus and Cells / Kill at 300,
  Orb Size 250, Free Upgrades 150, Attack Speed 100, Enemy Level Skips 60. The cost tables are
  read from the full ladders.
- Labs:
  - Card Presets is now Presets.
  - Swamp Rend - Additional Enemies has levels 10-11.
  - Lab unlocks match the game: Effect Bans, bot labs, Bot Bot Cooldown and Swamp Rend placements
    corrected; fleet labs and Global Presets added.
  - Card mastery values corrected; Standard Perk Bonus has 25 levels; the battle-condition
    reduction labs described as the opposite of what they do.
- Currency: ad gems are 6 a claim (60 a day), the daily gem is 20, the stone confirmation prompt
  is at 100, keys come from Legend 1-24 and Mythic, and the bits arithmetic is fixed.
- Enemies:
  - Shatter shards for Rare and Rare+ were swapped.
  - Boss reroll shards T2-T10 corrected.
  - Fleets pay at every tier and module shards by spawn wave.
  - A boss-and-fleet wave keeps both shard drops.
  - T22-24 battle conditions match the game.
  - Tier 1 has no Ranged before wave 21 (v29.2).
- Guardian ladders: Ally, Attack and Fetch were cut short.
- UWs, modules and themes:
  - UW and UW+ max levels; Smite caps at 100 hits per enemy.
  - Assist Multiplier stones run to 100%; module inventory cap 350.
  - Milestone skins T22-24, plus the theme items the bonus lists lacked.
  - Daily-mission rewards T10-13 and T22-24.
- Thorns against fleets are 15% of remaining health. A fleet's hits-to-kill is null (thorns
  never finish one) and `hitsToHalveFleet` is added. Mythic is a tournament option.

Knowledge:

- The version timeline has v29.0, v29.1 and v29.2 windows, so a claim read before the current
  build is flagged.
- Vault, footguns, survival, modules, meta-game, economy, labs, patch-notes, guardian and
  workshop claims are updated from v28 to v29.x with citations.
- `known-contradictions.json` states its provenance honestly.

**Fixes from a repository review.** Each has a regression test except the WASM entry, whose
suite only runs against a built module.

- `thetowersdk-mcp` now starts when launched through a symlink, which is how `npx` and pnpm run
  it. It compared the path as typed with the resolved one and exited silently.
- MCP: `oracle_traps`, `oracle_brief` and `oracle_search` use the library's scorer instead of a
  stale copy ("card levels" resolved to `module.level`). `list_exports`, `describe_schema`,
  `calc_chart` and `oracle_expand` no longer answer, or throw, for prototype keys such as
  `constructor`.
- `sumModuleCoinCostsBetween` / `sumModuleShardCostsBetween` clamp to the cost table instead of
  returning 0 for a target level past its end.
- Battle run records read the full suffix ladder case-sensitively: `Q` is no longer read as `q`,
  and `s`, `S`, `O`, `N`, `D` and `AA`-`AZ` no longer become 0.
- Effective Paths inputs no longer report `hasAssist` / `coreHasAssist` for an empty assist slot.
- `enemy.wave` accepts tiers up to `MAX_CAMPAIGN_TIER` instead of silently computing 19-24 as 18.
- Formatting: `formatTrimmedNumber(100.3, 0)` is `100`, not `1`; `formatMultiplier(0)` prints
  zero, not 1; a value that rounds to 1000 prints as `1K`; `formatRateWithNotation`
  returns `0` for a non-numeric duration.
- Wiki: a `-|` inside a tabber panel is kept; file names containing parentheses resolve; a bare
  `32px` is not used as alt text.
- `availableRarities` omits rarities whose substat value is blank; `clampLabRange` no longer
  returns a target above the lab cap.
- Uptime's Thunder Bot duration uses the bot ladder (5s + 0.5s per level) instead of an older
  whole-second formula. Awaiting in-game confirmation.
- WASM entry: `charts.list` returns usable ids and `charts.rows` accepts `args`.

## 0.12.1

**Release housekeeping.** Retired obsolete workbook and artwork-index generators, corrected
versioned vault reference notes, and updated contributor documentation. Runtime values and APIs
are unchanged.

## 0.12.0

**Breaking: lab tables use lab slugs.** Workshop table caches are keyed by `LabWorkshopSlug`,
including `labs_speed` and `common_enemy_health`. Resistance inputs are
`globalResistanceReduction` and `conditionResistanceReduction`. Implementation inventories
and formula-coverage labels are no longer exported.

**Released module support.** Sentry Protocol, Gilded Sniper, Tactical Barrage, Infinity Threshold
and all four Primary Module Bonus labs remain available. Reserved research positions stay in
the save catalog so later indices remain stable.

**Documentation.** The site builds against the SDK in this checkout. Copy controls report
permission failures, mobile navigation identifies the current page, and keyboard users can
skip to the main content. Page-specific search metadata, canonical URLs, a sitemap and structured
data improve discoverability; link-preview tags use the SDK logo.

**Synchronicity slots name their bots.** `readBotSynchronicityFromSaveRoot` now returns the
active preset's `slots` â€” the bot in each, or `null` â€” and the `bots` synced there, reading the
save's bot type through the bot catalog's `index` (0 Flame Bot to 4 Bot Bot). `synchronicityBots`
is by slot, not by bot. A slot value that names no bot is reported in `unrecognizedSlotValues`,
and `inSave` says whether the save carries synchronicity at all.

## 0.11.0

**Breaking: one website's plumbing is out of the package.** `thetowersdk/internal/*` is gone,
and so is everything else that described how one site stores and moves data rather than what
the game is: per-calculator local state, persisted settings schemas, the cross-page input hub,
save-import payloads, previews and merge rules, dropdown builders, perk preferences, lab menus,
number-format options and the misplaced-save warning. The facts those modules were built from
stay. The save readers are all still here, and `readPerkChoicesFromSaveRoot` returns
`SavePerkChoices`, exactly what the save holds.

**Breaking: `thetowersdk/data` no longer computes.** `estimateBotUptimeFraction` and the Bot Bot
amplification estimates are in `thetowersdk/mechanics`, as is the utility level-skip chance.
`MODULE_INFO_CATALOG` moved the other way, from the save catalogs into `data`.

**New entry point: `thetowersdk/calculators`.** The calculator registry is its own domain, and
its generated specs no longer reach into `knowledge`.

**Renames.** `TOOL_LAB_OVERVIEW_CATEGORY_ORDER` is `LAB_CATEGORY_NAMES`,
`isToolLabOverviewCategoryLabel` is `isLabCategoryName`, `VaultV29TrackerTarget` is
`VaultV29LevelTarget`, and `GUILD_SEASON_RELIC_TOKEN_COST` â€” a lookup, not a price â€” is
`GUILD_SEASON_RELIC_TOKEN_COST_BY_RARITY`.

**Breaking: deprecated aliases removed.** `BC_COUNTER_LAB_SLUGS`,
`CHAIN_THUNDER_LAB_MAX_FRACTION_PER_LEVEL`, `chainLightningPlusDamageFraction`,
`chainLightningPlusHpDamage`, `computeChainLightningPlusTotalHpDamage`,
`waveInfoEliteDoubleSpawnChancePct` and `HEAT_BC_INDEX_ELS_REDUCTION_NATIVE` each had a
replacement under its real name. `FLEET_ENEMY_LAB_BENEFIT_PER_LEVEL` held a placeholder value, and
`getTournamentEnemyLevelSkipHeatSubtract` returned 0 for every league because the game has no such
subtract.

**Synchronicity is read from the save.** `countBotSyncUnlocksFromSaveRoot` looked for two fields
the game never writes, so it returned 0 for every save and the stones-spent total left
synchronicity out. It now reads `synchronicityUnlocked` and `synchronicityLevel`, and
`readBotsFromSaveRoot` carries a `synchronicity` block. Slots are priced the way the game prices
them: 1500 to unlock, the first two slots free, 1500 for each after.

**`ordinaryCoinWeightAtWave(tier, wave)` is `ordinaryCoinWeightAtTier(tier)`.** The coin mix
depends on the tier alone, and the wave argument was never read.

**Project Funding** is named correctly, no longer counts twice, and is charted under Utility
Dissonance.

**Source layout.** Each folder's exported types live in its `types.ts`; tables transcribed from
the game are named `*.data.ts`; every module opens with a docblock saying what it is for;
unused modules have been removed.

## 0.10.1

**Bot tables pinned to the game's numbers**, including which four stats belong to which bot.
They are not the regular layout the save's twenty slots suggest.

**Bot stats are formulas with typed units** (`{ base, perLevel, maxLevel, unit }`) instead of
thirty-odd display strings each, so no consumer has to strip a suffix to get a number.

**Two card corrections reverted.** Death Ray and Energy Shield are back to the values the card
screen shows. The knowledge compartments now record why the stored benefit table misled.

## 0.10.0

**Breaking: one website's vocabulary is out of the public API.** Names built on "tracker", which
meant the pages of the site this package came from, now describe what they do.
`sharedToolsCatalog`, a route table for that site, is gone from `thetowersdk/data`.

**`data` and `save` are grouped into folders** by the rule `mechanics` already followed.

**Calculators and the MCP server work from an installed copy.** Both previously loaded only in the
monorepo. The generated specs imported tooling that does not ship, and the server required a file
the package excludes.

**Fixes.**

- `D`, `AB`, `AI` and every exact power like them can be printed again; `1e33` had printed as
  `1000N`.
- `contributions` and `save-decoder` resolve as entry points.
- A truncated save is explained rather than surfacing a `TypeError`.
- `DATA_TABLE_SCHEMAS` no longer claims to cover every table when it covered eleven of 138.

**Reproducible builds.** Generated artifacts no longer stamp the wall clock, so two releases of the
same source are byte-identical. Every tree in the package is mapped, and tests take a real save
from `TOWER_TEST_SAVE`.

## 0.9.0

**Community guides are credited by name.** `thetowersdk/contributions` now carries the guides the
knowledge graph draws its contextual claims from â€” minionek, McBlue, Evan, DrAudacious, ColbyJack,
Kitchen Salt, 1410c and NanaSeiYuri â€” each with the exact `ref` the graph cites it by, and a test
that checks the graph still cites it. A guide credited but unused would put someone's name on work
this package never took.

NanaSeiYuri's dissonance sheet is the one that states arithmetic rather than strategy, so the
package is checked against it: the +400% and +200% caps, the 5000-wave maximum, x13.40 and x7.20
with every tier maxed, and the rule that a tier is excluded from its own echo. All six agree.

**Counts corrected.** The site claimed 1,642 graph claims against 1,641, and 315 nodes beside 316.
Both are guarded.

**Docs.** A page on running the package from any language over WebAssembly, the client-side save
decoder written up properly, the Google service-account walkthrough moved to the spreadsheet docs
where it belongs, and a section on what `normalize` does with input nobody checked.

## 0.8.0

**Two new entry points.**

- **`thetowersdk/save-decoder`** â€” the save reader with no Node imports, for decoding
  `playerInfo.dat` in a browser tab. Gunzip comes from `DecompressionStream`; the NRBF reader is
  the same one `thetowersdk/node` uses. A save never has to leave the machine it is on.
- **`thetowersdk/contributions`** â€” the roster of whose work this package carries, as data, so a
  tool can render the credit it is actually using.

**Calculator labels are the game's.** Every builder field is now named the way the Run Tracker and
the community name it: `Enable Chrono Field (CF)`, `CF Reduction (%)`, `Defense Absolute Value`,
`Current Level`. The workshop picker offered `WSP_SUPER_CRIT_MULTI` and now offers `Super Crit
Mult`, read from the enhancement definitions the package already carries.

**Thorns is the calculator players use.** It asked for an enemy factor, a thorn multiplier and a
module benefit â€” parameters of a formula, none of which a player can read anywhere â€” and returned
damage per hit. It now takes base thorns, tier, plasma cannon and its mastery, the BC reduction
labs and Sharp Fortitude, and answers in hits to kill. `thornDamageOnHit` is unchanged in
`thetowersdk/mechanics` for a caller who has the formula's own inputs.

**The MCP scratchpad works outside this repository.** `sdk_sandbox_run` shelled out to a script in
the development monorepo, so for anyone who installed the package it was advertised and failed to
spawn. It is now built from what the package ships â€” `list`, `export`, `calc`, `format`, `decode` â€”
and the tools that genuinely need the monorepo are no longer advertised where they cannot run.

## 0.6.0

**Removed: `thetowersdk/inputs`.** It held the account-state shapes the Run Tracker's own pages
persist â€” hub merge helpers, storage compaction, per-page local-state schemas. That is one
website's plumbing, not a description of The Tower, and it does not belong in a package about the
game.

Nothing is lost. Every calculator already describes the inputs it takes:

```ts
import { CALCULATOR_BUILDERS } from 'thetowersdk/builders'

const calc = CALCULATOR_BUILDERS.find((entry) => entry.id === 'assist.stones')

calc.fields     // [{ key: 'currentLevel', label: 'Current level', kind: 'number', min: 0, max: 69 }, â€¦]
calc.defaults   // { currentLevel: 0, targetLevel: 10 }
calc.normalize  // whatever you have stored -> a complete, valid input record
calc.compute    // the result
```

That is the same guarantee â€” pass what you have, get back a complete record with defaults filled
in â€” for all fifteen calculators, described per calculator rather than as one shared blob.

Twelve entry points now. Everything else is unchanged.

## 0.5.4

Nine new entry points. Nothing was removed or renamed, so this is additive for anything already
on 0.5.2.

> **Skip 0.5.3.** It reached npm before any of this landed, carrying the 0.5.2 export set, and a
> published version cannot be replaced. Everything below ships as 0.5.4.

Enough to build a tool end to end without writing any of the plumbing:

- **`thetowersdk/builders`** â€” the calculators as data. Each one declares its
  fields, their units and their caps, so a UI, a bot command or a test can be
  generated from the same declaration rather than hand-written three times.
- **`thetowersdk/bot`** â€” `createTowerBot()` and `calculatorCommands()`, which
  turn every builder into a slash command. Transport-agnostic: it produces
  commands and replies, and never touches a Discord client.
- **`thetowersdk/sheets`** â€” a Google Sheets reader that knows the two ways a
  sheet lies to you. A spilled cell carries no formula, and the API truncates
  trailing empties, so a short row means "unknown", not "zero".
- **`thetowersdk/inputs`** â€” the shared input vocabulary the builders parse,
  including a decimal separator that follows the reader's locale.
- **`thetowersdk/assets`** â€” which image file is a given module or card. A
  module's file is named after its INITIALS and rarity (`Om Chip` at Epic is
  `epic_oc.png`), which is not guessable from its name. Every function returns
  `null` for something with no art, so a caller can tell that apart from a
  wrong path. The artwork itself is NOT in this package: it belongs to
  TechTree Games and ships separately.

Conventions that now hold across every calculator, because each was a real bug
first: a level past the end of a cost table is refused rather than priced at
zero, caps come from each curve rather than a shared constant, and any lookup
keyed by a name from a save, a sheet or a URL uses own-key access â€” `??` cannot
reject an inherited function.

And the game data that used to live in the consuming application.

- **`thetowersdk/charts`** â€” the shared chart registry, its data, and the links
  from each chart to the mechanics it documents. A chart is a view over game
  data, so its definition is game data.
- **`thetowersdk/knowledge`** â€” the Tower Oracle graph: mechanics, how they
  relate, and the specific ways each has been misread.

Moved into `thetowersdk/data` from `@tmrxjd/platform`, which now re-exports them
so existing consumers keep working:

- Relic unlock methods and the published bonus-total categories.
- Theme category definitions, the passive coin-bonus coefficients, and the full
  theme catalog. The formula string and the 169 per-item bonus literals are gone
  â€” both are derived from one rate per category now.
- Vault tree summaries, derived from the node lists rather than transcribed.
- Daily mission tier and weekly reward tables, with weekly totals derived from
  the rows they sum.
- The module pull simulator: pity counters, rarity rates, pool sizes, RNG walk.

`@tmrxjd/platform` depends on this version for `thetowersdk/charts` and
`thetowersdk/knowledge`; neither existed in 0.5.2.

## 0.5.2

Keep `node:fs` modules (repo-root, planner codegen, debug-graph session/trace, coverage
citations, graph tooling, builders) off the public `thetowersdk/mechanics` barrel so
browser bundlers do not crash when importing wave/EP formulas.

## 0.5.1

Stop shipping the monorepo docs-gen/doctor/kernel chain through `builders` so the
published package no longer requires `@tmrxjd/governance-engine` at install time.

## 0.5.0

Labs catalog refresh, card gem costs, Effective Paths economy stone mastery / UW cooldown helpers,
and the public graph surfaces (`ep-graph`, `sdk-graph`, `save-graph`, `debug-graph`, coverage,
planner-engine, mcp-contract).

Doctor / kernel / governance-adapter / registry / sandbox / docs-gen / lsp stay in the monorepo
source tree for AGS tooling but are **not** part of the published `thetowersdk/mechanics` barrel â€”
they need `@tmrxjd/governance-engine`, which is not a public npm dependency of this package.

## 0.4.1

`sharedToolsCatalog` gains an Effective Paths entry, so a consumer building links or a menu from the
catalog gets the tool rather than a gap.

README: a worked example of planning for a real player â€” what a config is versus levels, how to fill
a zero record from the candidate lists, and the fact that mapping a save onto them is the caller's
job rather than something this package does. The MCP section now lists the tools and says which two
change how an agent works: `plan_effective_path` and `wiki_page`.

## 0.4.0

### New entry point: `thetowersdk/wiki`

Converts the community wiki's Fandom wikitext to Markdown, and fetches a page:

```ts
import { fetchFandomPageAsMarkdown } from 'thetowersdk/wiki'

const markdown = await fetchFandomPageAsMarkdown('Cards')
```

Wiki text is CC-BY-SA and this package is MIT, so pages are fetched rather than bundled.

The MCP server gains `wiki_search` and `wiki_page`, so an agent can confirm how a mechanic behaves
instead of inferring it from a table. Set `TOWER_WIKI_DIR` to a directory of `slug.md` pages to serve
them offline; every response reports whether it came from `local`, `cache` or `fandom`.

### Every plan family validates its levels

`planEffectiveHealthPath`, `planEffectiveEconomyPath` and `planEffectiveRegenPath` now carry
`issues` alongside `steps` and `excluded`, as `planEffectiveDamagePath` already did. Each checks its
levels before planning and returns an empty path with a populated `issues` rather than computing
against a record it cannot use.

**This is additive for callers reading a plan, and a new field for anyone constructing one.** If you
destructure a plan result, `issues` is `EffectiveLevelsIssue[]` â€” `{ path, message }`.

Levels are held to completeness and finiteness, not magnitude. Negative and fractional levels are
accepted deliberately: the source sheet carries a negative stone level of its own.

### The planner refuses a baseline it cannot compute

`planPath` checked each candidate's value for finiteness but not the value it ranked them against.
With a non-finite baseline every ROI was `NaN`, `NaN > NaN` is false, and the first candidate
examined won every step â€” a path in declaration order presented as a recommendation. Those
candidates are now skipped as `unevaluable` and reported.

### Renames

- `mechanics/coverage.ts` â†’ `mechanics/formula-coverage.ts`. Same exports, unchanged. The deploy
  build of a consuming app rejects any file named `coverage.ts` as a test artefact.
- `EffectiveRegenLevels` and `ZERO_EFFECTIVE_REGEN_LEVELS` now live in
  `mechanics/effective-paths-regen-levels.ts`, matching where the damage and economy models keep
  theirs. Both are still re-exported from the planner, so no import needs to change.

## 0.3.1

58 label builders became formatters: `buildWorkshopStatFieldLabel` is now
`formatWorkshopStatFieldLabel`, and so on for every `build*Label` that takes one
argument and returns a string. Turning one value into words for a human to read
is formatting, not assembly.

Scoped deliberately. 64 exported `build*` take one argument and return a string,
but six of them build keys -- `buildTrackerRunFingerprint`,
`buildBattleRunDeduplicationKey` -- and a key is assembled, not formatted. Those
kept `build`.

## 0.3.0

Breaking. Every lab table moved, and 562 exported functions were renamed. If you
are on 0.2.0 the compiler will point at each one; the rules below say what to
rename them to.

### The lab catalog is one thing now

`generatedLabs` and `labs` are gone. `LAB_CATALOG` replaces both.

```ts
// before
import { generatedLabs, labs } from 'thetowersdk/data'
// after
import { LAB_CATALOG } from 'thetowersdk/data'
```

They were two files split by category with no overlap â€” 150 labs in one, 75 in
the other â€” and, worse, two units. `labs` stored cost pre-scaled with a
`currency` of B/T/q/Q, so `cost: 1.1` meant 1.1 quadrillion, while
`generatedLabs` stored coins. Nothing in the shape said which you had.

**`cost` is now absolute coins everywhere, and `currency` no longer exists.** A
lab that costs 1.1 quadrillion reads `1.1e15`, so two labs can be added together
without checking where either came from. If you were multiplying by a currency
factor, delete that. If you were formatting with the suffix, `formatCompact`
already renders `1.1q` on its own.

`value` moved from the level to the lab. It was identical on every level and
only the first was ever read. `unit` moved with it.

Six labs gained cost data they never had (the three enemy Health labs and Wave
Skip Mastery among them), and `super_tower_bonus` had 25 corrupt levels
corrected against the community Effective Paths tables.

### Verbs

One verb per idea. The retired ones and what they became:

| Was | Now | Why |
|---|---|---|
| `resolve*` | `get*`, `find*`, `compute*` | meant three different things |
| `derive*`, `extract*` | `read*`, `compute*` | reading a save vs calculating |
| `calculate*` | `compute*` | same thing, two words |
| `create*` | `build*` | same thing, two words |

`find*` returns `T \| null \| undefined`; `get*` always returns a value; `read*`
pulls structure out of a save or file; `compute*` calculates. The split was made
from return types read out of the compiler, not from guessing at names â€” 124 of
the 265 `resolve*` functions turned out to be doing arithmetic.

34 names also lost a redundant `From<Source>` tail, but only where no sibling
function differed by source: `readDissonanceCalculatorStateFromSaveRoot` is now
`readDissonanceCalculatorState`, while `readLabsFromSave` keeps its tail because
`readLabsFromReport` exists beside it.

The rules are in [`docs/NAMING.md`](docs/NAMING.md).

### Glossary

The 297 hand-curated community acronyms â€” what players actually type, `dmg+`,
`zerk`, `aspd+` â€” are merged in. The glossary goes from 233 entries to 500 and
covers all 297, asserted by a test.

Entries now carry `source`. `catalog` means the expansion names something in the
shipped data and is held to it; `community` means real player shorthand the
catalogs have no row for. An expansion that resolves to nothing and is not
marked `community` fails the build, so nothing can quietly become a claim about
the game.

`GC` now returns two entries â€” Galaxy Compressor from the module table and glass
cannon from the community â€” flagged ambiguous rather than the SDK picking one.

### Also

- `computeModuleStat` (was `calculateModuleStat`) is unchanged in behaviour;
  module stats were checked against the Effective Paths tables and all 60
  level-1 values agree.
- A guardian cooldown max level and a Death Wave stone cost were corrected.

## 0.2.0

Lab catalog consolidation, first cut. Superseded by 0.3.0 â€” prefer that.

## 0.1.1

Initial public release.
