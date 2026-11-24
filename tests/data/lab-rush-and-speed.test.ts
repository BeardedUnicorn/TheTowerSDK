import { describe, expect, it } from 'vitest'

import {
  buildLabProgressRows,
  computeLabGems,
  computeLabRushGems,
  findToolLabBySlug,
  labGemRushEfficiency,
} from '../../src/data'
import type { ToolLabRecord } from '../../src/data'
import { parseDurationToHours } from '../../src/formatting'

/*
 * Labs Speed on its own research, and the Rush price after Gem Rush Efficiency, across the cases
 * the five labs read off the game on 2026-11-24 do not reach (see live-ui-check-v29-2-2-facts).
 */
const lab = (slug: string): ToolLabRecord => findToolLabBySlug(slug)!
const catalogHours = (record: ToolLabRecord, level: number) =>
  parseDurationToHours(record.levels!.find(row => row.level === level)!.duration)

describe('Labs Speed research', () => {
  const labsSpeed = lab('labs_speed')

  it('runs each level at the speed of the levels already done', () => {
    const rows = buildLabProgressRows(labsSpeed, 10, 13, { labSpeed: 10, labRelic: 0, labDiscount: 0, speedUp: 1 })
    expect(rows.map(row => row.level)).toEqual([11, 12, 13])
    rows.forEach(row => {
      expect(row.timeHours).toBeCloseTo(catalogHours(labsSpeed, row.level) / (1 + 0.02 * (row.level - 1)), 9)
    })
  })

  it('takes its speed from its own level, not from the labSpeed modifier', () => {
    const asPassed = buildLabProgressRows(labsSpeed, 54, 55, { labSpeed: 0, labRelic: 0, labDiscount: 0, speedUp: 1 })
    const asKnown = buildLabProgressRows(labsSpeed, 54, 55, { labSpeed: 54, labRelic: 0, labDiscount: 0, speedUp: 1 })
    expect(asPassed[0].timeHours).toBeCloseTo(asKnown[0].timeHours, 9)
  })

  it('still speeds every other lab by the labSpeed modifier', () => {
    const coinsWave = lab('coins_wave')
    const [row] = buildLabProgressRows(coinsWave, 57, 58, { labSpeed: 54, labRelic: 3.5, labDiscount: 0, speedUp: 1 })
    expect(row.timeHours).toBeCloseTo(catalogHours(coinsWave, 58) / (1.035 * 2.08), 9)
  })
})

describe('Gem Rush Efficiency', () => {
  it('starts at 1 and adds 0.015 per fully researched lab', () => {
    expect(labGemRushEfficiency(0)).toBe(1)
    expect(labGemRushEfficiency(19)).toBeCloseTo(1.285, 12)
    expect(labGemRushEfficiency(-3)).toBe(1)
  })

  it('rounds the divided price, rather than rounding the curve up first', () => {
    // 5d 14h 40m 42s is 806.31 on the curve: 627.48 after 1.285, where ceil-then-divide gives 628.
    expect(computeLabRushGems(134.678333, 19)).toBe(627)
    expect(computeLabGems(134.678333)).toBe(807)
  })

  it('prices buildLabProgressRows gems as the Rush button only when the maxed count is given', () => {
    const goldenTower = lab('golden_tower_bonus')
    const modifiers = { labSpeed: 54, labRelic: 3.5, labDiscount: 0, speedUp: 1 }
    const [list] = buildLabProgressRows(goldenTower, 13, 14, modifiers)
    const [rush] = buildLabProgressRows(goldenTower, 13, 14, { ...modifiers, maxedLabCount: 19 })
    expect(list.gems).toBe(computeLabGems(list.timeHours))
    expect(rush.gems).toBe(computeLabRushGems(rush.timeHours, 19))
    expect(rush.gems).toBeLessThan(list.gems)
  })
})
