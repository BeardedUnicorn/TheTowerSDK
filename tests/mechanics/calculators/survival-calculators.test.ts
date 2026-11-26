/**
 * The `survival.*` handles answer what the functions behind them answer, and refuse what they
 * do not declare.
 */
import { describe, expect, it } from 'vitest'
import { CalculatorError, runCalculator } from '../../../src/calculators/run'
import { calculatorSpec } from '../../../src/calculators/registry'
import { healingForWave, incomingDamageForWave } from '../../../src/mechanics/survival'
import { rankSurvivalUpgradesFromSave, simulateSurvivalRunFromSave } from '../../../src/save/survival'
import { SURVIVAL_CALCULATOR_SAMPLES as SAMPLES } from '../../helpers/survival-calculator-samples'
import { survivalTestState } from '../../helpers/survival-state'

describe('survival calculators', () => {
  it('declares the five handles the spec names, curated', () => {
    for (const id of ['healingForWave', 'incomingDamageForWave', 'calibrateFromHistory', 'simulateRun', 'rankUpgrades']) {
      const spec = calculatorSpec(`survival.${id}`)
      expect(spec, id).toBeDefined()
      expect(spec?.tier ?? 'curated').toBe('curated')
    }
  })

  it('survival.healingForWave is healingForWave', () => {
    const { args } = SAMPLES['survival.healingForWave']
    expect(runCalculator('survival.healingForWave', args).value)
      .toEqual(healingForWave(survivalTestState(), 100, { health: 1000, packages: 1 }))
  })

  it('survival.incomingDamageForWave is incomingDamageForWave, context included', () => {
    const { moved } = SAMPLES['survival.incomingDamageForWave']
    expect(runCalculator('survival.incomingDamageForWave', moved).value)
      .toEqual(incomingDamageForWave(survivalTestState(), 500, undefined, { attackSkips: 100 }))
  })

  it('survival.simulateRun reads the save it is handed as root', () => {
    const { args } = SAMPLES['survival.simulateRun']
    expect(runCalculator('survival.simulateRun', args).value)
      .toEqual(simulateSurvivalRunFromSave({ save: args.root, seeds: 4 }))
  })

  it('survival.rankUpgrades prices and ranks its candidates', () => {
    const { args } = SAMPLES['survival.rankUpgrades']
    const value = runCalculator('survival.rankUpgrades', args).value as ReturnType<typeof rankSurvivalUpgradesFromSave>
    expect(value).toEqual(rankSurvivalUpgradesFromSave({ save: args.root, candidates: [{ stat: 'Health', toLevel: 1500 }], seeds: 4 }))
    expect(Math.round((value?.ranked[0].coins ?? 0) / 1e7) / 100).toBe(7.95)
  })

  it('survival.calibrateFromHistory returns a calibration and accounts for every run', () => {
    const { args } = SAMPLES['survival.calibrateFromHistory']
    const value = runCalculator('survival.calibrateFromHistory', args).value as {
      runsUsed: number, skipped: unknown[], perRun: unknown[], leaveOneOutError: number | null, warnings: string[]
    }
    expect(value.runsUsed).toBe(1)
    expect(value.perRun).toHaveLength(1)
    expect(value.leaveOneOutError).toBeNull()
    /* No snapshots were given, so the fit says the state may not be the one the run was played with. */
    expect(value.warnings.join(' ')).toMatch(/no stored snapshots/)
  })

  it('refuses an option it does not declare, rather than ignoring it', () => {
    const { args } = SAMPLES['survival.simulateRun']
    expect(() => runCalculator('survival.simulateRun', { ...args, options: { seed: 4 } })).toThrow(CalculatorError)
    expect(() => runCalculator('survival.healingForWave', { state: survivalTestState() })).toThrow(/needs "wave"/)
  })

  it('returns null for a save with no workshop', () => {
    expect(runCalculator('survival.simulateRun', { root: {} }).value).toBeNull()
    expect(runCalculator('survival.rankUpgrades', { root: {}, candidates: [] }).value).toBeNull()
    expect(runCalculator('survival.calibrateFromHistory', { root: {} }).value).toBeNull()
  })
})
