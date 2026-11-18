import { describe, expect, it } from 'vitest'
import { TOWER_ASSET_TABLES } from '../../src/data/assets/data'
import { uwStoneChartData } from '../../src/data/ultimate-weapons/stones.data'
import { getUwStatMaxLevel } from '../../src/data/ultimate-weapons/stats'
import { uwPlusFooterText, uwPlusUpgradeSections } from '../../src/charts/datasets/uw-plus.data'

/*
 * The asset table's UW max levels against the stone ladders, which match the wiki "/Basic Upgrades"
 * pages level by level. v28.3 (patch note 1521195372519751772) raised SM, ILM and PS Damage to 35,
 * Spotlight Bonus to 30 and Spotlight+ Light Range to 19; the asset table still had 30/30/30/25/14.
 */
const uw = TOWER_ASSET_TABLES.ultimateWeapons
const ladders = uwStoneChartData as unknown as Record<string, { stats: Parameters<typeof getUwStatMaxLevel>[0][] }>
const keyFor = (name: string) => name.toLowerCase().replace(/ /g, '_')

describe('ultimate weapon max levels in the asset table', () => {
  it.each(uw.ultimateWeaponName.map((name, index) => [name, index] as const))('%s base stats match the stone ladders', (name, index) => {
    const stats = ladders[keyFor(name)].stats
    const fromAssets = uw.ultimateWeaponMaxLevel.slice(index * 3, index * 3 + 3)
    expect(fromAssets).toEqual(stats.slice(0, 3).map(stat => getUwStatMaxLevel(stat)))
  })

  it.each(uw.ultimateWeaponName.map((name, index) => [name, index] as const))('%s UW+ matches the stone ladder', (name, index) => {
    const stats = ladders[keyFor(name)].stats
    expect(uw.ultimateWeaponPlusMaxLevel[index]).toBe(getUwStatMaxLevel(stats[3]))
  })
})

describe('the UW+ chart', () => {
  it('runs Light Range to level 19 at x0.20', () => {
    const spotlight = uwPlusUpgradeSections.flatMap(section => section.upgrades).find(upgrade => upgrade.next.includes('Light'))!
    const levels = Object.values(spotlight.tiers).filter(tier => tier.cost === 'Unlock' || /^\d+$/.test(tier.cost))
    expect(levels).toHaveLength(20)
    expect(levels.at(-1)).toEqual({ value: 'x0.20', cost: '4200' })
    expect(Object.values(spotlight.tiers).at(-1)).toEqual({ value: '37,050', cost: 'Total' })
  })

  it('totals its 400-scaling section with the longer Light Range', () => {
    const section = uwPlusUpgradeSections.find(entry => entry.title === '400 Base Scaling')!
    expect(section.total).toBe('75,150')
  })

  it('no longer says every UW+ has 10 upgrades', () => {
    expect(uwPlusFooterText.join(' ')).not.toMatch(/Every UW\+ has 10 upgrades/)
  })
})
