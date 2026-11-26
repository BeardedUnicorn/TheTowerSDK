/**
 * A small account for the survival tests: low levels on tier 3, so a run dies within a few hundred
 * waves and a test that simulates dozens of them stays fast.
 */
import type { SurvivalLevels, SurvivalState } from '../../src/mechanics/survival/types'

export const SURVIVAL_TEST_LEVELS: SurvivalLevels = {
  'Health': 300,
  'Health Regen': 100,
  'Defense Percent': 40,
  'Defense Absolute': 50,
  'Recovery Amount': 20,
  'Max Recovery': 30,
  'Package Chance': 30,
  'Lifesteal': 20,
  'Death Defy': 10,
  'Enemy Attack Level Skip': 0,
  'Enemy Health Level Skip': 0,
}

export function survivalTestState(overrides: Partial<SurvivalState> = {}, levels: Partial<SurvivalLevels> = {}): SurvivalState {
  return {
    tier: 3,
    levels: { ...SURVIVAL_TEST_LEVELS, ...levels },
    bonuses: {
      healthMultiplier: 2,
      healthRegenMultiplier: 1,
      defenseAbsoluteMultiplier: 1,
      defensePercentAdd: 0.1,
      recoveryAmountAdd: 0,
      maxRecoveryAdd: 0,
      packageChanceAdd: 0.1,
      lifestealMultiplier: 1,
      otherDamageTakenMultiplier: 1,
    },
    spawn: {
      countScale: 1,
      enemyBalanceMultiplier: 1,
      shares: { basic: 0.6, fast: 0.14, tank: 0.14, ranged: 0.11, protector: 0.01 },
      eliteScale: 1,
      eliteShares: { vampire: 0.34, ray: 0.33, scatter: 0.33 },
    },
    freeUpgrades: { defenseChance: 0.5, utilityChance: 0.5, otherDefenseTargets: 1, otherUtilityTargets: 0 },
    deathWave: { maxHealthFractionPerWave: 0, maxHealthFractionCap: 0 },
    packageAfterBoss: true,
    waveSkipChance: 0.1,
    effectiveDamage: 1000,
    effectiveDamageGrowthPerWave: 1,
    projectileKillShare: 0.4,
    ...overrides,
  }
}
