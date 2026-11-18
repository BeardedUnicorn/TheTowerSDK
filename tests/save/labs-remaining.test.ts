import { describe, expect, it } from 'vitest'
import { LAB_CATALOG } from '../../src/data/labs/catalog.data'
import { estimateLabLevelRemainingSeconds, getStaticLabWorkingLevelDurationHours } from '../../src/save/labs/remaining'

const lab = LAB_CATALOG.find(entry => entry.name === 'Game Speed')!
const maxLevel = Math.max(...lab.levels.map(entry => entry.level))

describe('time left on a lab', () => {
  it('has no next level to time once the lab is maxed', () => {
    expect(getStaticLabWorkingLevelDurationHours(lab.name, maxLevel)).toBeNull()
    expect(estimateLabLevelRemainingSeconds(lab.name, maxLevel, 0)).toBeNull()
  })

  it('still times the last level while it is being researched', () => {
    expect(getStaticLabWorkingLevelDurationHours(lab.name, maxLevel - 1)).toBeGreaterThan(0)
    expect(estimateLabLevelRemainingSeconds(lab.name, maxLevel - 1, 0.5)).toBeGreaterThan(0)
  })
})
