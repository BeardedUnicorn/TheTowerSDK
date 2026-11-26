import { describe, expect, it } from 'vitest'

import { countChartSeriesByFamily, getChartSeries, listChartSeries } from '../../src/charts'
import { LAB_CATALOG } from '../../src/data/labs/catalog.data'
import { uwStoneChartData } from '../../src/data/ultimate-weapons/stones.data'
import { CARD_TEMPLATES } from '../../src/data/cards/data'
import { guardianUpgrades } from '../../src/data/guardians/upgrades.data'
import { getWorkshopStatDefinitions } from '../../src/data/workshop/progress-definitions'

/**
 * The README and the SDK site both publish a chartable-series count.
 *
 * A number typed into prose has no way to notice when the data behind it moves, so this pins it
 * against the catalogs. If a lab gains a field or a new ultimate weapon ships, this fails and
 * names the new total instead of leaving the docs quietly wrong.
 *
 * The count used to be computed here, and again in the site, by two copies of one walk — which
 * already disagreed on how a bot stat counts. Both now read `listChartSeries`, so the number that
 * is published is the number of series that can actually be asked for.
 */

const PUBLISHED_TOTAL = 803

describe('chartable series count published in the docs', () => {
  it('still matches the shipped catalogs', () => {
    const parts = countChartSeriesByFamily()
    expect(parts).toEqual({ 'lab': 462, 'workshop': 144, 'card': 64, 'ultimate-weapon': 72, 'bot': 25, 'guardian': 36 })
    const total = listChartSeries().length

    expect(
      total,
      `Chartable series moved to ${total}. Update the count in packages/sdk/README.md `
      + `(the "Charts" section and the intro bullet) and the per-source table. Breakdown: `
      + JSON.stringify(parts),
    ).toBe(PUBLISHED_TOTAL)
  })

  it('counts what the catalogs hold, not what the walk happens to find', () => {
    // Read from the catalogs directly, so a walk that silently skipped a source cannot pass.
    expect(countChartSeriesByFamily().lab).toBe(LAB_CATALOG.length * 2)
    expect(countChartSeriesByFamily().workshop).toBe(getWorkshopStatDefinitions().length * 3)
    expect(countChartSeriesByFamily().card).toBe(CARD_TEMPLATES.length * 2)
    const uwStats = Object.values(uwStoneChartData).reduce((sum, weapon) => sum + (weapon.stats?.length ?? 0), 0)
    expect(countChartSeriesByFamily()['ultimate-weapon']).toBe(uwStats * 2)
  })

  it('counts something from every source it claims to cover', () => {
    // A source silently returning 0 would still let the total pass if another
    // source drifted up by the same amount.
    for (const [source, count] of Object.entries(countChartSeriesByFamily())) {
      expect(count, `${source} contributed no chartable series`).toBeGreaterThan(0)
    }
  })
})

describe('every counted series can be asked for', () => {
  const all = listChartSeries()

  it('gives every series its own id', () => {
    // A collision would let one series shadow another and still count as two.
    expect(new Set(all.map(series => series.id)).size).toBe(all.length)
  })

  it('returns the points a listing promises', () => {
    for (const listed of all) {
      const series = getChartSeries(listed.id)
      expect(series, listed.id).not.toBeNull()
      expect(series?.data.length, listed.id).toBe(listed.points)
      expect(listed.points, listed.id).toBeGreaterThan(0)
    }
  })

  it('refuses an id nothing has', () => {
    expect(getChartSeries('lab:no-such-lab:cost')).toBeNull()
    expect(getChartSeries('')).toBeNull()
    expect(getChartSeries('constructor')).toBeNull()
  })
})

describe('a series holds the catalog\'s own values', () => {
  it('reads a lab\'s cost and duration by level', () => {
    // Damage levels 1-3 cost 30, 71 and 178 coins.
    expect(getChartSeries('lab:damage:cost')?.data.slice(0, 3)).toEqual([{ x: 1, y: 30 }, { x: 2, y: 71 }, { x: 3, y: 178 }])
    const lab = LAB_CATALOG.find(entry => entry.slug === 'damage')
    expect(getChartSeries('lab:damage:duration')?.data.map(point => point.y)).toEqual(lab?.levels.map(row => row.duration))
    expect(getChartSeries('lab:damage:cost')).toMatchObject({ family: 'lab', entity: 'damage', metric: 'cost', xLabel: 'Level' })
  })

  it('starts a workshop upgrade at level 0', () => {
    // Damage row 0: value 3, 10 cash, 30 coins.
    expect(getChartSeries('workshop:damage:value')?.data[0]).toEqual({ x: 0, y: 3 })
    expect(getChartSeries('workshop:damage:cash')?.data[0]).toEqual({ x: 0, y: 10 })
    expect(getChartSeries('workshop:damage:coins')?.data[0]).toEqual({ x: 0, y: 30 })
  })

  it('numbers card levels from 1 and mastery levels from 0', () => {
    const card = CARD_TEMPLATES.find(entry => entry.id === 'dmg')
    expect(getChartSeries('card:dmg:level-values')?.data).toEqual(card?.levelValues.map((y, index) => ({ x: index + 1, y })))
    expect(getChartSeries('card:dmg:mastery-values')?.data).toEqual(card?.masteryValues?.map((y, index) => ({ x: index, y })))
  })

  it('leaves the unlock out of an ultimate weapon cost curve', () => {
    // Level 0 reads "Unlock", which is not a number; the curve starts at level 1.
    expect(uwStoneChartData.death_wave?.stats[0]?.levels[0]?.cost).toBe('Unlock')
    expect(getChartSeries('ultimate-weapon:death-wave:damage:cost')?.data.slice(0, 3))
      .toEqual([{ x: 1, y: 5 }, { x: 2, y: 11 }, { x: 3, y: 17 }])
    expect(getChartSeries('ultimate-weapon:death-wave:damage:value')?.data[0]?.x).toBe(0)
  })

  it('computes a bot stat from its formula and carries the catalog\'s unit', () => {
    // Golden Bot Cooldown: 120s, then 117s, 114s.
    const cooldown = getChartSeries('bot:golden-bot:cooldown')
    expect(cooldown?.data.slice(0, 3)).toEqual([{ x: 0, y: 120 }, { x: 1, y: 117 }, { x: 2, y: 114 }])
    expect(cooldown?.unit).toBe('s')
    expect(getChartSeries('bot:flame-bot:plus:wildfire')?.data[0]).toEqual({ x: 0, y: 1.5 })
  })

  it('stops a guardian stat at its own last level', () => {
    // Targets has ten levels while Cooldown runs the length of the chip's table.
    expect(getChartSeries('guardian:attack:targets:value')?.points).toBe(10)
    expect(getChartSeries('guardian:attack:cooldown:value')?.points)
      .toBe(guardianUpgrades.attack.filter(row => row.cooldown !== null).length)
    expect(guardianUpgrades.attack.filter(row => row.targets !== null)).toHaveLength(10)
    expect(getChartSeries('guardian:attack:percentage:cost')?.data.slice(0, 3))
      .toEqual([{ x: 0, y: 0 }, { x: 1, y: 25 }, { x: 2, y: 50 }])
  })
})

describe('a listing can be narrowed', () => {
  it('by family, entity and metric', () => {
    expect(listChartSeries({ family: 'guardian' })).toHaveLength(36)
    expect(listChartSeries({ family: 'lab', entity: 'damage' }).map(series => series.id).sort())
      .toEqual(['lab:damage:cost', 'lab:damage:duration'])
    expect(listChartSeries({ family: 'lab', metric: 'cost' })).toHaveLength(LAB_CATALOG.length)
    expect(listChartSeries({ entity: 'no such thing' })).toEqual([])
  })

  it('by how many points a series has', () => {
    const oneLevelLabs = LAB_CATALOG.filter(lab => lab.levels.length === 1).length
    expect(oneLevelLabs).toBeGreaterThan(0)
    expect(listChartSeries({ family: 'lab', minPoints: 2 })).toHaveLength((LAB_CATALOG.length - oneLevelLabs) * 2)
  })
})
