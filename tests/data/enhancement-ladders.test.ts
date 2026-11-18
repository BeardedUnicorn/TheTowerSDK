import { describe, expect, it } from 'vitest'
import {
  computeWorkshopEnhancementMaxLevel,
  getWorkshopEnhancementDefinitions,
} from '../../src/data'

/**
 * Every enhancement ladder is the length the game says it is.
 *
 * `oracle_traps('workshop')` is emphatic about this one:
 *
 *   "400 LEVELS IS NOT UNIVERSAL. Eleven of the eighteen run to 400, but Cash Bonus stops at 300,
 *   Orb Size / Coin Bonus / Cells per Kill at 200, Free Upgrades at 100, Attack Speed at 75 and
 *   Enemy Level Skip at 60. Pricing every enhancement on the Damage ladder — the one the wiki
 *   documents — overstates seven of them badly."
 *
 * Seven of eighteen wrong is not a rounding error, it is a plan that buys levels that do not
 * exist. The expected values below come from the oracle rather than from the cost tables, so this
 * compares two independent sources: if `costs.ts` is ever trimmed or extended, this notices
 * instead of agreeing with itself.
 *
 * The `+ 1` in the implementation is not an off-by-one. Cost tables index from 0, so a table whose
 * last index is 99 prices 100 levels.
 *
 * The ladder lengths are game data v29.2.0 (facts/v29.2.0/workshop-enhancement-caps.json); the
 * oracle trap states the same figures. They were 400/300/200/100/75/60 before v28.3.
 */

/** Ladder length per enhancement, as game data v29.2.0 and `oracle_traps('workshop')` state it. */
const ORACLE_LADDER_BY_KEY: Readonly<Record<string, number>> = {
  WSP_DAMAGE: 600,
  WSP_REND_ARMOR: 600,
  WSP_CRITICAL_FACTOR: 600,
  WSP_DAMAGE_PER_METER: 600,
  WSP_SUPER_CRIT_MULTI: 600,
  WSP_HEALTH: 600,
  WSP_HEALTH_REGEN: 600,
  WSP_DEFENSE_ABSOLUTE: 600,
  WSP_LAND_MINE_DAMAGE: 600,
  WSP_WALL_HEALTH: 600,
  WSP_RECOVERY_PACKAGE: 600,
  WSP_CASH_BONUS: 600,
  WSP_ORB_SIZE: 250,
  WSP_COIN_BONUS: 300,
  WSP_CELLS_PER_KILL_BONUS: 300,
  WSP_FREE_UPGRADES: 150,
  WSP_ATTACK_SPEED: 100,
  WSP_ENEMY_LEVEL_SKIP: 60,
}

describe('workshop enhancement ladders', () => {
  const definitions = getWorkshopEnhancementDefinitions()

  it('has exactly the eighteen the oracle describes, by key', () => {
    expect(definitions.length).toBe(18)
    expect(definitions.map(d => d.key).sort()).toEqual(Object.keys(ORACLE_LADDER_BY_KEY).sort())
  })

  it('gives every enhancement the ladder length the oracle states', () => {
    const wrong: string[] = []
    for (const definition of definitions) {
      const expected = ORACLE_LADDER_BY_KEY[definition.key]
      const actual = computeWorkshopEnhancementMaxLevel(definition.key)
      if (actual !== expected) wrong.push(`${definition.key}: oracle ${expected}, computed ${actual}`)
    }
    expect(wrong).toEqual([])
  })

  it('keeps the twelve-at-600 majority from swallowing the other six', () => {
    /*
     * The specific failure the oracle warns about: pricing everything on the Damage ladder. If a
     * change ever made these uniform, the test above would still be comparing against this file's
     * own table — so this asserts the SPREAD exists, independently of the values.
     */
    const lengths = definitions.map(d => computeWorkshopEnhancementMaxLevel(d.key))
    expect(new Set(lengths).size).toBe(6)
    expect(Math.min(...lengths)).toBe(60)
    expect(Math.max(...lengths)).toBe(600)
    expect(lengths.filter(length => length === 600)).toHaveLength(12)
  })

  it('resolves the second spelling of the cells-per-kill key', () => {
    expect(computeWorkshopEnhancementMaxLevel('cells_per_kill_bonus'))
      .toBe(computeWorkshopEnhancementMaxLevel('WSP_CELLS_PER_KILL_BONUS'))
  })
})
