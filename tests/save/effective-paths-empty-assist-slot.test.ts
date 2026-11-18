import { describe, expect, it } from 'vitest'
import { findModuleInfoIdentity } from '../../src/data/modules/info-catalog'
import { buildEffectiveEconomyInputsFromSave } from '../../src/save/effective-paths/from-save'

/**
 * An assist slot with nothing in it is not an assist module.
 *
 * The module reader reports every assist slot the save has, so that an empty one is visible as
 * empty. Effective Paths read "the slot is listed" as "a module is equipped" and told the planner
 * the Generator had an assist.
 */

/** The first module the catalog files under `category`, as the save would name it. */
function infoIndexFor(category: string): number {
  for (let infoIndex = 1; infoIndex < 500; infoIndex += 1) {
    if (findModuleInfoIdentity(infoIndex)?.category === category) return infoIndex
  }
  throw new Error(`no ${category} module in the info catalog`)
}

const GENERATOR_ASSIST_TYPE = 2
const CORE_ASSIST_TYPE = 3

describe('assist slots in Effective Paths inputs', () => {
  it('does not report an assist for an empty slot', () => {
    const { config } = buildEffectiveEconomyInputsFromSave({
      assistModuleSlots: [
        { type: GENERATOR_ASSIST_TYPE, equippedModule: null },
        { type: CORE_ASSIST_TYPE, equippedModule: null },
      ],
    })
    expect(config.generator.hasAssist).toBe(false)
    expect(config.generator.coreHasAssist).toBe(false)
  })

  it('reports an assist for a slot that holds a module', () => {
    const { config } = buildEffectiveEconomyInputsFromSave({
      assistModuleSlots: [
        { type: GENERATOR_ASSIST_TYPE, equippedModule: { infoIndex: infoIndexFor('Generator'), level: 10, currentRarity: 3 } },
        { type: CORE_ASSIST_TYPE, equippedModule: null },
      ],
    })
    expect(config.generator.hasAssist).toBe(true)
    expect(config.generator.coreHasAssist).toBe(false)
  })
})
