import { describe, expect, it } from 'vitest'

import {
  ENEMY_SCALING_CHART_WAVES,
  LAB_RUSH_CHART_HOURS,
  LAB_RUSH_CHART_MAXED_LAB_COUNTS,
  resolveCanonicalToolDataset,
} from '../../src/charts'
import {
  ELITE_CELL_TIER_ROWS,
  MODULE_COIN_COSTS,
  TIERS,
  TIER_COIN_BONUS_ROWS,
  TOURNAMENT_LEAGUES,
  TOURNAMENT_REWARD_ROWS,
  buildGuardianDefinitions,
  computeLabRushGems,
  getModuleCoinUpgradeCost,
  getModuleShardUpgradeCost,
  guardianUpgrades,
  sumGuardianAllStatCosts,
  sumModuleCoinCostsBetween,
  sumModuleShardCostsBetween,
  sumUltimateWeaponPlusUnlockStones,
  sumUltimateWeaponUnlockStones,
} from '../../src/data'
import { formatGameNumber } from '../../src/formatting'
import { computeWaveBaseDamage, computeWaveBaseHealth } from '../../src/mechanics'

/**
 * The charts for ladders that had none, each held to the table or function it is drawn from.
 *
 * A chart is a second copy of numbers that already live somewhere, so the check is always the
 * same: read a cell, read the source, and require them to agree — at more than one row, because
 * an offset by one agrees with a flat stretch of a cost curve about half the time.
 */

const column = (dataset: ReturnType<typeof resolveCanonicalToolDataset>, label: string): string => {
  const found = dataset?.columns.find(entry => entry.label === label)
  expect(found, `column "${label}"`).toBeDefined()
  return found?.key ?? ''
}

const sumOf = (dataset: ReturnType<typeof resolveCanonicalToolDataset>, key: string): number =>
  (dataset?.rows ?? []).reduce((total, row) => total + (Number(row[key]) || 0), 0)

describe('guardian chip upgrade charts', () => {
  it('has a chart for every chip, titled for it', () => {
    for (const guardian of buildGuardianDefinitions()) {
      const dataset = resolveCanonicalToolDataset('guardian-upgrades', [guardian.key])
      expect(dataset?.title, guardian.key).toBe(`${guardian.label} Chip Upgrades`)
    }
    expect(resolveCanonicalToolDataset('guardian-upgrades', ['nope'])).toBeNull()
    expect(resolveCanonicalToolDataset('guardian-upgrades', [])).toBeNull()
  })

  it('prints the upgrade table\'s own values and costs', () => {
    const dataset = resolveCanonicalToolDataset('guardian-upgrades', ['attack'])
    const cooldown = column(dataset, 'Cooldown')
    const cooldownCost = column(dataset, 'Cooldown Cost')
    // The table counts from level 1; the chart counts from 0.
    for (const level of [0, 1, 17, 89]) {
      expect(dataset?.rows[level]?.[cooldown], `level ${level}`).toBe(guardianUpgrades.attack[level]?.cooldown)
      expect(dataset?.rows[level]?.[cooldownCost], `level ${level}`).toBe(guardianUpgrades.attack[level]?.cooldownCost)
    }
  })

  it('leaves a shorter stat blank past its last level, rather than zero', () => {
    const dataset = resolveCanonicalToolDataset('guardian-upgrades', ['attack'])
    const targets = column(dataset, 'Targets')
    const targetsCost = column(dataset, 'Targets Cost')
    expect(dataset?.rows[9]?.[targets]).toBe(10)
    expect(dataset?.rows[10]?.[targets]).toBe('')
    expect(dataset?.rows[10]?.[targetsCost]).toBe('')
  })

  it('has cost columns that total what finishing the chip costs', () => {
    for (const guardian of buildGuardianDefinitions()) {
      const dataset = resolveCanonicalToolDataset('guardian-upgrades', [guardian.key])
      const total = (dataset?.columns ?? [])
        .filter(entry => entry.label.endsWith(' Cost'))
        .reduce((sum, entry) => sum + sumOf(dataset, entry.key), 0)
      expect(total, guardian.key).toBe(sumGuardianAllStatCosts(guardian.key))
    }
  })
})

describe('the module upgrade cost chart', () => {
  const dataset = resolveCanonicalToolDataset('module-upgrade-costs', [])
  const rowFor = (level: number) => dataset?.rows.find(row => row.level === level)

  it('prices each level as the cost functions do', () => {
    const coins = column(dataset, 'Coins')
    const shards = column(dataset, 'Shards')
    for (const level of [2, 31, 120, 241, 300]) {
      expect(rowFor(level)?.[coins], `coins at ${level}`).toBe(getModuleCoinUpgradeCost(level))
      expect(rowFor(level)?.[shards], `shards at ${level}`).toBe(getModuleShardUpgradeCost(level))
    }
  })

  it('carries running totals that match the range sums', () => {
    const totalCoins = column(dataset, 'Total Coins')
    const totalShards = column(dataset, 'Total Shards')
    for (const level of [2, 60, 300]) {
      expect(rowFor(level)?.[totalCoins], `to ${level}`).toBe(sumModuleCoinCostsBetween(1, level, 0))
      expect(rowFor(level)?.[totalShards], `to ${level}`).toBe(sumModuleShardCostsBetween(1, level, 0))
    }
  })

  it('has a row for every level that can be bought', () => {
    // Level 1 is where a module starts, so the first purchase is level 2.
    expect(dataset?.rows[0]?.level).toBe(2)
    expect(dataset?.rows).toHaveLength(MODULE_COIN_COSTS.length)
  })
})

describe('the ultimate weapon unlock ladder chart', () => {
  const dataset = resolveCanonicalToolDataset('uw-unlock-ladder', [])

  it('prints the published prices by count owned', () => {
    expect(dataset?.rows.map(row => row[column(dataset, 'Next Weapon')]))
      .toEqual([5, 50, 150, 300, 800, 1250, 1750, 2400, 3000])
    expect(dataset?.rows.map(row => row[column(dataset, 'Next Plus')]))
      .toEqual([500, 625, 750, 975, 1250, 1650, 2200, 2900, 3800])
  })

  it('ends its running totals at the cost of all nine', () => {
    const last = dataset?.rows.at(-1)
    expect(last?.[column(dataset, 'Total')]).toBe(9705)
    expect(last?.[column(dataset, 'Plus Total')]).toBe(14650)
    expect(dataset?.rows[3]?.[column(dataset, 'Total')]).toBe(sumUltimateWeaponUnlockStones(0, 4))
    expect(dataset?.rows[3]?.[column(dataset, 'Plus Total')]).toBe(sumUltimateWeaponPlusUnlockStones(0, 4))
  })
})

describe('the lab rush gems chart', () => {
  const dataset = resolveCanonicalToolDataset('lab-rush-gems', [])

  it('prints the Rush button price for each time and maxed-lab count', () => {
    for (const [rowIndex, hours] of LAB_RUSH_CHART_HOURS.entries()) {
      for (const count of LAB_RUSH_CHART_MAXED_LAB_COUNTS) {
        const key = column(dataset, `${count} Maxed Labs`)
        expect(dataset?.rows[rowIndex]?.[key], `${hours}h, ${count} maxed`).toBe(computeLabRushGems(hours, count))
      }
    }
  })

  it('shows the wiki\'s points on the list-price column', () => {
    // 8 gems at an hour, 163 at a day, 1000 at a week, 3550 at 30 days, 8000 at 90.
    const listPrice = column(dataset, '0 Maxed Labs')
    const priceAt = (label: string) => dataset?.rows.find(row => row[column(dataset, 'Time Left')] === label)?.[listPrice]
    expect(priceAt('1h')).toBe(8)
    expect(priceAt('24h')).toBe(163)
    expect(priceAt('7d')).toBe(1000)
    expect(priceAt('30d')).toBe(3550)
    expect(priceAt('90d')).toBe(8000)
  })

  it('never asks more as more labs are maxed', () => {
    for (const row of dataset?.rows ?? []) {
      const prices = LAB_RUSH_CHART_MAXED_LAB_COUNTS.map(count => Number(row[column(dataset, `${count} Maxed Labs`)]))
      expect([...prices].sort((a, b) => b - a)).toEqual(prices)
    }
  })
})

describe('the enemy scaling charts', () => {
  it('prints the scaling model\'s value for each wave and tier', () => {
    for (const [stat, compute] of [['base-health', computeWaveBaseHealth], ['base-damage', computeWaveBaseDamage]] as const) {
      const dataset = resolveCanonicalToolDataset('enemy-base-stats', [stat])
      for (const [rowIndex, wave] of ENEMY_SCALING_CHART_WAVES.entries()) {
        for (const tier of [1, 9, 18, 24]) {
          expect(dataset?.rows[rowIndex]?.[column(dataset, `T${tier}`)], `${stat} wave ${wave} tier ${tier}`)
            .toBe(formatGameNumber(compute({ wave, tier })))
        }
      }
    }
  })

  it('has a column per tier and says the values are fitted', () => {
    const dataset = resolveCanonicalToolDataset('enemy-base-stats', ['base-health'])
    expect(dataset?.columns).toHaveLength(TIERS.length + 1)
    expect(dataset?.title).toContain('fitted model')
    expect(resolveCanonicalToolDataset('enemy-base-stats', ['base-speed'])).toBeNull()
  })

  it('shows health and damage as different tables', () => {
    const health = resolveCanonicalToolDataset('enemy-base-stats', ['base-health'])
    const damage = resolveCanonicalToolDataset('enemy-base-stats', ['base-damage'])
    expect(JSON.stringify(health?.rows)).not.toBe(JSON.stringify(damage?.rows))
  })
})

describe('the per-tier tables', () => {
  it('prints every tier\'s coin bonus', () => {
    const dataset = resolveCanonicalToolDataset('tier-coin-multipliers', [])
    expect(dataset?.rows).toHaveLength(TIER_COIN_BONUS_ROWS.length)
    for (const [index, row] of TIER_COIN_BONUS_ROWS.entries()) {
      expect(dataset?.rows[index]).toEqual({ tier: row.tier, coinBonus: `x${row.coinBonus}` })
    }
    // Tier 1 pays no bonus; tier 2 pays x1.8.
    expect(dataset?.rows[0]?.coinBonus).toBe('x1')
    expect(dataset?.rows[1]?.coinBonus).toBe('x1.8')
  })

  it('prints the elite cell rows it has, and invents none below them', () => {
    const dataset = resolveCanonicalToolDataset('elite-cells-by-tier', [])
    expect(dataset?.rows.map(row => row.tier)).toEqual(ELITE_CELL_TIER_ROWS.map(row => row.tier))
    expect(dataset?.rows[0]).toMatchObject({ tier: 14, minimumCells: 7, maximumCells: 14, averageCells: 10.5 })
    expect(dataset?.rows.at(-1)).toMatchObject({ tier: 24, minimumCells: 15, maximumCells: 24 })
  })
})

describe('tournament reward charts', () => {
  it('has a chart for every league with that league\'s rows', () => {
    for (const { league } of TOURNAMENT_LEAGUES) {
      const dataset = resolveCanonicalToolDataset('tournament-rewards', [league.toLowerCase()])
      const source = TOURNAMENT_REWARD_ROWS.filter(row => row.league === league)
      expect(dataset?.title, league).toBe(`${league} League Tournament Rewards`)
      expect(dataset?.rows.map(row => [row.rank, row.gems, row.stones]), league)
        .toEqual(source.map(row => [row.rank, row.gems, row.stones]))
    }
  })

  it('shows a keys column only where the league pays keys', () => {
    const labels = (league: string) =>
      resolveCanonicalToolDataset('tournament-rewards', [league])?.columns.map(entry => entry.label)
    expect(labels('copper')).toEqual(['Rank', 'Gems', 'Power Stones'])
    expect(labels('legend')).toEqual(['Rank', 'Gems', 'Power Stones', 'Keys'])
    // Copper first place: 100 gems and 20 stones. Legend first place also pays 25 keys.
    expect(resolveCanonicalToolDataset('tournament-rewards', ['copper'])?.rows[0]).toEqual({ rank: '1', gems: 100, stones: 20 })
    expect(resolveCanonicalToolDataset('tournament-rewards', ['legend'])?.rows[0]).toMatchObject({ keys: 25 })
  })

  it('refuses a league that does not exist', () => {
    expect(resolveCanonicalToolDataset('tournament-rewards', ['bronze'])).toBeNull()
    expect(resolveCanonicalToolDataset('tournament-rewards', [])).toBeNull()
  })
})
