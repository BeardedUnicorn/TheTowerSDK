# Migration guide

What breaks at each major version of `@beardedunicorn/thetowersdk`, and what to change in your code.

Find the version you are on and apply every section from there to the top of the list, oldest
first. Each section covers one step, so going from 1.x to 3.x means doing "1.x to 2.0" and then
"2.x to 3.0".

| From | To | Released | What breaks |
| --- | --- | --- | --- |
| [2.x](#2x-to-30) | 3.0 | 2026-11-27 | The resource-drops coin simulation returns different totals. |
| [1.x](#1x-to-20) | 2.0 | 2026-11-26 | `workshopStatValue` answers in the game's units, the workshop damage and health regen curves and the Level Skip price return different numbers, and four calculator ids moved. |
| [0.x](#0x-to-10) | 1.0 | 2026-11-20 | The package is renamed, three labs are gone from `LAB_CATALOG`, several save readers changed what they return, and the MCP server reports failures as errors. |

No major version so far has removed an entry point, changed the `exports` map, renamed the
`thetowersdk-mcp` binary or raised the Node requirement (Node 22 or later throughout). Every break
after 1.0 is a function that returns a different number, so nothing fails to compile. Read the
"How to check" part of each section.

This guide covers breaking changes only. Features and fixes are in [CHANGELOG.md](CHANGELOG.md).

## 2.x to 3.0

### What changed

The coin simulation under `mechanics/resource-drops` was corrected against one account's run
records, in two ways:

- **Kill coins no longer multiply by the wave.** A kill pays its enemy's base coins at any wave.
  Kill coins are far lower than before, and the gap grows with depth.
- **Every skipped wave spawns nothing**, the first wave of a skip chain included. Kills are fewer,
  and the share of coins credited to Wave Skip is higher.

The functions that return different numbers are `simulateResourceDropsCoins`,
`simulateWaveCoinRows`, `accumulateWaveCoin`, `accumulateWaveEcon`, and anything built on them. No
signature changed.

The same input, a tier 1 account with nothing upgraded, on 2.1.0 and on 3.0.0:

| `simulateResourceDropsCoins` | wave 500, 2.x | wave 500, 3.0 | wave 3000, 2.x | wave 3000, 3.0 |
| --- | --- | --- | --- | --- |
| `coins.coinsFromKills` | 1,646,144 | 4,499 | 196,213,660 | 101,330 |
| `coins.coinsFromKillsWaveSkipBonus` | 38,134 | 554 | 4,570,994 | 12,522 |
| `coins.coinsFromWavePayout` | 563 | 517 | 3,379 | 3,105 |
| `coins.coinsFromWavePayoutWaveSkipBonus` | 13 | 64 | 79 | 384 |
| `coins.totalCoins` | 1,685,003 | 5,634 | 200,805,827 | 117,351 |
| `accumulateWaveEcon(...).expectedKills` | 17,737 | 16,301 | 399,496 | 367,138 |

### Who is affected

Anyone who reads an absolute coin or kill total from these functions: a coins-per-hour estimate, a
stored baseline, a snapshot test, or a chart drawn from `simulateWaveCoinRows`. Cells and shards
per run move slightly too, because fewer waves spawn enemies.

Code that only compares two runs of the simulation (does this upgrade earn more than that one) keeps
working, but the size of the difference changes, so re-check any threshold you tuned.

### How to migrate

1. **Throw away stored totals.** A number saved from 2.x cannot be compared with one from 3.0.
   Recompute baselines, and regenerate snapshot tests after checking the new values make sense.
2. **Remove any correction you added for the old inflation.** If you divided the result by a
   factor to bring it near an account's real income, delete that factor.
3. **Feed it the account's own measurements where you have them.** Three optional inputs on
   `ResourceDropsCoinSimulationInput` replace model estimates with figures taken from run records:

   ```ts
   import { simulateResourceDropsCoins } from '@beardedunicorn/thetowersdk/mechanics'

   const result = simulateResourceDropsCoins({
     ...input,
     // Base coins an ordinary kill pays on average, from the account's kill counts.
     ordinaryCoinWeight: measuredCoinWeight,
     // Recorded kills divided by modelled kills for a run of this depth. Omitted, it is 1.
     ordinaryKillScale: measuredKillScale,
     // Share of a run's enemies destroyed inside each coin window.
     coinWindowShares: measuredWindowShares,
   })
   ```

   All three are optional. Leaving them out gives the tier's spawn chances and the uptime model,
   as before.

4. **For a whole account, consider the planning tools instead.** 3.0 adds `planSpendingFromSave`
   in `@beardedunicorn/thetowersdk/save` and the `plan_spending` MCP tool, which forecast income
   from the account's recorded runs, not from the simulation. If you used the simulation to answer
   "how many coins will this account earn", that is the better source.

### How to check

Run your own input through `simulateResourceDropsCoins` at two depths and compare
`coins.coinsFromKills`. In the table above, going from wave 500 to wave 3000 multiplied it by 119
on 2.x and by 23 on 3.0.

## 1.x to 2.0

Two commits made 2.0, both in the workshop. Everything here is exported from
`@beardedunicorn/thetowersdk/mechanics` unless it says otherwise.

### `workshopStatValue` returns the game's value and names the unit

In 1.x it answered in the units of the Effective Paths sheet and did not say so. For most upgrades
the sheet and the game agree. For six they do not, and the 1.x number read as the game's was wrong
by a factor of ten or a hundred.

The result gains a `unit` field (`fraction`, `multiplier`, `amount` and so on; the full list is
`WORKSHOP_STAT_UNITS` in `@beardedunicorn/thetowersdk/data`). A `fraction` is a chance where 1 is
100%.

| Upgrade, level | 1.x `value` | 2.0 `value` | 2.0 `unit` | As the game shows it |
| --- | --- | --- | --- | --- |
| Enemy Attack Level Skip, 0 (Health Level Skip is the same) | 0.005 | 0.0005 | `fraction` | 0.05% |
| Recovery Amount, 35 | 0.0028 | 0.28 | `fraction` | 28% |
| Lifesteal, 10 | 0.9296 | 0.009296 | `fraction` | 0.93% |
| Land Mine Damage, 10 | 200 | 2 | `multiplier` | x2 |
| Damage / Meter, 10 | 7.4177 | 1.0074 | `multiplier` | x1.0074 |
| Cash Bonus, 10 | `null` | 1.1 | `multiplier` | x1.1 |
| Health, 10 | 83.63 | 83.63 | `amount` | unchanged |

Eight upgrades returned `null` in 1.x and now return a value: Cash Bonus, Coins / Kill Bonus,
Knockback Force, Land Mine Chance, Rend Armor Chance, Shockwave Frequency, Wall Rebuild and Bounce
Shot Range. `null` now means only an unknown upgrade or a level the table has no row for.

The five upgrades the eHP model reads (Health, Defense Absolute, Defense Percent, Wall Health, Max
Recovery) are unchanged.

**How to migrate**

- Remove any conversion you applied to the six upgrades in the table. If you multiplied Recovery
  Amount by 100 or divided Level Skip by 10 to match the game, that now double-corrects.
- Read `unit` when you format the value, and stop inferring the unit from the upgrade's name.

  ```ts
  import { workshopStatValue } from '@beardedunicorn/thetowersdk/mechanics'

  const skip = workshopStatValue('Enemy Attack Level Skip', 0)
  // 1.x: { value: 0.005, coinCost: 300000000, cashCost: 240 }
  // 2.0: { value: 0.0005, unit: 'fraction', coinCost: 300000000, cashCost: 240 }

  if (skip?.unit === 'fraction') console.log(`${(skip.value * 100).toFixed(2)}%`) // 0.05%
  ```

- If you treated `null` as "this upgrade has no sheet value", that test no longer picks out those
  eight upgrades. Use `WORKSHOP_STATS_DIVERGING_FROM_SHEET` and `WORKSHOP_STATS_ABSENT_FROM_SHEET`,
  which still list them.
- **If you fed the Damage / Meter value to the eDamage model**, it expects the table's stored
  number, which is what 1.x returned. Read it from the table:

  ```ts
  import { WORKSHOP_DATA } from '@beardedunicorn/thetowersdk/data'

  const damagePerMeter = WORKSHOP_DATA['Damage / Meter']['10'].value // 7.417732716, as in 1.x
  ```

### `standardElsCoinUpgradeCost` reads the row being left

A workshop row's `coins` buys the next level. 1.x read the row after the one that carries the
price, so every answer was one level too expensive.

| `standardElsCoinUpgradeCost('Enemy Attack Level Skip', 0, discount)` | 1.x | 2.0 |
| --- | --- | --- |
| no discount | 316,000,004 | 300,000,000 |
| 15% utility discount | 268,600,003 | 255,000,000 |

**How to migrate.** If you passed `fromLevel - 1` to get the price the game shows, pass `fromLevel`.
If you summed a range of levels, the range now starts one row earlier and the total is lower. To
price several levels at once the way the buy multiplier does, 2.0 adds
`computeWorkshopUpgradePrice` in `@beardedunicorn/thetowersdk/data`.

### The workshop damage and health regen curves match the game's table

These functions return different numbers, the ones `WORKSHOP_DATA` has:

- `workshopDamageCurve` and `getOutOfRoundDamagePreview`
- `healthRegenCurve`, `healthRegenTier249`, `healthRegenTier499`, `healthRegenTier5k` and
  `getOutOfRoundHealthRegenPreview`

| Call | 1.x | 2.0 |
| --- | --- | --- |
| `workshopDamageCurve(100)` | 283.01 | 1,053 |
| `workshopDamageCurve(3000)` | 1,647,403 | 2,340,394 |
| `healthRegenCurve(100)` | 4.396 | 269.11 |
| `healthRegenCurve(1000)` | 322,313 | 1,115,341 |

Five exported constants changed value with the formulas:

| Constant | 1.x | 2.0 |
| --- | --- | --- |
| `WORKSHOP_DAMAGE_QUAD_COEFF` | `1e-6` | `0.077` |
| `HEALTH_REGEN_TIER249_EXP` | `2.39` | `2.25` |
| `HEALTH_REGEN_TIER249_COEFF` | `0.0045` | `0.02` |
| `HEALTH_REGEN_TIER499_COEFF` | `0.004` | `0.02` |
| `HEALTH_REGEN_TIER5K_EXP` | `1.0024` | `Math.fround(1.0024)` |

**How to migrate.** There is nothing to rename. Remove any correction you applied to bring the 1.x
curves up to the table, recompute anything stored from them, and if you copied one of the constants
into your own formula, copy the new formula too: the health regen terms changed shape, not only
their coefficients. `workshopDamageAtLevel` already gave the table's value in 1.x and is unchanged.

### Four calculator ids moved

This affects `runCalculator` in `@beardedunicorn/thetowersdk/calculators` and the `calc_run`,
`calc_describe` and `calc_graph` MCP tools. An old id throws `CalculatorError` ("no calculator").

| 1.x id | 2.0 id |
| --- | --- |
| `mechanics.workshopStatValue` | `workshop.statValue` |
| `mechanics.standardElsCoinUpgradeCost` | `workshop.levelSkipNextLevelPrice` |
| `mechanics.getWorkshopUtilityLevelSkipChance` | `workshop.levelSkipChance` |
| `data.computeWorkshopStatNumericValueAtLevel` | `workshop.tableValue` |

```ts
import { runCalculator } from '@beardedunicorn/thetowersdk/calculators'

// 1.x
runCalculator('mechanics.workshopStatValue', { stat: 'Recovery Amount', level: 35 })
// 2.0
runCalculator('workshop.statValue', { stat: 'Recovery Amount', level: 35 })
// value: { value: 0.28, unit: 'fraction', coinCost: 3392880, cashCost: 9801 }
```

The functions themselves kept their names and entry points. Only the calculator ids moved.

### How to check

Three assertions that pass on 2.0 and fail on 1.x:

```ts
import { healthRegenCurve, standardElsCoinUpgradeCost, workshopStatValue } from '@beardedunicorn/thetowersdk/mechanics'

workshopStatValue('Recovery Amount', 35)?.value // 0.28
standardElsCoinUpgradeCost('Enemy Attack Level Skip', 0, 15) // 255000000
Math.round(healthRegenCurve(100)) // 269
```

## 0.x to 1.0

Versions below 1.0.0 were published upstream as `thetowersdk`, where the version was a build marker
and not a compatibility promise. 1.0.0 is the first release of this fork. This section starts from
upstream 0.12.x. For breaks between earlier 0.x versions (0.12.0 keyed the lab tables by lab slug,
for one), see their entries in [CHANGELOG.md](CHANGELOG.md).

### The package is renamed

```bash
npm uninstall thetowersdk
```

```bash
npm install @beardedunicorn/thetowersdk
```

Every import specifier takes the new name. The entry points after the slash are the same.

```ts
// 0.x
import { LAB_CATALOG } from 'thetowersdk/data'
// 1.0
import { LAB_CATALOG } from '@beardedunicorn/thetowersdk/data'
```

A search for `'thetowersdk` and `"thetowersdk` across your source finds them all. The MCP binary is
still `thetowersdk-mcp`. An MCP client configuration that points at the server file changes its
path to `./node_modules/@beardedunicorn/thetowersdk/mcp/server.mjs`.

### Catalog rows removed or renumbered

- **`LAB_CATALOG` has 231 labs, down from 234.** `ray_enemy_defense`, `scatter_enemy_defense` and
  `vampire_enemy_defense` are gone: the game has no such labs, and the rows were copies of the
  Health labs. Remove any lookup of those three slugs. `labCoinsRemaining` with nothing researched
  is 3.49e20 coins lower as a result.
- **`THEME_CATALOG` (in `@beardedunicorn/thetowersdk/save`) song rows 6 and 7 name different tracks.** "Krisu - Oceans Sings" moved from 6
  to 4 and "Krisu - Hiding in Himalaya" from 7 to 5. Rows 6 and 7 are now "Krisu - The Ethereal and
  I" and "Krisu - Embrace Oblivion". If you stored a song by index, re-map it. A save with track 6
  or 7 unlocked reports the new names.
- **Index 0 ("Default") exists** for tower, background, menu and profile banner themes. Code that
  assumed the first row is index 1 needs to allow for it.

### Save readers that changed what they return

No reader was renamed. These return a different value for the same save, and each was a misread in
0.x:

- **Tier-indexed lists** (`highestWaveThisTier`, `highestWavePerTierThisCycle`) read slot 7 as tier 7. Highest tier and the Echo-lab unlock were one tier high in 0.x. Remove any `- 1` you added.
- **The per-cycle wave table** is one wave per tier, not four dissonance types.
- **Lab time remaining** uses the game's own finish date. The estimate was about twice as long in 0.x.
- **Module shard, reroll and lifetime dice balances** read the `_v2` keys that game v29.2 writes.
- **Locked, empty assist slots** are no longer reported as equipped modules, and banned perks no longer include `-1`.
- **Battle reports** no longer carry a `bountyCoins` of 0 that the save never held, no longer count Death Wave hits as kills, and show `gameTime` as a duration. Treat `bountyCoins` as possibly absent.
- **Run records** read the number suffixes case-sensitively: `Q` is no longer read as `q`, and `s`, `S`, `O`, `N`, `D` and `AA` to `AZ` no longer become 0.
- **Relics** resolve by their own index, so a gap in the catalog no longer shifts later names.

If you corrected any of these yourself, remove the correction.

### Mechanics and data that return different values

- **Thorns against a fleet** is 15% of remaining health. A fleet's hits-to-kill is `null`, because
  thorns never finish one. Handle `null`, and use the new `hitsToHalveFleet` if you need a count.
- **Labs Speed and Labs Coin Discount** carry base costs and times in `LAB_CATALOG`. In 0.x their
  own bonus was already taken off, so the SDK's modifiers took it off twice. If you added the bonus
  back by hand, stop.
- **`sumModuleCoinCostsBetween` and `sumModuleShardCostsBetween`** clamp to the cost table. They
  returned 0 for a target level past its end.
- **`enemy.wave`** accepts tiers up to `MAX_CAMPAIGN_TIER`. It computed tiers 19 to 24 as 18.
- **Formatting:** `formatTrimmedNumber(100.3, 0)` is `100`, not `1`. `formatMultiplier(0)` prints
  zero, not 1. A value that rounds to 1000 prints as `1K`.
- **`LAB_CATALOG` agrees with the game at every level of 180 labs.** 1186 levels of 65 labs changed
  by more than rounding, along with tier 19 to 24 battle conditions, milestones for tiers 22 to 24
  and several relic rows. Regenerate anything you cached or snapshot-tested from the catalogs. The
  1.0.0 changelog entry lists each correction.

### `runCalculator` rejects unknown option keys

`runCalculator` in `@beardedunicorn/thetowersdk/calculators` throws `CalculatorError` for a key an
options parameter does not declare. In 0.x a misspelled key was ignored and the calculator ran
without it: `lab.coinCost` with `modifiers: { coinDiscountLevel: 43 }` returned the undiscounted
price. The real key is `coinDiscountLabLevel`. Fix the key names the error reports. The declared
keys are in each calculator's `fields`.

### MCP server: what clients receive

If you call the MCP server from your own client code:

- **A failed call sets `isError`.** An answer carrying `error`, or `ok: false`, was sent as a
  success in 0.x. Check `isError`, not the body.
- **Arguments are checked against the tool's schema** before it runs, and a missing or mistyped
  argument is refused by name. `calc_run` also refuses an argument sent beside `args`.
- **Tool descriptions are sent whole.** They were cut to 180 characters. Set `TOWER_MCP_COMPACT=1`
  to get the short ones back.
- **Results are compact JSON**, and a `NaN` or `Infinity` in a result is named in a second text
  block.
- **`run_extractor` and `get_export` previews stop at 12,000 characters.** A value too large to
  show is described by its count and columns and named in `outlined`. To read it in full, use
  `read_save_field` or `find_rows`, which page.
- **`plan_effective_path`** refuses `family: "constructor"` and caps `steps` at 200.
- **Notes and the ledger** are written under the directory the server was started in.

### Repository scripts

Only if you run the repository's own tooling: `patch-notes:ingest` reads the bot token from
`DISCORD_TOKEN` (the shell, or a gitignored `.env` at the package root). The `--bot` flag is gone.

### How to check

- A search of your project for `from 'thetowersdk` finds nothing.
- `LAB_CATALOG.length` is 231 on 1.0.0. Later versions may add labs.
- A failing MCP call, such as `run_extractor` with an unknown name, comes back with `isError: true`.

## Adding a section

`CHANGELOG.md` is written by the release workflow. This file is written by hand. Both ship in the
npm package. A pull request
whose commit is marked `!` or carries a `BREAKING CHANGE:` footer adds its section here, at the top
of the sections and the top of the table, with:

- what changed and which exports it touches;
- who is affected;
- what to change, with a before and after taken from the code at both versions;
- a value a reader can assert to confirm they are on the new behavior.
