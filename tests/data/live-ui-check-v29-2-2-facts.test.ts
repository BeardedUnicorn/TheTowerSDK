import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  botStatValue,
  buildBotStatCostRows,
  buildLabProgressRows,
  computeDiscountedWorkshopCost,
  computeLabRushGems,
  computeLabValueAtLevel,
  computeModuleStat,
  computeWorkshopStatNumericValueAtLevel,
  findBotByName,
  findToolLabBySlug,
  getBotStatNames,
  getModuleCoinUpgradeCost,
  getModuleShardUpgradeCost,
  getNextUltimateWeaponStoneCost,
  getNextWorkshopUnlock,
  getTierData,
  labGemRushEfficiency,
  MODULE_RARITY_LEVEL_CAPS,
  normalizeBotStats,
  RELIC_GAME_TABLE_BY_INDEX,
  uwStoneChartData,
  WORKSHOP_DATA,
  workshopLabLevelToSectionDiscountPercent,
} from '../../src/data'
import type { ModuleCalcType, ToolLabRecord, WorkshopCategory } from '../../src/data'
import { formatGameNumber, parseDurationToHours } from '../../src/formatting'
import { cardLevelCopiesRequired, computePerkBenefitUp, dissonantBoostOfType } from '../../src/mechanics'
import { buildModuleSaveSubstatSlotPreviews } from '../../src/save'

/*
 * What the game showed on 2026-11-24 (facts/v29.2.2/live-ui-check.json), recomputed from the
 * levels behind each reading.
 *
 * The other facts files hold the game's data tables. This one holds the SCREEN: the next-level
 * cost after the lab discount, the duration after Labs Speed, the rush price after Gem Rush
 * Efficiency, the number as the game prints it. That pass found five things the tables alone
 * could not: Labs Speed shortening its own research, rush prices ignoring gold-boxed labs, the
 * game truncating where the formatters rounded, Death Defy reading as 0 through the value helper,
 * and Health Regen substats printed as `x` where the game prints `%`.
 */

interface Facts {
  workshopCosts: { stat: string, level: number, section: string, discountLabLevel: number, shown: string }[]
  workshopValues: { stat: string, level: number, shown: string }[]
  ultimateWeapons: { weapon: string, stat: string, level: number, shownValue: string, shownCost: string }[]
  labs: {
    labsSpeedLevel: number
    labSpeedRelicPct: number
    labsCoinDiscountLevel: number
    maxedLabCount: number
    gemRushEfficiency: string
    active: { slug: string, completedLevel: number, shownValues: string, levelHours: number, shownRemaining: string, shownRush: string }[]
  }
  cardCopies: { card: string, level: number, copies: number, shown: string }[]
  modules: {
    type: string
    rarity: string
    level: number
    shownMain: string
    shownLevel: string
    nextLevel: { shards: string, coins: string }
    effects: { effectId: number, shown: string }[]
  }[]
  perks: { standardPerksBonusLevel: number, improveTradeOffPerksLevel: number, shown: { index: number, shown: string }[] }
  bots: { bot: string, stat: string, level: number, shownValue: string, shownCost: string }[]
  relics: { unlockedIndices: number[], totals: Record<string, string> }
  dissonance: { tier: number, boostWaves: Record<'attack' | 'defense' | 'utility' | 'uw', number[]>, shown: Record<string, string> }
  tierCoinBonus: { tier: number, shown: string }
  tierRecords: { tier: number, coins: number, shownCoins: string, cells: number, shownCells: string }[]
  gameNumbers: { value: number, shown: string }[]
  workshopUnlocks: { category: WorkshopCategory, saveFlags: string, unlockedGroups: number, shown: string }[]
  ultimateWeaponUnlock: { owned: number, shown: string }
  unexplained: string[]
}

const facts = JSON.parse(
  readFileSync(new URL('../../facts/v29.2.2/live-ui-check.json', import.meta.url), 'utf8'),
) as Facts

/** The last number in an on-screen string: `x1.0877 / m` is 1.0877, `5.55 sec` is 5.55. */
const lastNumber = (shown: string): number => {
  const all = shown.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g)
  return all ? Number(all[all.length - 1]) : Number.NaN
}

/** `3m 20s` and `37s` are seconds on the weapon screen. */
const shownNumber = (shown: string): number =>
  /^\d+m \d+s$|^\d+s$/.test(shown) ? parseDurationToHours(shown) * 3600 : lastNumber(shown)

const lab = (slug: string): ToolLabRecord => {
  const found = findToolLabBySlug(slug)
  if (!found) throw new Error(`${slug} is not in the lab catalog`)
  return found
}

describe('workshop, as the game showed it on 2026-11-24', () => {
  it.each(facts.workshopCosts)('$stat level $level costs $shown', ({ stat, level, discountLabLevel, shown }) => {
    const base = (WORKSHOP_DATA as Record<string, Record<string, { coins: number }>>)[stat][String(level)].coins
    const cost = computeDiscountedWorkshopCost(base, workshopLabLevelToSectionDiscountPercent(discountLabLevel))
    expect(formatGameNumber(cost)).toBe(shown)
  })

  it.each(facts.workshopValues)('$stat level $level shows $shown', ({ stat, level, shown }) => {
    expect(computeWorkshopStatNumericValueAtLevel(stat, level)).toBeCloseTo(lastNumber(shown), 2)
  })
})

describe('ultimate weapons', () => {
  const chartStat = (weapon: string, stat: string) => {
    const entry = Object.values(uwStoneChartData).find(row => row.name === weapon)
    const found = entry?.stats.find(row => row.name === stat)
    if (!found) throw new Error(`${weapon} ${stat} is not in uwStoneChartData`)
    return found
  }

  it.each(facts.ultimateWeapons)('$weapon $stat level $level: next level costs $shownCost stones', ({ weapon, stat, level, shownCost }) => {
    const next = chartStat(weapon, stat).levels.find(row => row.level === level + 1)
    expect(String(next?.cost)).toBe(shownCost)
  })

  /*
   * The weapon screen adds labs and the Core module's substats to the chart value. Those four are
   * listed with what was added; the two the SDK cannot yet explain are held in `unexplained`.
   */
  const added: Record<string, number> = {
    'Golden Tower Multiplier': 1.95 + 1, // Golden Tower Bonus lab level 13, Core +1x
    'Golden Tower Duration': 16, // Golden Tower Duration lab level 16
    'Death Wave Damage': 25, // Core +25x
  }
  const unexplained = new Set(['Chain Lightning Quantity', 'Spotlight Multiplier'])

  it.each(facts.ultimateWeapons.filter(row => !unexplained.has(`${row.weapon} ${row.stat}`)))(
    '$weapon $stat level $level shows $shownValue',
    ({ weapon, stat, level, shownValue }) => {
      const value = String(chartStat(weapon, stat).levels.find(row => row.level === level)?.value)
      const chartNumber = /s$/.test(value) ? Number(value.slice(0, -1)) : lastNumber(value)
      const expected = chartNumber + (added[`${weapon} ${stat}`] ?? 0)
      // The weapon screen prints one decimal and truncates: 15.95 shows as x15.9.
      expect(Math.trunc(expected * 10 + 1e-6) / 10).toBeCloseTo(shownNumber(shownValue), 6)
    },
  )

  it('keeps the readings the SDK cannot explain on record', () => {
    expect(facts.unexplained.some(line => line.startsWith('Chain Lightning Quantity'))).toBe(true)
    expect(facts.unexplained.some(line => line.startsWith('Spotlight Bonus'))).toBe(true)
  })
})

describe('unlock buttons', () => {
  /*
   * The button names a group, not a stat: "Rend Armor" opens Rend Armor Chance and Mult, "The
   * Wall" opens Wall Health and Rebuild. So the name is matched against the group's first stat.
   */
  it.each(facts.workshopUnlocks)('$category with $unlockedGroups unlocked shows "$shown"', ({ category, unlockedGroups, shown }) => {
    const [, name, price] = /^Unlock (?:The )?(.+) (\S+)$/.exec(shown)!
    const next = getNextWorkshopUnlock(category, unlockedGroups)!
    expect(next.stats[0].startsWith(name)).toBe(true)
    // The discount labs were active and the button was not discounted, so the raw price is shown.
    expect(formatGameNumber(next.coins)).toBe(price)
  })

  it(`with ${facts.ultimateWeaponUnlock.owned} weapons owned shows "${facts.ultimateWeaponUnlock.shown}"`, () => {
    const { owned, shown } = facts.ultimateWeaponUnlock
    expect(getNextUltimateWeaponStoneCost(owned)).toBe(lastNumber(shown))
  })
})

describe('labs', () => {
  const { labsSpeedLevel, labSpeedRelicPct, labsCoinDiscountLevel, maxedLabCount } = facts.labs
  const modifiers = { labSpeed: labsSpeedLevel, labRelic: labSpeedRelicPct, labDiscount: labsCoinDiscountLevel, speedUp: 1 }

  it.each(facts.labs.active)('$slug: $shownValues', ({ slug, completedLevel, shownValues }) => {
    const [now, next] = shownValues.match(/\d+(?:\.\d+)?/g)!.map(Number)
    expect(computeLabValueAtLevel(lab(slug), completedLevel)).toBeCloseTo(now, 6)
    expect(computeLabValueAtLevel(lab(slug), completedLevel + 1)).toBeCloseTo(next, 6)
  })

  it.each(facts.labs.active)('$slug level after $completedLevel runs $levelHours hours', ({ slug, completedLevel, levelHours }) => {
    const [row] = buildLabProgressRows(lab(slug), completedLevel, completedLevel + 1, modifiers)
    // levelHours is derived from the screen to the second, so a tenth of an hour is generous.
    expect(row.timeHours).toBeCloseTo(levelHours, 1)
  })

  it('shows the Gem Rush Efficiency the game shows for 19 fully researched labs', () => {
    expect(`${labGemRushEfficiency(maxedLabCount).toFixed(3)}x`).toBe(facts.labs.gemRushEfficiency)
  })

  it.each(facts.labs.active)('$slug with $shownRemaining left rushes for $shownRush gems', ({ shownRemaining, shownRush }) => {
    expect(computeLabRushGems(parseDurationToHours(shownRemaining), maxedLabCount)).toBe(Number(shownRush))
  })
})

describe('cards', () => {
  it.each(facts.cardCopies)('$card level $level with $copies copies shows $shown', ({ level, copies, shown }) => {
    // The first copy counts toward level 2, so a level 1 card is measured against the total.
    const needed = cardLevelCopiesRequired(level + 1) - (level === 1 ? 0 : cardLevelCopiesRequired(level))
    expect(`${copies}/${needed}`).toBe(shown)
  })
})

describe('modules', () => {
  it.each(facts.modules)('$type $rarity level $level', ({ type, rarity, level, shownMain, shownLevel, nextLevel, effects }) => {
    const main = computeModuleStat({ type: type.toLowerCase() as ModuleCalcType, rarityLabel: rarity, level })
    expect(shownMain.startsWith(`x${main.toFixed(3)} `)).toBe(true)
    expect(shownLevel).toBe(`Lv. ${level} /${(MODULE_RARITY_LEVEL_CAPS as Record<string, number>)[rarity]}`)
    expect(String(getModuleShardUpgradeCost(level + 1))).toBe(nextLevel.shards)
    expect(formatGameNumber(getModuleCoinUpgradeCost(level + 1))).toBe(nextLevel.coins)

    const previews = buildModuleSaveSubstatSlotPreviews(type as never, effects.map(effect => effect.effectId))
    expect(previews.map(preview => `${preview.rarity} ${preview.displayValue} ${preview.label}`)).toEqual(effects.map(effect => effect.shown))
  })
})

describe('perks', () => {
  const standardPerksBonus = computeLabValueAtLevel(lab('standard_perks_bonus'), facts.perks.standardPerksBonusLevel) / 100
  const improveTradeOffPerks = computeLabValueAtLevel(lab('improve_trade_off_perks'), facts.perks.improveTradeOffPerksLevel) / 100

  it.each(facts.perks.shown)('perk $index shows "$shown"', ({ index, shown }) => {
    const benefit = computePerkBenefitUp({ index, quantity: 1, onlyOneLevel: true, standardPerksBonus, improveTradeOffPerks })
    if (!/\d/.test(shown)) {
      expect(benefit).toBe(0)
      return
    }
    // Defense Percent and Perk Wave Requirement are fractions shown as percentages; the wave
    // requirement is printed with a minus sign because it is a reduction.
    const shownAs = index === 9 || index === 10 ? benefit! * 100 : benefit!
    expect(Math.round(shownAs * 100) / 100).toBeCloseTo(Math.abs(lastNumber(shown)), 6)
  })
})

describe('bots', () => {
  it.each(facts.bots)('$bot $stat level $level shows $shownValue and costs $shownCost medals', ({ bot, stat, level, shownValue, shownCost }) => {
    const data = findBotByName(bot)!
    const index = getBotStatNames(data).indexOf(stat)
    expect(botStatValue(bot, stat, level)).toBeCloseTo(lastNumber(shownValue), 6)
    expect(String(buildBotStatCostRows(normalizeBotStats(data)[index], level, level + 1)[0].cost)).toBe(shownCost)
  })
})

describe('relics', () => {
  const totals = new Map<string, number>()
  for (const index of facts.relics.unlockedIndices) {
    const row = RELIC_GAME_TABLE_BY_INDEX.get(index)!
    totals.set(row.stat, (totals.get(row.stat) ?? 0) + row.benefit)
  }

  it.each(Object.entries(facts.relics.totals))('%s totals %s', (stat, shown) => {
    expect((totals.get(stat) ?? 0) * 100).toBeCloseTo(lastNumber(shown), 6)
  })
})

describe('battle screen', () => {
  const { tier, boostWaves, shown } = facts.dissonance

  it.each(Object.entries(shown))('dissonant %s boost shows %s', (type, display) => {
    const waves = boostWaves[type as keyof typeof boostWaves]
    const boost = dissonantBoostOfType(type as never, waves[tier], waves, 0)
    expect(`x${boost.toFixed(2)}`).toBe(display)
  })

  it('shows the tier coin bonus', () => {
    expect(`x${getTierData(facts.tierCoinBonus.tier)?.coinBonus}`).toBe(facts.tierCoinBonus.shown)
  })
})

describe('numbers, written the way the game writes them', () => {
  it.each(facts.gameNumbers)('$value shows as $shown', ({ value, shown }) => {
    expect(formatGameNumber(value)).toBe(shown)
  })

  it.each(facts.tierRecords)('tier $tier best run: $shownCoins coins, $shownCells cells', ({ coins, shownCoins, cells, shownCells }) => {
    expect(formatGameNumber(coins)).toBe(shownCoins)
    expect(formatGameNumber(cells)).toBe(shownCells)
  })
})
