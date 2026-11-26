/**
 * Sample arguments for the `survival.*` calculators, and a second set that must answer differently.
 *
 * The save-reading ones take the newest reading of the trimmed fixture as `root`, and are kept
 * small — one run, a handful of seeds — because the registry tests run every sample several times.
 */
import fixture from '../../fixtures/save/survival-t7.snapshots.json'
import { survivalTestState } from './survival-state'

const ROOT = fixture.snapshots.at(-1) as Record<string, unknown>
const QUICK_FIT = { maxRuns: 1, seeds: 1, passes: 1, skipLeaveOneOut: true }

export const SURVIVAL_CALCULATOR_SAMPLES: Record<string, { args: Record<string, unknown>, moved: Record<string, unknown> }> = {
  'survival.healingForWave': {
    args: { state: survivalTestState(), wave: 100, options: { health: 1000, packages: 1 } },
    moved: { state: survivalTestState(), wave: 100, options: { health: 1000, packages: 2 } },
  },
  'survival.incomingDamageForWave': {
    args: { state: survivalTestState(), wave: 500 },
    moved: { state: survivalTestState(), wave: 500, context: { attackSkips: 100 } },
  },
  'survival.calibrateFromHistory': {
    args: { root: ROOT, options: { ...QUICK_FIT } },
    moved: { root: ROOT, options: { ...QUICK_FIT, baseSeed: 9 } },
  },
  'survival.simulateRun': {
    args: { root: ROOT, options: { seeds: 4 } },
    moved: { root: ROOT, options: { seeds: 4, baseSeed: 9 } },
  },
  'survival.rankUpgrades': {
    args: { root: ROOT, candidates: [{ stat: 'Health', toLevel: 1500 }], options: { seeds: 4 } },
    moved: { root: ROOT, candidates: [{ stat: 'Health', toLevel: 1400 }], options: { seeds: 4 } },
  },
}
