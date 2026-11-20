import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findLabResearchBySlug } from '../../src/data/labs/research'
import { computeEffectiveEconomy } from '../../src/mechanics/effective-paths/eecon-compute'
import { planEffectiveEconomyPath } from '../../src/mechanics/effective-paths/eecon-plan'
import { decodePlayerInfoSaveBytesAsync } from '../../src/node'
import { buildEffectiveEconomyInputsFromSave } from '../../src/save/effective-paths/from-save'
import { readWorkshopFromSaveRoot } from '../../src/save/workshop/read'

/**
 * A plan from a save has to be worth something.
 *
 * On a real v29.2.1 export the economy planner returned `roi: 0` on every step and so listed
 * Coins / Kill Bonus 63 to 99 in level order. `computeEffectiveEconomy` came to exactly 0, for two
 * reasons that multiply:
 *
 * - `config.coinsPerKill.value` was never filled. It is the workshop row's VALUE (`BJ5`), and at 0
 *   the whole base is 0.
 * - `config.weapons.goldBot` was filled with the bot's stat LEVELS where the model reads VALUES
 *   (`BL19`, `BM19`, `BN19`). A Bonus at level 0 became a multiplier of 0, not 2x, and zeroed the
 *   weapon sync.
 *
 * A third mistake hid behind those: the `Gold Bot - Duration` candidate is the LAB (half a second
 * a level, bought with lab time), and it was filled from the bot's medal-bought Duration stat.
 */

const index = (slug: string): number => findLabResearchBySlug(slug)!.index

const COINS_KILL_WORKSHOP_LEVEL = 149
const COINS_KILL_LAB_LEVEL = 62
const GOLD_BOT_DURATION_LAB_LEVEL = 3
/**
 * Bonus, Range, Cooldown, Duration -- the order the SAVE stores them in, which is not the
 * catalog's. Four different numbers on purpose: a fixture whose first and last agree cannot tell
 * the two orders apart.
 */
const GOLD_BOT_SAVE_LEVELS = [5, 7, 1, 2]

function saveWithAnEconomy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const researchLevel = Array.from({ length: 260 }, () => 0)
  researchLevel[index('coins_kill_bonus')] = COINS_KILL_LAB_LEVEL
  researchLevel[index('package_after_boss')] = 1
  researchLevel[index('golden_bot_duration')] = GOLD_BOT_DURATION_LAB_LEVEL

  const upgradeWorkshopUtilityLevel = Array.from({ length: 20 }, () => 0)
  // Cash Bonus, Cash / Wave, Coins / Kill Bonus: the third utility row.
  upgradeWorkshopUtilityLevel[2] = COINS_KILL_WORKSHOP_LEVEL

  return {
    researchLevel,
    upgradeWorkshopLevel: Array.from({ length: 20 }, () => 0),
    upgradeWorkshopDefenseLevel: Array.from({ length: 20 }, () => 0),
    upgradeWorkshopUtilityLevel,
    currentBotPreset: 0,
    goldenBotPresets: [{
      unlocked: true,
      active: true,
      levels: GOLD_BOT_SAVE_LEVELS,
      selectedLevels: GOLD_BOT_SAVE_LEVELS,
      plusUnlocked: false,
      plusLevel: 0,
    }],
    ...overrides,
  }
}

describe('the economy config built from a save', () => {
  it('reads the fixture the way the test means it', () => {
    const workshop = readWorkshopFromSaveRoot(saveWithAnEconomy())
    expect(workshop?.active.levels['Coins / Kill Bonus']).toBe(COINS_KILL_WORKSHOP_LEVEL)
  })

  it('fills the Coins / Kill workshop value, not just the lab level', () => {
    const { config, levels } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())

    // x1.00 at level 0 and 0.01 a level: x2.49 at 149.
    expect(config.coinsPerKill.value).toBeCloseTo(2.49, 10)
    expect(levels.time.coinsPerKillBonus).toBe(COINS_KILL_LAB_LEVEL)
  })

  it('gives the Golden Bot its stat values, not its stat levels', () => {
    const { config } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())

    expect(config.weapons.goldBot.unlocked).toBe(true)
    // 2.0x and 0.2x a level, at level 5.
    expect(config.weapons.goldBot.bonus).toBeCloseTo(3, 10)
    // 20s and half a second a level, at level 2.
    expect(config.weapons.goldBot.duration).toBeCloseTo(21, 10)
    // 120s less three seconds a level, at level 1.
    expect(config.weapons.goldBot.cooldown).toBeCloseTo(117, 10)
  })

  it('leaves a bot the player does not own switched off at its neutral values', () => {
    const { config } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy({ goldenBotPresets: [] }))

    expect(config.weapons.goldBot.unlocked).toBe(false)
    expect(config.weapons.goldBot.bonus).toBe(1)
  })

  it('fills Gold Bot - Duration from the lab, not from the bot stat', () => {
    const { levels, mapped } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())

    expect(levels.time.goldBotDuration).toBe(GOLD_BOT_DURATION_LAB_LEVEL)
    expect(mapped).toContain('Gold Bot - Duration')
  })

  it('carries the Package After Boss lab', () => {
    const { config } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())
    expect(config.packageAfterBossLevel).toBe(1)
  })

  it('comes to an economy above zero', () => {
    const { config, levels } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())
    const breakdown = computeEffectiveEconomy(config, levels)

    expect(breakdown.base).toBeGreaterThan(0)
    expect(breakdown.sync).toBeGreaterThan(0)
    expect(breakdown.effectiveEconomy).toBeGreaterThan(0)
  })

  it('plans steps that are worth something', () => {
    const { config, levels } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())
    const plan = planEffectiveEconomyPath({ config, levels, variant: 'time', steps: 5 })

    expect(plan.steps.length).toBeGreaterThan(0)
    for (const step of plan.steps) expect(step.roi, step.name).toBeGreaterThan(0)
  })
})

describe('what the save could not say about the config', () => {
  it('names every config input it left at its default, with a reason', () => {
    const { unfilledConfig } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())

    expect(unfilledConfig.length).toBeGreaterThan(0)
    for (const entry of unfilledConfig) {
      expect(entry.input).toBeTruthy()
      expect(entry.reason).toBeTruthy()
    }
    const inputs = unfilledConfig.map(entry => entry.input)
    expect(inputs).toContain('perks')
    expect(inputs).toContain('cards')
    expect(inputs).toContain('substats')
  })

  it('says so rather than guessing when the Golden Bot Cooldown lab has levels', () => {
    const researchLevel = saveWithAnEconomy().researchLevel as number[]
    researchLevel[index('golden_bot_cooldown')] = 4
    const { config, unfilledConfig } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy({ researchLevel }))

    expect(config.goldBotCooldownLabSeconds).toBe(0)
    expect(unfilledConfig.map(entry => entry.input)).toContain('goldBotCooldownLabSeconds')
  })

  it('does not list the Golden Bot Cooldown lab when it has no levels to apply', () => {
    const { unfilledConfig } = buildEffectiveEconomyInputsFromSave(saveWithAnEconomy())
    expect(unfilledConfig.map(entry => entry.input)).not.toContain('goldBotCooldownLabSeconds')
  })

  it('still answers for something that is not a save', () => {
    const { unfilledConfig, config } = buildEffectiveEconomyInputsFromSave({})

    expect(Array.isArray(unfilledConfig)).toBe(true)
    // No workshop row to read: the value stays 0 and is reported, not passed off as x1.00.
    expect(config.coinsPerKill.value).toBe(0)
    expect(unfilledConfig.map(entry => entry.input)).toContain('coinsPerKill.value')
  })
})

const savePath = process.env.TOWER_TEST_SAVE

describe.skipIf(!savePath)('a real export', () => {
  it('plans an economy path whose steps are worth something', async () => {
    const { parsedRoot } = await decodePlayerInfoSaveBytesAsync(readFileSync(savePath!))
    const { config, levels } = buildEffectiveEconomyInputsFromSave(parsedRoot)
    const plan = planEffectiveEconomyPath({ config, levels, variant: 'time', steps: 10 })

    expect(computeEffectiveEconomy(config, levels).effectiveEconomy).toBeGreaterThan(0)
    expect(plan.steps.length).toBeGreaterThan(0)
    for (const step of plan.steps) expect(step.roi, step.name).toBeGreaterThan(0)
  })
})
