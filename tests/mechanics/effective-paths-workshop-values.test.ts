import { describe, expect, it } from 'vitest'
import fixtures from '../../fixtures/mechanics/effective-paths-workshop-values.fixtures.json'
import {
  EFFECTIVE_HEALTH_WORKSHOP_STATS,
  WORKSHOP_STAT_MAPPINGS,
  WORKSHOP_STATS_ABSENT_FROM_SHEET,
  WORKSHOP_STATS_DIVERGING_FROM_SHEET,
  workshopStatMaxLevel,
  workshopStatsWithSheetMapping,
  workshopStatValue,
} from '../../src/mechanics/effective-paths/workshop-values'
import { getWorkshopUtilityLevelSkipChance } from '../../src/mechanics/workshop/utility-stats'
import { WORKSHOP_DATA } from '../../src/data/workshop/table'
import { workshopGameValueAtLevel } from '../../src/data/workshop/units'

/** The table's own number, which is what the sheet's ratio is measured against. */
const table = (stat: string, level: number): number =>
  (WORKSHOP_DATA as unknown as Record<string, Record<string, { value: number }>>)[stat][String(level)].value

/**
 * The sheet's units, as a record.
 *
 * Every sample was read from the live spreadsheet's `DVT_WS_VALUE`. The mapping says how a stat is
 * spelled there and what the table's number must be divided by to get the sheet's.
 */
describe('the mapping against the sheet', () => {
  it('turns every sampled table value into the sheet\'s', () => {
    const mismatches: string[] = []
    let checked = 0

    for (const sample of fixtures.samples) {
      const mapping = (WORKSHOP_STAT_MAPPINGS as Record<string, { sheetName: string, scale: number }>)[sample.sdkKey]
      // Samples cover every spelling probed, including ones that turned out to
      // be wrong; only compare the mapping we settled on.
      if (!mapping || mapping.sheetName !== sample.sheetName) continue
      checked++

      const sheet = table(sample.sdkKey, sample.level) / mapping.scale
      const scale = Math.max(Math.abs(sample.sheetValue), 1e-12)
      // Stored as float32, so the agreement is to about seven digits, not full
      // double precision.
      if (Math.abs(sheet - sample.sheetValue) / scale > 1e-6) {
        mismatches.push(`${sample.sdkKey} L${sample.level}: sheet=${sample.sheetValue} mapped=${sheet}`)
      }
    }

    expect(mismatches).toEqual([])
    expect(checked).toBeGreaterThan(100)
  })

  it('keeps the diverging stats out of the mapping entirely', () => {
    for (const stat of WORKSHOP_STATS_DIVERGING_FROM_SHEET) {
      expect(WORKSHOP_STAT_MAPPINGS[stat], stat).toBeUndefined()
    }
    for (const stat of WORKSHOP_STATS_ABSENT_FROM_SHEET) {
      expect(WORKSHOP_STAT_MAPPINGS[stat], stat).toBeUndefined()
    }
    expect(WORKSHOP_STATS_DIVERGING_FROM_SHEET).toHaveLength(7)
  })
})

/**
 * What `workshopStatValue` returns is the game's value, not the sheet's.
 *
 * The expected numbers here are the Workshop screen's (2026-11-24 and 2026-11-25) and the wiki's,
 * never the sheet's, because the sheet is what was wrong.
 */
describe('workshop values in the game\'s units', () => {
  it('gives Enemy Level Skip as the 0.05% a level the Workshop shows, not the sheet\'s 0.5%', () => {
    for (const stat of ['Enemy Attack Level Skip', 'Enemy Health Level Skip']) {
      // Level 0 showed 0.05% on screen.
      expect(workshopStatValue(stat, 0)).toMatchObject({ value: expect.closeTo(0.0005, 9), unit: 'fraction' })
      expect(workshopStatValue(stat, 1)!.value - workshopStatValue(stat, 0)!.value).toBeCloseTo(0.0005, 9)
      expect(workshopStatValue(stat, 699)!.value).toBeCloseTo(0.35, 6)
      expect(workshopStatValue(stat, 1)!.value).toBeCloseTo(getWorkshopUtilityLevelSkipChance(stat, 1)!, 9)
    }
    // The sheet has ten times that, which is the number this used to return.
    const sheet = fixtures.samples.find(sample => sample.sdkKey === 'Enemy Attack Level Skip' && sample.level === 1)!
    expect(sheet.sheetValue).toBe(0.01)
    expect(workshopStatValue('Enemy Attack Level Skip', 1)!.value).toBeCloseTo(sheet.sheetValue / 10, 9)
  })

  it('gives Recovery Amount as a share of health, not a hundredth of one', () => {
    // 28% from the workshop at level 35 (the screen's 30.24% has the relics on top), 134% at 300.
    expect(workshopStatValue('Recovery Amount', 35)).toMatchObject({ value: expect.closeTo(0.28, 9), unit: 'fraction' })
    expect(workshopStatValue('Recovery Amount', 300)!.value).toBeCloseTo(1.34, 9)
  })

  it('gives every percentage as a fraction and every multiplier as the number after the x', () => {
    expect(workshopStatValue('Lifesteal', 80)).toMatchObject({ value: expect.closeTo(0.0446, 4), unit: 'fraction' }) // 4.46%
    expect(workshopStatValue('Package Chance', 60)).toMatchObject({ value: expect.closeTo(0.3, 6), unit: 'fraction' })
    expect(workshopStatValue('Land Mine Damage', 70)).toMatchObject({ value: 8, unit: 'multiplier' })
    expect(workshopStatValue('Damage / Meter', 118)).toMatchObject({ value: expect.closeTo(1.0426, 6), unit: 'multiplier' })
    expect(workshopStatValue('Cash Bonus', 149)).toMatchObject({ value: 2.49, unit: 'multiplier' })
    expect(workshopStatValue('Range', 79)).toMatchObject({ value: expect.closeTo(69.5, 4), unit: 'meters' }) // 69.50m
    expect(workshopStatValue('Shockwave Frequency', 40)).toMatchObject({ value: 14, unit: 'seconds' }) // 14.00s
  })

  it('answers for all forty-eight upgrades, the sheet\'s seven strays included', () => {
    for (const stat of Object.keys(WORKSHOP_DATA)) {
      expect(workshopStatValue(stat, 0), stat).not.toBeNull()
      expect(workshopStatValue(stat, 0)!.value, stat).toBe(workshopGameValueAtLevel(stat, 0)!.value)
    }
    expect(Object.keys(WORKSHOP_DATA)).toHaveLength(48)
  })

  it('covers the five stats the eHP model needs', () => {
    for (const stat of Object.values(EFFECTIVE_HEALTH_WORKSHOP_STATS)) {
      expect(WORKSHOP_STAT_MAPPINGS[stat], stat).toBeDefined()
      expect(workshopStatValue(stat, 0), stat).not.toBeNull()
    }
  })

  it('leaves those five exactly where the sheet has them, so the eHP port still reproduces it', () => {
    let checked = 0
    for (const stat of Object.values(EFFECTIVE_HEALTH_WORKSHOP_STATS)) {
      for (const sample of fixtures.samples) {
        if (sample.sdkKey !== stat || sample.sheetName !== WORKSHOP_STAT_MAPPINGS[stat].sheetName) continue
        const scale = Math.max(Math.abs(sample.sheetValue), 1e-12)
        expect(Math.abs(workshopStatValue(stat, sample.level)!.value - sample.sheetValue) / scale, `${stat} L${sample.level}`)
          .toBeLessThan(1e-6)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20)
    // The path fixture's fresh account opens with a workshop health of 5, and
    // defense absolute of 0 — the sheet's level-0 values.
    expect(workshopStatValue('Health', 0)?.value).toBe(5)
    expect(workshopStatValue('Defense Absolute', 0)?.value).toBe(0)
    expect(workshopStatValue('Max Recovery', 0)?.value).toBe(1.5)
    expect(workshopStatValue('Wall Health', 0)?.value).toBeCloseTo(0.2, 12)
    expect(workshopStatValue('Defense Percent', 10)?.value).toBeCloseTo(0.05, 9)
  })

  it('carries the price of the NEXT level, undiscounted', () => {
    // Row 1 of Health: 55 coins and 12 cash take it from level 1 to level 2.
    const health = workshopStatValue('Health', 1)
    expect(health?.coinCost).toBe(55)
    expect(health?.cashCost).toBe(12)
    expect(workshopStatValue('Enemy Attack Level Skip', 0)?.coinCost).toBe(300_000_000)
    expect(workshopStatValue('Health', 6000)?.coinCost).toBe(0)
  })

  it('returns null for an unknown stat or an impossible level', () => {
    expect(workshopStatValue('Nonsense', 1)).toBeNull()
    expect(workshopStatValue('Health', -1)).toBeNull()
    expect(workshopStatValue('Health', 1.5)).toBeNull()
    expect(workshopStatValue('Health', 999999)).toBeNull()
  })
})

describe('level coverage', () => {
  it('reports where each stat\'s table stops', () => {
    // The stats cap at different levels, which is why this is read rather than
    // assumed to be the same everywhere.
    expect(workshopStatMaxLevel('Health')).toBe(6000)
    expect(workshopStatMaxLevel('Defense Absolute')).toBe(5000)
    expect(workshopStatMaxLevel('Wall Health')).toBe(1800)
    expect(workshopStatMaxLevel('Max Recovery')).toBe(500)
    expect(workshopStatMaxLevel('Nonsense')).toBeNull()
  })

  it('serves the last level and refuses the one past it', () => {
    const max = workshopStatMaxLevel('Max Recovery') as number
    expect(workshopStatValue('Max Recovery', max)).not.toBeNull()
    expect(workshopStatValue('Max Recovery', max + 1)).toBeNull()
  })

  it('maps forty stats to the sheet, and says which it cannot', () => {
    expect(workshopStatsWithSheetMapping()).toHaveLength(40)
    expect(WORKSHOP_STATS_DIVERGING_FROM_SHEET.length + WORKSHOP_STATS_ABSENT_FROM_SHEET.length)
      .toBe(8)
  })
})
