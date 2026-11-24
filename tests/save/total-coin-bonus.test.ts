import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { THEME_CATEGORY_BONUS, THEME_CATEGORY_DEFINITIONS } from '../../src/data'
import { computeTotalCoinBonus, type TotalCoinBonusBreakdown, type TotalCoinBonusInput } from '../../src/mechanics'
import { readTotalCoinBonusFromSaveRoot } from '../../src/save'
import { decodeInflatedSave } from '../../src/save-decoder'

/*
 * The Total Coin Bonus the Battle tab showed on 2026-11-24 (game v29.2.2), and the All Coins
 * Bonuses panel behind it, recomputed from the export fields behind each row
 * (facts/v29.2.2/live-ui-check.json, `totalCoinBonus`). Read at tier 7 and again at tier 6, so
 * the two rows that move with the tier are pinned at two values each.
 */

type Category = 'tower' | 'background' | 'menu' | 'profileBanner' | 'guardian' | 'song'

interface Facts {
  relics: { unlockedIndices: number[] }
  dissonance: { boostWaves: { utility: number[] } }
  totalCoinBonus: {
    currentTier: number
    purchases: { hasDisableAds: boolean, hasStarterPack: boolean, hasEpicPack: boolean }
    coinsCard: { index: number, level: number, active: boolean, masteryUnlocked: boolean }
    generator: { infoIndex: number, currentRarity: number, effects: number[], slotLevel: number }
    owned: Record<Category, number[]>
    storeLabels: Record<Category, string>
    themeScreen: string
    panels: { tier: number, battleTab: string, shown: Record<string, string> }[]
  }
}

const facts = JSON.parse(
  readFileSync(new URL('../../facts/v29.2.2/live-ui-check.json', import.meta.url), 'utf8'),
) as Facts
const { currentTier, purchases, coinsCard, generator, owned, storeLabels, themeScreen, panels } = facts.totalCoinBonus

/** The panel's row names, mapped onto the breakdown's fields. */
const ROW: Record<string, keyof TotalCoinBonusBreakdown> = {
  'Disable ads': 'disableAds',
  'Starter pack': 'starterPack',
  'Epic pack': 'epicPack',
  'Active cards': 'activeCards',
  'Modules': 'modules',
  'Difficulty Tier': 'difficultyTier',
  'Themes Bonus': 'themes',
  'Relics Bonus': 'relics',
  'Enhancement Bonus': 'enhancement',
  'Dissonant Coin Bonus': 'dissonance',
  'Total bonus': 'total',
}

/** A multiplier written the way the panel writes it: as many decimals as the shown text has. */
function asShown(value: number, shown: string): string {
  if (shown === 'Inactive') return value === 1 ? 'Inactive' : `x${value}`
  const decimals = shown.split('.')[1]?.length ?? 0
  return `x${value.toFixed(decimals)}`
}

function flags(length: number, on: readonly number[]): boolean[] {
  return Array.from({ length }, (_, index) => on.includes(index))
}

/** The export fields each row reads, as the game wrote them, and nothing else. */
const exportRoot = {
  VersionNumber: 1296,
  CurrentTier: currentTier,
  DisableAdsUnlockedBool: purchases.hasDisableAds,
  StarterPackUnlockedBool: purchases.hasStarterPack,
  EpicPackUnlockedBool: purchases.hasEpicPack,
  CardLevel: Array.from({ length: 40 }, (_, index) => (index === coinsCard.index ? coinsCard.level : 1)),
  CardUnlocked: flags(40, [coinsCard.index]),
  CardActive: flags(40, coinsCard.active ? [coinsCard.index] : []),
  CardMasteryUnlocked: flags(40, coinsCard.masteryUnlocked ? [coinsCard.index] : []),
  ResearchLevel: Array.from({ length: 260 }, () => 0),
  ModuleEquipped: [null, null, {
    InfoIndex: generator.infoIndex,
    CurrentRarity: generator.currentRarity,
    Level: 0,
    Effects: generator.effects,
  }, null],
  SlotLevels: [0, 0, generator.slotLevel, 0],
  RelicsUnlocked: Array.from({ length: 350 }, (_, index) => (facts.relics.unlockedIndices.includes(index) ? 2 : 0)),
  TowerUnlocked: flags(100, owned.tower),
  BackgroundUnlocked: flags(100, owned.background),
  MenuUnlocked: flags(100, owned.menu),
  ProfileBannerUnlocked: flags(100, owned.profileBanner),
  GuardianSkinUnlocked: flags(25, owned.guardian),
  TrackAvailable: flags(12, owned.song),
  DissonanceCoinBoost: facts.dissonance.boostWaves.utility,
  EnhancementUtilityLevel: Array.from({ length: 20 }, () => 0),
}
const root = decodeInflatedSave(new TextEncoder().encode(JSON.stringify(exportRoot)))

describe('Total Coin Bonus, from the export, against the All Coins Bonuses panel', () => {
  describe.each(panels)('tier $tier', ({ tier, battleTab, shown }) => {
    const read = readTotalCoinBonusFromSaveRoot(root, tier)!

    it.each(Object.entries(shown))('%s shows %s', (row, display) => {
      expect(asShown(read.bonus[ROW[row]], display)).toBe(display)
    })

    it(`the Battle tab shows ${battleTab}`, () => {
      expect(asShown(read.bonus.total, battleTab)).toBe(battleTab)
    })

    it('needs no assumption the save could not answer', () => {
      expect(read.warnings).toEqual([])
    })
  })

  it(`counts the cosmetics the Themes screen prices: "${themeScreen}"`, () => {
    const themes = readTotalCoinBonusFromSaveRoot(root, panels[0].tier)!.bonus.themes
    expect(`Theme & Song Coin Bonus ${asShown(themes, themeScreen.split(' ').pop()!)}`).toBe(themeScreen)
  })
})

describe('what each cosmetic pays', () => {
  it.each(THEME_CATEGORY_DEFINITIONS.map(category => [category.key, category.passiveCoinBonusPerOwnedDisplay] as const))(
    '%s is priced at the rate the store prints',
    (category, rate) => {
      expect(`+${rate}`).toBe(storeLabels[category])
    },
  )

  it('profile banners and songs are priced at the rate the stores print', () => {
    expect(THEME_CATEGORY_BONUS.PROFILE_BANNER).toBe(storeLabels.profileBanner)
    expect(THEME_CATEGORY_BONUS.SONGS).toBe(storeLabels.song)
  })

  it('pays nothing for slot 0 of each kind, and only for the event-store songs', () => {
    const { paidCosmetics } = readTotalCoinBonusFromSaveRoot(root, panels[0].tier)!.input
    // facts/v29.2.1/theme-names.json: "the three event songs are tracks 4, 5 and 8".
    expect(paidCosmetics).toEqual({
      tower: owned.tower.filter(index => index > 0).length,
      background: owned.background.filter(index => index > 0).length,
      menu: owned.menu.filter(index => index > 0).length,
      profileBanner: owned.profileBanner.filter(index => index > 0).length,
      guardian: owned.guardian.filter(index => index > 0).length,
      song: owned.song.filter(index => [4, 5, 8].includes(index)).length,
    })
  })
})

describe('computeTotalCoinBonus refuses what the game cannot hold', () => {
  const input = readTotalCoinBonusFromSaveRoot(root, panels[0].tier)!.input
  const withInput = (change: Partial<TotalCoinBonusInput>) => () => computeTotalCoinBonus({ ...input, ...change })

  it('a tier with no coin bonus', () => {
    expect(withInput({ tier: 0 })).toThrow(RangeError)
  })

  it('a Coins card level outside 1-7', () => {
    expect(withInput({ coinsCard: { ...input.coinsCard, level: 8 } })).toThrow(RangeError)
  })

  it('a Coins Mastery level past the last mastery value', () => {
    expect(withInput({ coinsCard: { ...input.coinsCard, masteryUnlocked: true, masteryLevel: 10 } })).toThrow(RangeError)
  })

  it('a Generator rarity computeModuleStat does not know', () => {
    expect(withInput({ generator: { rarityLabel: 'Legendery', level: 93, primaryLabLevel: 0 } })).toThrow(RangeError)
  })

  it('an unequipped Coins card pays nothing, mastery included', () => {
    const unequipped = computeTotalCoinBonus({ ...input, coinsCard: { ...input.coinsCard, equipped: false, masteryUnlocked: true } })
    expect(unequipped.activeCards).toBe(1)
  })
})

describe('the tier', () => {
  it('defaults to the tier the save has selected', () => {
    const shown = panels.find(panel => panel.tier === currentTier)!.battleTab
    expect(asShown(readTotalCoinBonusFromSaveRoot(root)!.bonus.total, shown)).toBe(shown)
  })

  it('is null with no tier given and none in the save, and for no save', () => {
    expect(readTotalCoinBonusFromSaveRoot({ ...root, currentTier: undefined })).toBeNull()
    expect(readTotalCoinBonusFromSaveRoot(null, currentTier)).toBeNull()
  })
})
