/**
 * Sample arguments for the calculators in `src/calculators/specs-screens.ts`, shared by the
 * registry's own suite (monorepo only) and `screen-calculators.test.ts` (everywhere), so the two
 * cannot drift apart.
 */

export const COIN_BONUS_INPUT = {
  tier: 7,
  purchases: { hasDisableAds: true, hasStarterPack: false, hasEpicPack: false },
  coinsCard: { equipped: true, level: 7, masteryUnlocked: false, masteryLevel: 0 },
  generator: { rarityLabel: 'Legendary', level: 93, primaryLabLevel: 0 },
  paidCosmetics: { tower: 21, background: 17, menu: 4, profileBanner: 3, guardian: 6, song: 3 },
  relicCoinBonus: 0.12,
  coinBonusEnhancementLevel: 0,
  dissonance: { coinBoostWaves: [0, 3051, 0, 0, 0, 0, 0, 1667], echoLevel: 0 },
}

/** Arguments for each handle, and a second set that must give a different answer. */
export const SCREEN_CALCULATOR_SAMPLES: Record<string, { args: Record<string, unknown>, moved: Record<string, unknown> }> = {
  'coinBonus.total': {
    args: { input: COIN_BONUS_INPUT },
    moved: { input: { ...COIN_BONUS_INPUT, coinsCard: { ...COIN_BONUS_INPUT.coinsCard, equipped: false } } },
  },
  'coinBonus.themesAndSongs': {
    args: { counts: COIN_BONUS_INPUT.paidCosmetics },
    moved: { counts: { ...COIN_BONUS_INPUT.paidCosmetics, song: 9 } },
  },
  'coinBonus.fromSave': {
    args: { root: { currentTier: 7 } },
    moved: { root: { currentTier: 7 }, tier: 12 },
  },
  'card.drawOdds': {
    args: { candidates: [{ card: 'a', rarity: 'common', drawable: true }, { card: 'b', rarity: 'rare', drawable: true }] },
    moved: { candidates: [{ card: 'a', rarity: 'common', drawable: false }, { card: 'b', rarity: 'rare', drawable: true }] },
  },
  'workshop.screenValue': {
    args: { input: { stat: 'Damage', level: 10 } },
    moved: { input: { stat: 'Damage', level: 200 } },
  },
  'workshop.relicBenefitByStat': { args: { relicIndices: [] }, moved: { relicIndices: [0, 1, 2, 3, 4] } },
  'workshop.nextUnlock': { args: { category: 'attack', unlocked: 5 }, moved: { category: 'defense', unlocked: 8 } },
  'uw.nextUnlockStoneCost': { args: { owned: 6 }, moved: { owned: 0 } },
  'uw.nextPlusUnlockStoneCost': { args: { ownedPlusCount: 0 }, moved: { ownedPlusCount: 8 } },
  'lab.rushGems': {
    args: { remainingHours: 134.678333, maxedLabCount: 19 },
    moved: { remainingHours: 134.678333, maxedLabCount: 0 },
  },
  'lab.gemRushEfficiency': { args: { maxedLabCount: 0 }, moved: { maxedLabCount: 19 } },
  'event.shopPrice': { args: { item: 'relic', rarity: 'Rare' }, moved: { item: 'relic', rarity: 'Epic' } },
  'event.relicSet': { args: { name: 'Full Moon' }, moved: { name: 'Rainfall' } },
  'format.gameNumber': { args: { value: 12_228_041 }, moved: { value: 25_200 } },
}
