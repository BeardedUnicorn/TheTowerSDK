import { describe, expect, it } from 'vitest'
import { listCalculators, runCalculator } from '../../../src/calculators'
import { WORKSHOP_DATA } from '../../../src/data'
import { workshopStatValue } from '../../../src/mechanics/effective-paths/workshop-values'

/**
 * The unit each workshop calculator declares.
 *
 * `number` is the type of 0.0005 and of 0.05 alike, so a calculator that returns one without
 * saying which is how Enemy Attack Level Skip was read as 0.5% a level. A function states its unit
 * with `@unit` in its doc comment and the registry carries it to `calc_describe` and `calc_run`.
 *
 * Two things are held here. Every workshop calculator that returns a number either declares a
 * unit or is named below as one whose unit has not been established, so a new one cannot arrive
 * unlabelled without somebody deciding. And each declared unit is checked against the upgrade
 * table or the Workshop screen, not against the function that carries it.
 */
const workshop = listCalculators().filter(spec =>
  /workshop/i.test(`${spec.id} ${spec.module} ${spec.symbol} ${spec.title}`))

const run = (id: string, args: Record<string, unknown>): number => runCalculator(id, args).value as number
const game = (stat: string, level: number): number => workshopStatValue(stat, level)!.value

/**
 * Numbers left without a unit, each for a stated reason. Naming one for any of these would be a
 * guess, or would claim more than the function knows.
 */
const UNIT_NOT_ESTABLISHED = [
  // Takes the unit of what it is given: a generic combine and a 32-bit power.
  'mechanics.combineWorkshopPreviewStat',
  'mechanics.f32Pow',
  // Not checked against the game. With neutral inputs neither gives its upgrade's table row:
  // the free-upgrade tail adds 1 to a chance, and the lifesteal one grows as tier^1.5.
  'mechanics.getOutOfRoundFreeUpgradeChancePreview',
  'mechanics.getOutOfRoundLifestealPreview',
  // Internal slot values of the lab-to-workshop routine. They have no unit a player would see;
  // `workshopMultFromTableFloat` is where one becomes a multiplier.
  'mechanics.labWorkshopDivisorS13',
  'mechanics.labWorkshopEnemyExtendedFloat',
  'mechanics.labWorkshopSlotFloat',
  'mechanics.workshopTableFloatFromBuild',
]

describe('every workshop number says what it is in', () => {
  it('declares a unit, or is listed as not established', () => {
    const unlabelled = workshop
      .filter(spec => spec.returns.kind === 'number' && !spec.returns.unit)
      .map(spec => spec.id)
      .sort()
    expect(unlabelled).toEqual(UNIT_NOT_ESTABLISHED)
  })

  it('does not list one that has since been given a unit', () => {
    const byId = new Map(workshop.map(spec => [spec.id, spec]))
    for (const id of UNIT_NOT_ESTABLISHED) expect(byId.get(id), id).toBeDefined()
  })

  it('carries a unit on the generated tier, where there used to be none', () => {
    const generated = workshop.filter(spec => spec.tier === 'generated' && spec.returns.unit)
    expect(generated.length).toBeGreaterThanOrEqual(35)
    const spec = workshop.find(entry => entry.id === 'data.computeDiscountedWorkshopCost')!
    expect(spec.returns.unit).toBe('coins')
    expect(spec.params.map(param => param.unit)).toEqual(['coins', 'percent'])
  })
})

describe('the declared units are the game\'s', () => {
  const unitOf = (id: string): string | undefined => workshop.find(spec => spec.id === id)?.returns.unit

  it('discounts are percentages: lab level 30 is the 15% that makes 300M show as 255.00M', () => {
    expect(unitOf('data.workshopLabLevelToSectionDiscountPercent')).toBe('percent')
    expect(run('data.workshopLabLevelToSectionDiscountPercent', { level: 30 })).toBe(15)
    expect(unitOf('data.computeWorkshopTotalDiscountPercent')).toBe('percent')
    expect(run('data.computeWorkshopTotalDiscountPercent', { sectionDiscountPercent: 15, vaultDiscountPercent: 2.5 })).toBe(17.5)
    expect(unitOf('data.computeDiscountedWorkshopCost')).toBe('coins')
    expect(run('data.computeDiscountedWorkshopCost', { baseCost: 300_000_000, totalDiscountPercent: 15 })).toBe(255_000_000)
  })

  it('level skip is a fraction: 0.0005 at level 0, the 0.05% on screen', () => {
    expect(unitOf('mechanics.levelSkipWorkshopBase')).toMatch(/^fraction/)
    expect(run('mechanics.levelSkipWorkshopBase', { utilityLevel: 0, kind: 'attack' })).toBeCloseTo(0.0005, 9)
    expect(run('mechanics.levelSkipWorkshopBase', { utilityLevel: 699, kind: 'attack' })).toBeCloseTo(0.35, 6)
    const both = runCalculator('mechanics.computeWorkshopSkipChances', {
      levels: { attackUtilityLevel: 0, healthUtilityLevel: 0, enhancementLevel: 0 },
    }).value as { attack: number, attackPct: number }
    expect(both.attack).toBeCloseTo(0.0005, 9)
    expect(both.attackPct).toBeCloseTo(0.05, 9)
  })

  it('the previews agree with the table in the unit each one names', () => {
    const neutral = { workshopCurveMult: 0 }
    // A share of max health, as the table and the Recovery Amount row have it.
    expect(unitOf('mechanics.getOutOfRoundRecoveryAmountPreview')).toMatch(/^fraction/)
    expect(run('mechanics.getOutOfRoundRecoveryAmountPreview', { input: { workshopLevel: 35, ...neutral } }))
      .toBeCloseTo(game('Recovery Amount', 35), 9)
    expect(unitOf('mechanics.getOutOfRoundRecoveryMaxPreview')).toBe('multiplier')
    expect(run('mechanics.getOutOfRoundRecoveryMaxPreview', { input: { workshopLevel: 45, ...neutral } }))
      .toBeCloseTo(game('Max Recovery', 45), 9)
    // Orb Speed comes back in the table's unit, a tenth of the 6.10 the workshop alone gives.
    expect(unitOf('mechanics.getOutOfRoundOrbSpeedPreview')).toMatch(/^table storage unit/)
    expect(run('mechanics.getOutOfRoundOrbSpeedPreview', { input: { workshopLevel: 38, ...neutral } }) * 10)
      .toBeCloseTo(game('Orb Speed', 38), 6)
    expect(run('mechanics.getOutOfRoundAttackSpeedPreview', {
      input: { workshopLevel: 99, catalogMult: 1, moduleMult: 1, ...neutral },
    })).toBeCloseTo(game('Attack Speed', 99), 6)
  })

  it('damage and the sheet\'s curves are amounts, the table\'s own', () => {
    expect(unitOf('mechanics.workshopDamageAtLevel')).toMatch(/^amount/)
    expect(run('mechanics.workshopDamageAtLevel', { effectiveLevel: 805 })).toBeCloseTo(game('Damage', 805), 6)
    expect(run('mechanics.inRunWorkshopStatValue', { stat: 'Health', level: 1142 })).toBeCloseTo(game('Health', 1142), 6)
    const near = (id: string, stat: string, level: number): void => {
      expect(unitOf(id)).toMatch(/^amount/)
      const table = (WORKSHOP_DATA as unknown as Record<string, Record<string, { value: number }>>)[stat][String(level)].value
      expect(Math.abs(run(id, { level }) / table - 1)).toBeLessThan(1e-5)
    }
    near('mechanics.sheetWorkshopHealthCurve', 'Health', 1142)
    near('mechanics.sheetWorkshopRegenCurve', 'Health Regen', 100)
    near('mechanics.sheetWorkshopDefenseAbsoluteCurve', 'Defense Absolute', 100)
  })

  it('multipliers are multipliers, and levels are levels', () => {
    expect(unitOf('mechanics.coinsPerKillWorkshopValue')).toBe('multiplier')
    expect(run('mechanics.coinsPerKillWorkshopValue', { level: 149 })).toBeCloseTo(game('Coins / Kill Bonus', 149), 9)
    expect(unitOf('mechanics.damageEnhancementMultiplier')).toBe('multiplier')
    expect(run('mechanics.damageEnhancementMultiplier', { enhancementLevel: 10, workshopEnhancementsLabLevel: 1 })).toBeCloseTo(1.1, 12)
    expect(unitOf('mechanics.workshopOvercapMultiplier')).toBe('multiplier')
    expect(run('mechanics.workshopOvercapMultiplier', { level: 6000 })).toBe(1)
    expect(unitOf('mechanics.effectiveDamageUpgradeLevel')).toBe('levels')
    expect(run('mechanics.effectiveDamageUpgradeLevel', { boughtLevel: 4000, damageDecayPenalty: 500 })).toBe(3500)
    expect(unitOf('mechanics.workshopStatMaxLevel')).toBe('levels')
    expect(run('mechanics.workshopStatMaxLevel', { stat: 'Enemy Attack Level Skip' })).toBe(699)
  })

  it('the critical multiplier preview is the Critical Factor row\'s multiplier', () => {
    expect(unitOf('mechanics.getOutOfRoundCriticalMultiplier')).toMatch(/^multiplier/)
    // With nothing but the workshop level it is the table: x14.2 at level 130, x16.2 at 150.
    for (const level of [0, 130, 150]) {
      expect(run('mechanics.getOutOfRoundCriticalMultiplier', {
        input: { workshopLevel: level, workshopStat28: 1, moduleCriticalMultiplier: 0, upgradeSlot18: 0 },
      })).toBeCloseTo(game('Critical Factor', level), 5)
    }
  })

  it('the two previews left unlabelled do not give their upgrade\'s table row', () => {
    // Recorded so the gap is a fact rather than an impression. Free Attack Upgrade is 49.5% at
    // level 99; the shared tail gives 50.5 from the level alone. Lifesteal is 4.46% at level 80.
    expect(run('mechanics.getOutOfRoundFreeUpgradeChancePreview', { input: { workshopCurveValue: 0, levelField: 99 } })).toBe(50.5)
    expect(run('mechanics.getOutOfRoundLifestealPreview', { input: { workshopCurveValue: 0, catalogTier: 80 } }))
      .not.toBeCloseTo(4.46, 1)
  })

  it('enhancement ladders are in coins, starting at 5 billion', () => {
    expect(unitOf('data.getWorkshopCostByKeyAndLevel')).toMatch(/^coins/)
    expect(run('data.getWorkshopCostByKeyAndLevel', { key: 'WSP_DAMAGE', level: 0 })).toBe(5_000_000_000)
    expect(unitOf('data.computeWorkshopEnhancementMaxLevel')).toBe('levels')
    expect(run('data.computeWorkshopEnhancementMaxLevel', { enhancementKey: 'WSP_DAMAGE' })).toBe(600)
  })

  it('an orb\'s fire interval is in seconds', () => {
    expect(unitOf('mechanics.sentryProtocolWorkshopOrbFireInterval')).toBe('seconds')
    expect(run('mechanics.sentryProtocolWorkshopOrbFireInterval', { orbSpeed: 2 })).toBeCloseTo(0.1, 12)
    expect(unitOf('mechanics.shockwaveFrequencyPreview')).toBe('seconds')
  })
})
