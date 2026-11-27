/**
 * Sample arguments for the planning, history and current-run calculators, and a second set that
 * must answer differently.
 *
 * The planning ones take the newest reading of the trimmed fixture as `root` and the ten before
 * it as `snapshots`. The survival model is left out of the samples that could run it: the
 * registry tests run every sample several times, and a fit takes seconds.
 */
import { zeroEffectiveEconomyConfig } from '../../src/mechanics/effective-paths/eecon-compute'
import { ZERO_EFFECTIVE_ECONOMY_LEVELS } from '../../src/mechanics/effective-paths/eecon-levels'
import { ZERO_EFFECTIVE_HEALTH_LEVELS, zeroEffectiveHealthConfig } from '../../src/mechanics/effective-paths/ehp-model'
import { PLANNING_HISTORY, PLANNING_SAVE, PLANNING_SNAPSHOTS } from './planning-fixture'

const snapshots = PLANNING_HISTORY
const RUN = {
  exportVersion: 1, exportedAt: '2026-11-26T20:34:28.974Z', versionNumber: 1301, dataVersion: 35,
  currentTier: 7, currentWave: 532, roundActiveBool: true, realTimeThisRound: 3374, gameplayTimeThisRound: 13_496,
  coinsEarnedThisRound: 3e8, cellsEarnedThisRound: 16,
  upgradeWorkshopLevel: [805], upgradeWorkshopDefenseLevel: [1300, 0], upgradeWorkshopUtilityLevel: [149],
  upgradeLevel: [1425], upgradeDefenseLevel: [1577, 105], upgradeUtilityLevel: [149],
  freeAttackUpgradesThisRound: 620, freeDefenseUpgradesThisRound: 382, freeUtilityUpgradesThisRound: 0,
}
const BASE = (PLANNING_SAVE as { readers: { readTotalCoinBonusFromSaveRoot: { input: Record<string, unknown> } } }).readers.readTotalCoinBonusFromSaveRoot.input

export const PLANNING_CALCULATOR_SAMPLES: Record<string, { args: Record<string, unknown>, moved: Record<string, unknown> }> = {
  'planning.forecastIncome': {
    args: { root: PLANNING_SAVE, options: { snapshots } },
    moved: { root: PLANNING_SAVE, options: { snapshots, hoursPerDay: 5 } },
  },
  'planning.affordableBy': {
    args: { root: PLANNING_SAVE, list: [{ name: 'Health 1300 → 1500', coins: 7.95e9 }], options: { snapshots } },
    moved: { root: PLANNING_SAVE, list: [{ name: 'Health 1300 → 1500', coins: 9e9 }], options: { snapshots } },
  },
  'planning.checkCoinModel': {
    args: { root: PLANNING_SAVE, options: { snapshots } },
    moved: { root: PLANNING_SAVE },
  },
  'planning.rankSpends': {
    args: { root: PLANNING_SAVE, options: { snapshots, passThrough: 1, include: ['dissonant-run'], dissonantWave: 2000 } },
    moved: { root: PLANNING_SAVE, options: { snapshots, passThrough: 1, include: ['dissonant-run'], dissonantWave: 2200 } },
  },
  'planning.scheduleLabs': {
    args: { root: PLANNING_SAVE, options: { snapshots } },
    moved: { root: PLANNING_SAVE, options: { snapshots, horizonDays: 1 } },
  },
  'planning.cellBudget': {
    args: { root: PLANNING_SAVE, options: { snapshots, floor: 5000 } },
    moved: { root: PLANNING_SAVE, options: { snapshots, floor: 5000, maxMultiplier: 1.5 } },
  },
  'planning.dissonancePayback': {
    args: { root: PLANNING_SAVE, options: { snapshots, waves: [2000], passThrough: 1 } },
    moved: { root: PLANNING_SAVE, options: { snapshots, waves: [2200], passThrough: 1 } },
  },
  'planning.planSpending': {
    args: { root: PLANNING_SAVE, options: { snapshots, includeSurvival: false } },
    moved: { root: PLANNING_SAVE, options: { snapshots, includeSurvival: false, horizonDays: 1 } },
  },
  'currentRun.inRunLevels': {
    args: { root: RUN },
    moved: { root: { ...RUN, upgradeDefenseLevel: [1700, 105] } },
  },
  'currentRun.progress': {
    args: { root: RUN },
    moved: { root: { ...RUN, realTimeThisRound: 7000 } },
  },
  'history.snapshot': {
    args: { root: RUN },
    moved: { root: { ...RUN, currentWave: 600 } },
  },
  'history.diff': {
    args: { from: PLANNING_SNAPSHOTS.at(-2), to: PLANNING_SNAPSHOTS.at(-1) },
    moved: { from: PLANNING_SNAPSHOTS.at(-3), to: PLANNING_SNAPSHOTS.at(-1) },
  },
  'history.timeline': {
    args: { snapshots: PLANNING_SNAPSHOTS, options: { kinds: ['purchase'] } },
    moved: { snapshots: PLANNING_SNAPSHOTS, options: { kinds: ['workshop'] } },
  },
  'history.stateAt': {
    args: { snapshots: PLANNING_SNAPSHOTS, at: '2026-11-26T05:00:00Z' },
    moved: { snapshots: PLANNING_SNAPSHOTS, at: '2026-11-26T07:00:00Z' },
  },
  'workshop.accountCoinCostBetween': {
    args: { root: RUN, stat: 'Recovery Amount', fromLevel: 35, toLevel: 100 },
    moved: { root: RUN, stat: 'Recovery Amount', fromLevel: 35, toLevel: 90 },
  },
  'epaths.effectiveHealth': {
    args: { config: zeroEffectiveHealthConfig(), levels: ZERO_EFFECTIVE_HEALTH_LEVELS },
    moved: { config: { ...zeroEffectiveHealthConfig(), health: { workshopLevel: 1300 } }, levels: ZERO_EFFECTIVE_HEALTH_LEVELS },
  },
  'epaths.effectiveEconomy': {
    args: { config: { ...zeroEffectiveEconomyConfig(), coinsPerKill: { value: 2, relicPct: 0, vaultPct: 0 } }, levels: ZERO_EFFECTIVE_ECONOMY_LEVELS },
    moved: { config: { ...zeroEffectiveEconomyConfig(), coinsPerKill: { value: 3, relicPct: 0, vaultPct: 0 } }, levels: ZERO_EFFECTIVE_ECONOMY_LEVELS },
  },
  'coinBonus.scenarios': {
    args: { base: BASE, scenarios: [{ name: 'wave 2000', dissonanceWave: { tier: 7, wave: 2000 } }] },
    moved: { base: BASE, scenarios: [{ name: 'wave 2000', dissonanceWave: { tier: 7, wave: 2200 } }] },
  },
}
