import { describe, expect, it } from 'vitest'
import { enemyWaveCalculator } from '../../src/builders/enemy-wave'
import { MAX_CAMPAIGN_TIER } from '../../src/data'

/**
 * The enemy calculator covers every tier the game has.
 *
 * It clamped tier to 18 while the campaign runs to `MAX_CAMPAIGN_TIER`, so a question about tier
 * 20 was answered, without a note, with tier 18's enemies.
 */
describe('enemy.wave tier range', () => {
  it('accepts tiers up to the campaign cap', () => {
    expect(enemyWaveCalculator.normalize({ tier: MAX_CAMPAIGN_TIER }).tier).toBe(MAX_CAMPAIGN_TIER)
    expect(enemyWaveCalculator.fields.find(field => field.key === 'tier')?.max).toBe(MAX_CAMPAIGN_TIER)
  })

  it('does not answer a high tier with a lower one', () => {
    const at18 = enemyWaveCalculator.compute({ tier: 18, wave: 100 })
    const at20 = enemyWaveCalculator.compute({ tier: 20, wave: 100 })
    expect(at20.baseHealth).toBeGreaterThan(at18.baseHealth)
  })

  it('still clamps a tier past the cap', () => {
    expect(enemyWaveCalculator.normalize({ tier: MAX_CAMPAIGN_TIER + 10 }).tier).toBe(MAX_CAMPAIGN_TIER)
  })
})
