import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { V283_CAMPAIGN_HEAT_LEVELS_BY_TIER } from '../../src/data/generated/campaign-tier.generated'
import { getTierBattleConditionLevel, getTierData } from '../../src/data/tiers/data'

/*
 * Every campaign tier's battle conditions against game data v29.2.1
 * (facts/v29.2.1/tier-battle-conditions.json), which names each one.
 *
 * TIER_DATA lists the conditions active from the first wave. The game also gives every tier two
 * Tier Overheat entries, Skip Decay (level 100) and More Fleets (level 1), which start at wave
 * 15000 on tier 1 and 250 waves earlier per tier, down to 10000. Those are left out here.
 *
 * Names settled by the game data: the tier 21-24 entry at 25/35/50/65 is Mass Enforcement (the
 * SDK called it Basic's Ultimate), there is no Mass Enforcement at level 1 (that 1 was More
 * Fleets), and ELS Reduction is 40, 55 and 70 on tiers 19-21 (the SDK had 30, 35 and 40).
 */
interface FactCondition { condition: number, name: string, level: number, overheat: boolean, fromWave: number }
const facts: { gameVersion: string, tiers: Record<string, FactCondition[]> }
  = JSON.parse(readFileSync(new URL('../../facts/v29.2.1/tier-battle-conditions.json', import.meta.url), 'utf8'))

/** The game's name where the SDK names a condition differently. */
const SDK_NAME: Readonly<Record<string, string>> = { 'Skip Reduction - Subtract': 'ELS Reduction' }

const fromStart = (tier: number) => facts.tiers[String(tier)]
  .filter(entry => entry.fromWave <= 1)
  .map(entry => `${SDK_NAME[entry.name] ?? entry.name} ${entry.level}`)
  .sort()

describe('tier battle conditions, as game data v29.2.1 has them', () => {
  it('reads facts for the right build', () => {
    expect(facts.gameVersion).toBe('v29.2.1')
    expect(Object.keys(facts.tiers)).toHaveLength(24)
  })

  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('tier %i has the game\'s conditions at the game\'s levels', (tier) => {
    const sdk = (getTierData(tier)?.battleConditions ?? []).map(condition => `${condition.name} ${condition.level}`).sort()
    expect(sdk).toEqual(fromStart(tier))
  })

  it('agrees with the game list read from v28.3, which carried no names', () => {
    for (const tier of [22, 23, 24] as const) {
      expect(facts.tiers[String(tier)].map(entry => entry.level)).toEqual([...V283_CAMPAIGN_HEAT_LEVELS_BY_TIER[tier]])
    }
  })

  it('gives every tier the two overheat entries, from wave 15000 down to 10000', () => {
    for (let tier = 1; tier <= 24; tier++) {
      const overheat = facts.tiers[String(tier)].filter(entry => entry.fromWave > 1)
      const wave = Math.max(10000, 15000 - 250 * (tier - 1))
      expect(overheat.map(entry => [entry.name, entry.level, entry.fromWave])).toEqual([
        ['Skip Decay', 100, wave],
        ['More Fleets', 1, wave],
      ])
    }
  })

  it('names the levels the counter labs read', () => {
    expect([19, 20, 21, 22, 23, 24].map(tier => getTierBattleConditionLevel(tier, 'ELS Reduction'))).toEqual([40, 55, 70, 75, 80, 85])
    expect([21, 22, 23, 24].map(tier => getTierBattleConditionLevel(tier, 'Mass Enforcement'))).toEqual([25, 35, 50, 65])
    expect(getTierBattleConditionLevel(24, 'Boss\'s Ultimate')).toBe(80)
  })

  it('spawns a boss every 6 waves on tier 17 (More Bosses level 4)', () => {
    expect(getTierBattleConditionLevel(17, 'More Bosses')).toBe(4)
  })
})
