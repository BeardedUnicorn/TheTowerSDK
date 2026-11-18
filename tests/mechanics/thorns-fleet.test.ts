import { describe, expect, it } from 'vitest'
import { buildThornsBaseChart, buildThornsWallChart } from '../../src/mechanics/combat/thorns-calculator'

/*
 * Patch note 1521195318136275124 (v28.3): thorns went from 10% to 15% effective against fleets and
 * now take a percent of health REMAINING. Wiki "Fleet Enemies": 85% thorns resistance, current
 * health basis. The model used 0.85 of an elite's max-health damage, about 5.7x too strong.
 */
describe('thorns against fleets', () => {
  it('halves a fleet at 15% effectiveness on remaining health', () => {
    // Base 100%, wall thorns 10 at tier 1: 10% per hit to an elite, 1.5% of remaining to a fleet.
    const row = buildThornsWallChart({ baseThorns: 100, tier: 1 }).find(r => r.wallThorns === 10)!
    expect(row.hitsToKillElite).toBe(11)
    // (1 - 0.015)^n <= 0.5 first at n = 46.
    expect(row.hitsToHalveFleet).toBe(46)
    expect(row.hitsToKillFleet).toBeNull()
  })

  it('reports null rather than a hit count when thorns do nothing', () => {
    const [row] = buildThornsBaseChart({ baseThorns: 0, tier: 1 })
    expect(row.hitsToHalveFleet).toBeNull()
  })

  it('reads Mythic heat from the same column as Legend', () => {
    const legend = buildThornsWallChart({ tournamentTier: 't17', heatWave: 400 })
    const mythic = buildThornsWallChart({ tournamentTier: 't23', heatWave: 400 })
    expect(mythic).toEqual(legend)
  })
})
