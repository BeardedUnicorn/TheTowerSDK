/**
 * Every function the package exports is a calculator, or is on the list of ones that are not.
 *
 * `calc_run` promises the value the shipped function returns, for any function. The registry was
 * generated from seven of the fourteen entry points that export functions, skipped every
 * `index.ts`, and saw only `function` statements — so 89 exported functions could not be called
 * by name and nothing reported it: `lint:calculators` compared the generator with its own output.
 *
 * This compares the registry with the package instead.
 */
import { describe, expect, it } from 'vitest'

import * as assets from '../../../src/assets'
import * as bot from '../../../src/bot'
import * as builders from '../../../src/builders'
import * as calculators from '../../../src/calculators'
import * as charts from '../../../src/charts'
import * as contributions from '../../../src/contributions'
import * as data from '../../../src/data'
import * as formatting from '../../../src/formatting'
import * as knowledge from '../../../src/knowledge'
import * as mechanics from '../../../src/mechanics'
import * as node from '../../../src/node'
import * as save from '../../../src/save'
import * as saveDecoder from '../../../src/save-decoder'
import * as sheets from '../../../src/sheets'
import * as wiki from '../../../src/wiki'

const ENTRY_POINTS: Record<string, Record<string, unknown>> = {
  assets, bot, builders, calculators, charts, contributions, data, formatting, knowledge, mechanics,
  node, save, 'save-decoder': saveDecoder, sheets, wiki,
}

const isClass = (value: unknown) => typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value))

/** `<entry>.<name>` for every plain function an entry point exports. */
const exportedFunctions = Object.entries(ENTRY_POINTS).flatMap(([entry, module]) =>
  Object.entries(module)
    .filter(([, value]) => typeof value === 'function' && !isClass(value))
    .map(([name]) => ({ entry, name, handle: `${entry}.${name}` })))

describe('every exported function is registered', () => {
  const registered = new Set(calculators.CALCULATORS.map(spec => spec.symbol))
  const { NOT_CALCULATORS } = calculators

  it('finds the functions it is checking', () => {
    // A check that iterates nothing passes. Every entry but `contributions` exports a function.
    expect(exportedFunctions.length).toBeGreaterThan(1500)
    for (const entry of Object.keys(ENTRY_POINTS).filter(name => name !== 'contributions')) {
      expect(exportedFunctions.some(fn => fn.entry === entry), `${entry} exports no function`).toBe(true)
    }
  })

  it('has a calculator, or a stated reason, for each', () => {
    const unaccounted = exportedFunctions
      .filter(fn => !registered.has(fn.name) && !Object.hasOwn(NOT_CALCULATORS, fn.handle))
      .map(fn => fn.handle)

    expect(unaccounted, 'run `pnpm calculators:generate`, or say in src/calculators/not-calculators.ts why it is not one')
      .toEqual([])
  })

  it('lists as "not a calculator" only what is exported and unregistered', () => {
    const handles = new Set(exportedFunctions.map(fn => fn.handle))
    const stale = Object.keys(NOT_CALCULATORS).filter(handle => !handles.has(handle))
    expect(stale, 'no longer an exported function').toEqual([])

    const both = Object.keys(NOT_CALCULATORS).filter(handle => calculators.CALCULATOR_IDS.includes(handle))
    expect(both, 'listed as not a calculator and registered as one').toEqual([])

    for (const [handle, reason] of Object.entries(NOT_CALCULATORS)) {
      expect(reason.length, `${handle} needs a reason`).toBeGreaterThan(10)
    }
  })

  it('reaches the entry points and declarations the generator used to skip', () => {
    // One from each gap: an unscanned entry point, an `index.ts`, a const alias, a renamed re-export.
    for (const handle of [
      'sheets.columnLabelToIndex',
      'sheets.parseA1RangeToCoordinates',
      'assets.assetSlug',
      'builders.clampLevel',
      'mechanics.epControlRows',
      'wiki.fetchFandomWikitext',
      'mechanics.formatElsRoiPct',
      'mechanics.shockwaveFrequencyPreview',
    ]) {
      expect(calculators.calculatorSpec(handle), handle).toBeDefined()
    }
    expect(calculators.runCalculator('sheets.columnLabelToIndex', { label: 'AB' }).value).toBe(27)
    expect(calculators.runCalculator('mechanics.epPlayerVisibleRowCount', {}).value)
      .toBe(mechanics.epPlayerVisibleRowCount())
  })

  it('says a lookup can return nothing', () => {
    // `T | null` in the source; the generated entry called it a plain object.
    expect(calculators.calculatorSpec('sheets.parseA1RangeToCoordinates')?.returns.nullable).toBe(true)
    expect(calculators.calculatorSpec('sheets.columnLabelToIndex')?.returns.nullable).toBeUndefined()
  })

  it('leaves knowledge/ out, because nothing may import it', () => {
    // docs/ORGANIZATION_CONTRACT.md rule 2. Every knowledge export is listed with the tool that answers it.
    expect(calculators.CALCULATORS.filter(spec => spec.module.startsWith('src/knowledge/'))).toEqual([])
    const listed = Object.keys(NOT_CALCULATORS).filter(handle => handle.startsWith('knowledge.'))
    const reExported = exportedFunctions.filter(fn => fn.entry === 'knowledge' && registered.has(fn.name))
    expect(listed.length + reExported.length).toBe(exportedFunctions.filter(fn => fn.entry === 'knowledge').length)
  })

  it('runs the formulas knowledge re-exports from mechanics, as the same functions', () => {
    /*
     * These six were declared in knowledge compartments, where the registry could not reach them.
     * They moved to mechanics/ unchanged; knowledge still exports each, and it is the same function.
     */
    const moved = [
      'thornsHitsToKill',
      'thornsProtectorMultiplier',
      'eliteSpawnSinglePercentAtRow',
      'eliteSpawnDoublePercentAtRow',
      'diminishedLevelReductions',
      'guardianCostColumn',
    ] as const
    for (const name of moved) {
      expect(knowledge[name], name).toBe(mechanics[name])
      expect(calculators.calculatorSpec(`mechanics.${name}`)?.module, name).toMatch(/^src\/mechanics\//)
      expect(Object.hasOwn(NOT_CALCULATORS, `knowledge.${name}`), name).toBe(false)
    }

    const run = (id: string, args: Record<string, unknown>) => calculators.runCalculator(id, args).value
    // 34% kills on the third hit; a boss takes half, so 17% a hit and the sixth hit.
    expect(run('mechanics.thornsHitsToKill', { percentOfMaxHealth: 34 })).toBe(3)
    expect(run('mechanics.thornsHitsToKill', { percentOfMaxHealth: 34, isBoss: true })).toBe(6)
    expect(run('mechanics.thornsHitsToKill', { percentOfMaxHealth: 0 })).toBeNull()
    expect(run('mechanics.thornsProtectorMultiplier', {})).toBe(0.7)
    expect(run('mechanics.thornsProtectorMultiplier', { labBenefit: 6 })).toBe(0.76)
    // The same square series, nine rows apart.
    expect([0, 1, 5, 10, 19].map(row => run('mechanics.eliteSpawnSinglePercentAtRow', { row }))).toEqual([0, 1, 25, 100, 100])
    expect([9, 10, 14, 19].map(row => run('mechanics.eliteSpawnDoublePercentAtRow', { row }))).toEqual([0, 1, 25, 100])
    // Nothing lost to 100, flat at 100 from 101 to 1599, then a step.
    expect([50, 100, 101, 1599, 1600].map(raw => run('mechanics.diminishedLevelReductions', { raw }))).toEqual([50, 100, 100, 100, 289])
    expect(run('mechanics.guardianCostColumn', { track: 'percentage' })).toBe('attackCost')
    expect(run('mechanics.guardianCostColumn', { track: 'cooldown' })).toBe('cooldownCost')
  })
})

describe('a handle runs the function its entry point exports', () => {
  /*
   * `mechanics/waves` holds a current wave-scaling model and the legacy one it replaced, and both
   * declare `computeWaveBaseHealth`. The entry exports the current one. The registry ran the
   * legacy one, because that file declared it with `function` and the current file with `const`,
   * which the generator did not read.
   */
  const input = { tier: 7, wave: 2000 }

  it.each([
    'computeWaveBaseHealth',
    'computeWaveBaseHealthRaw',
    'computeWaveBaseDamage',
  ] as const)('%s', (name) => {
    const exported = (mechanics[name] as (given: typeof input) => number)(input)
    expect(Number.isFinite(exported)).toBe(true)
    expect(calculators.runCalculator(`mechanics.${name}`, { input }).value).toBe(exported)
  })

  it.each(['tierDifficultyMultiplier', 'tierCoinMultiplier'] as const)('%s', (name) => {
    const spec = calculators.calculatorSpec(`mechanics.${name}`)
    expect(spec?.module).toBe('src/mechanics/waves/base-empirical-scaling.ts')
  })
})
