import { describe, expect, it } from 'vitest'
import { WORKSHOP_DATA, WORKSHOP_STAT_UNITS, workshopGameValueAtLevel } from '../../src/data'
import { computeWorkshopScreenValue, WORKSHOP_SCREEN_FORMULA_BY_STAT } from '../../src/mechanics/workshop/screen-value'

/**
 * The unit of every workshop upgrade.
 *
 * The table is not in one unit, and the way to get a value wrong by ten or a hundred is to read a
 * row as if it were. These pin the game's own figures: what the Workshop screen showed for an
 * upgrade at a level, or, for the five it could not show, what the wiki states.
 */
const table = (stat: string, level: number): number =>
  (WORKSHOP_DATA as unknown as Record<string, Record<string, { value: number }>>)[stat][String(level)].value

const maxLevel = (stat: string): number =>
  Math.max(...Object.keys((WORKSHOP_DATA as unknown as Record<string, object>)[stat]).map(Number))

describe('every upgrade has a unit', () => {
  it('covers the whole table and nothing else', () => {
    expect(Object.keys(WORKSHOP_STAT_UNITS).sort()).toEqual(Object.keys(WORKSHOP_DATA).sort())
  })

  it('refuses an upgrade or a level the table does not have', () => {
    expect(workshopGameValueAtLevel('Nonsense', 0)).toBeNull()
    expect(workshopGameValueAtLevel('constructor', 0)).toBeNull()
    expect(workshopGameValueAtLevel('Health', -1)).toBeNull()
    expect(workshopGameValueAtLevel('Health', 0.5)).toBeNull()
    expect(workshopGameValueAtLevel('Health', 6001)).toBeNull()
  })
})

describe('the values the Workshop screen showed', () => {
  // On-screen text for upgrades whose row is the table alone, with no lab, relic, card or module
  // on the checked account (2026-11-24 and 2026-11-25).
  it.each([
    ['Enemy Attack Level Skip', 0, 0.0005, 'fraction'], // 0.05%
    ['Enemy Health Level Skip', 0, 0.0005, 'fraction'], // 0.05%
    ['Multishot Chance', 99, 0.495, 'fraction'], // 49.50%
    ['Rapid Fire Chance', 85, 0.34, 'fraction'], // 34.00%
    ['Bounce Shot Chance', 85, 0.68, 'fraction'], // 68.00%
    ['Lifesteal', 80, 0.0446, 'fraction'], // 4.46%
    ['Knockback Chance', 80, 0.8, 'fraction'], // 80.00%
    ['Land Mine Chance', 50, 0.3, 'fraction'], // 30.00%
    ['Death Defy', 75, 0.3, 'fraction'], // 30.00%
    ['Rapid Fire Duration', 99, 5.55, 'seconds'], // 5.55 sec
    ['Shockwave Frequency', 40, 14, 'seconds'], // 14.00s
    ['Bounce Shot Range', 52, 7.2, 'meters'], // 7.20m
    ['Range', 79, 69.5, 'meters'], // 69.50m
    ['Orbs', 4, 4, 'count'], // 4
    ['Land Mine Radius', 40, 1.3, 'amount'], // 1.30
    ['Max Recovery', 45, 2.85, 'multiplier'], // x2.85
  ] as const)('%s at level %i is %d, a %s', (stat, level, value, unit) => {
    const game = workshopGameValueAtLevel(stat, level)!
    expect(game.unit).toBe(unit)
    expect(game.value).toBeCloseTo(value, 4)
  })

  it('steps Enemy Level Skip by 0.05% a level, to 35%', () => {
    for (const stat of ['Enemy Attack Level Skip', 'Enemy Health Level Skip']) {
      const step = workshopGameValueAtLevel(stat, 1)!.value - workshopGameValueAtLevel(stat, 0)!.value
      expect(step * 100).toBeCloseTo(0.05, 6)
      expect(workshopGameValueAtLevel(stat, 699)!.value).toBeCloseTo(0.35, 6)
    }
  })

  it('agrees with the Workshop row for every upgrade the row is verified for', () => {
    // The screen value with nothing added is the workshop's own number as the screen prints it:
    // a fraction times 100, everything else unchanged. These are two independent tables, one of
    // formulas and one of units, and this is where they have to meet.
    const checked: string[] = []
    for (const stat of Object.keys(WORKSHOP_SCREEN_FORMULA_BY_STAT)) {
      for (const level of [0, 1, maxLevel(stat)]) {
        const game = workshopGameValueAtLevel(stat, level)!
        const row = computeWorkshopScreenValue({ stat, level })!
        expect(row.value, `${stat} L${level}`).toBeCloseTo(game.unit === 'fraction' ? game.value * 100 : game.value, 9)
        expect(row.unit, stat).toBe(game.unit === 'fraction' ? 'percent' : game.unit)
      }
      checked.push(stat)
    }
    expect(checked.length).toBeGreaterThanOrEqual(41)
  })
})

describe('the five the screen could not show', () => {
  it('takes the wiki\'s figures for Rend Armor, the Wall and Knockback Force', () => {
    // Rend Armor Chance: 0.10% a level, from 0.10% to 30.00%.
    expect(workshopGameValueAtLevel('Rend Armor Chance', 0)!.value).toBeCloseTo(0.001, 9)
    expect(workshopGameValueAtLevel('Rend Armor Chance', 299)).toEqual({ value: expect.closeTo(0.3, 6), unit: 'fraction' })
    // Rend Armor Mult: 0.0010X to 0.3000X.
    expect(workshopGameValueAtLevel('Rend Armor Mult', 0)).toEqual({ value: expect.closeTo(0.001, 9), unit: 'multiplier' })
    expect(workshopGameValueAtLevel('Rend Armor Mult', 299)!.value).toBeCloseTo(0.3, 6)
    // Wall Health: 20% of tower health, 0.1% a level, to 200.00%.
    expect(workshopGameValueAtLevel('Wall Health', 0)).toEqual({ value: expect.closeTo(0.2, 9), unit: 'fraction' })
    expect(workshopGameValueAtLevel('Wall Health', 1800)!.value).toBeCloseTo(2, 6)
    // Wall Rebuild: 2 seconds less a level, to 600 seconds.
    expect(workshopGameValueAtLevel('Wall Rebuild', 0)).toEqual({ value: 1200, unit: 'seconds' })
    expect(workshopGameValueAtLevel('Wall Rebuild', 300)!.value).toBe(600)
    // Knockback Force: base 0.4, maximum 6.08, no unit.
    expect(workshopGameValueAtLevel('Knockback Force', 0)).toEqual({ value: expect.closeTo(0.4, 6), unit: 'unitless' })
    expect(workshopGameValueAtLevel('Knockback Force', 40)!.value).toBeCloseTo(6.08, 6)
  })

  it('marks them as taken from the wiki', () => {
    const fromWiki = Object.entries(WORKSHOP_STAT_UNITS).filter(([, unit]) => unit.source === 'wiki').map(([stat]) => stat)
    expect(fromWiki.sort()).toEqual(['Knockback Force', 'Rend Armor Chance', 'Rend Armor Mult', 'Wall Health', 'Wall Rebuild'])
  })

  it('leaves a raw table number reachable for the formulas that want one', () => {
    expect(table('Damage / Meter', 118)).toBeCloseTo(42.6, 4)
    expect(workshopGameValueAtLevel('Damage / Meter', 118)).toEqual({ value: expect.closeTo(1.0426, 6), unit: 'multiplier' })
    expect(table('Land Mine Damage', 70)).toBe(800)
    expect(workshopGameValueAtLevel('Land Mine Damage', 70)).toEqual({ value: 8, unit: 'multiplier' })
  })
})
