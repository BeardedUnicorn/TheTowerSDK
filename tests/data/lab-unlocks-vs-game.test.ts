import { describe, expect, it } from 'vitest'
import { findLabResearchByIndex } from '../../src/data/labs/research'
import { LAB_UNLOCKS } from '../../src/data/labs/unlocks'

/*
 * Every lab the game gates on a milestone sits where the game's research index puts it. The
 * index records the tier and the milestone slot (slot i = the i-th milestone wave); a lab it
 * records at tier 0 is not milestone-gated (card masteries, some perk and UW labs), so the sheet's
 * gate for those is a different kind of unlock and is not compared here.
 *
 * Before v29.2 the table copied the Effective Paths sheet, which put the Effect Bans at T2 W20,
 * Bot Bot - Cooldown at T10 W60 and the tier 10 bot / tier 16 Swamp Rend labs at wave 60.
 */
const MILESTONE_WAVES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 4500]

describe('lab unlocks against the game research index', () => {
  it('places every milestone-gated lab where the game does', () => {
    const wrong: string[] = []
    let compared = 0
    for (let index = 0; index < 300; index += 1) {
      const research = findLabResearchByIndex(index)
      if (!research?.displayName || !research.tierUnlock || research.milestoneUnlock == null) continue
      const ours = LAB_UNLOCKS[research.displayName]
      if (!ours || typeof ours !== 'object') continue
      compared += 1
      const wave = MILESTONE_WAVES[research.milestoneUnlock]
      if (ours.tier !== research.tierUnlock || ours.wave !== wave) {
        wrong.push(`${research.displayName}: ours T${ours.tier} W${ours.wave}, game T${research.tierUnlock} W${wave}`)
      }
    }
    expect(wrong).toEqual([])
    expect(compared).toBeGreaterThanOrEqual(160)
  })

  it('lists the v29 labs the sheet does not', () => {
    for (const name of ['Global Presets', 'Saboteur Attack Speed', 'Commander Radius', 'Overcharge Exponent Reducer']) {
      expect(LAB_UNLOCKS[name], name).toBeDefined()
    }
  })
})
