import { describe, expect, it } from 'vitest'
import { V283_CAMPAIGN_HEAT_LEVELS_BY_TIER } from '../../src/data/generated/campaign-tier.generated'
import { getTierBattleConditionLevel, getTierData } from '../../src/data/tiers/data'

/*
 * Tiers 22-24 against the game's own per-tier condition levels (game data v28.3.0), which carry no
 * names, so the comparison is of the levels as a set. The game list also holds the two Tier
 * Overheat entries every tier gets (More Fleets every 100 waves, Skip Decay 1% a wave; wiki
 * "Tiers" § Tier Overheat). More Fleets is left out of TIER_DATA, so its 100 is dropped here.
 * Wiki "Tiers" § Tier Battle Conditions gives the same levels.
 */
const MORE_FLEETS_OVERHEAT = 100

describe('tier battle conditions, tiers 22-24', () => {
  it.each([22, 23, 24] as const)('tier %i holds the game\'s levels', (tier) => {
    const game = [...V283_CAMPAIGN_HEAT_LEVELS_BY_TIER[tier]]
    game.splice(game.indexOf(MORE_FLEETS_OVERHEAT), 1)
    const sdk = getTierData(tier)!.battleConditions.map(condition => condition.level)
    expect([...sdk].sort((a, b) => a - b)).toEqual(game.sort((a, b) => a - b))
  })

  it('names the levels the wiki gives them', () => {
    expect([22, 23, 24].map(tier => getTierBattleConditionLevel(tier, 'ELS Reduction'))).toEqual([75, 80, 85])
    expect([22, 23, 24].map(tier => getTierBattleConditionLevel(tier, 'Armored Enemies'))).toEqual([80, 90, 95])
    expect([22, 23, 24].map(tier => getTierBattleConditionLevel(tier, 'Plasma Cannon Resistance'))).toEqual([95, 95, 95])
    expect([22, 23, 24].map(tier => getTierBattleConditionLevel(tier, 'Tank\'s Ultimate'))).toEqual([95, 95, 95])
    expect([23, 24].map(tier => getTierBattleConditionLevel(tier, 'Scatter\'s Ultimate'))).toEqual([95, 95])
    expect(getTierBattleConditionLevel(24, 'Fast\'s Ultimate')).toBe(95)
    expect(getTierBattleConditionLevel(24, 'Boss\'s Ultimate')).toBe(80)
  })

  it('spawns a boss every 6 waves on tier 17 (More Bosses level 4)', () => {
    expect(getTierBattleConditionLevel(17, 'More Bosses')).toBe(4)
  })
})
