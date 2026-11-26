import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PACKAGE_ROOT } from '../helpers/paths'

import { CALCULATOR_BUILDERS, findCalculatorBuilder } from '../../src/builders'
import { getChartSeries, listChartSeries, resolveCanonicalToolDataset } from '../../src/charts'
import { LAB_CATALOG } from '../../src/data'
import { formatGroupedNumber, formatNumberForDisplay } from '../../src/formatting'

/**
 * The WASM build has to answer the same as the library it is a build of.
 *
 * A port that drifts is the reason this exists at all — the alternative to shipping a WASM module
 * was other people re-implementing the numbers in their own language, which guarantees two
 * versions that disagree. A module that quietly disagrees with the TypeScript is that same failure
 * wearing this project's name.
 *
 * It is not theoretical. QuickJS inside Javy has no ICU, so `toLocaleString` returned the digits
 * ungrouped: `formatGroupedNumber(4770477147914)` gave '4770477147914' in the module and
 * '4,770,477,147,914' in Node. Both look like a number. Nothing would have reported it.
 *
 * These tests skip when the module has not been built (`pnpm wasm:build`), because it is a
 * build artifact and not everyone needs one — but a built module that disagrees fails.
 */
/*
 * The module is built to `wasm/.build`, which is not where this file lives.
 *
 * This resolved `.build` from the test's OWN directory. That was the same directory until the
 * suite moved to `tests/`, after which it looked in `tests/wasm/.build`, found nothing, and
 * skipped every case — reporting nine skips rather than a broken path. A parity suite that skips
 * is indistinguishable from one that passes, which is the whole reason it exists.
 */
const MODULE_PATH = path.join(PACKAGE_ROOT, 'wasm', '.build', 'thetowersdk.wasm')
const built = existsSync(MODULE_PATH)

type Call = (request: unknown) => Promise<Record<string, unknown>>

async function loadCaller(): Promise<Call> {
  const module = (await import('../../wasm/run.mjs')) as { call: Call }
  return module.call
}

describe.skipIf(!built)('the WASM module answers as the library does', () => {
  it('reports the same counts the package does', async () => {
    const call = await loadCaller()
    const answer = await call({ op: 'version' })

    expect(answer.ok).toBe(true)
    expect(answer.calculators).toBe(CALCULATOR_BUILDERS.length)
  })

  it('formats numbers identically, grouping included', async () => {
    const call = await loadCaller()

    for (const value of [0, 42, 1234, 4_770_477_147_914, 18_759_000, 1.343e24]) {
      const answer = await call({ op: 'format', value })
      expect(answer.display, `display of ${value}`).toBe(formatNumberForDisplay(value))
      expect(answer.grouped, `grouping of ${value}`).toBe(formatGroupedNumber(value))
    }
  })

  it('computes a calculator to the same result', async () => {
    const call = await loadCaller()
    const input = { baseThorns: 120, wallThorns: 12, tier: 14, sharpFortitude: true }

    const answer = await call({ op: 'calc.run', id: 'thorns.damage', input })
    const builder = findCalculatorBuilder('thorns.damage')!
    const expected = builder.compute(input as never) as { atWallThorns: unknown }

    expect(answer.ok).toBe(true)
    expect((answer.result as { atWallThorns: unknown }).atWallThorns).toEqual(expected.atWallThorns)
  })

  it('returns the same catalog rows, and the real total rather than the page size', async () => {
    const call = await loadCaller()
    const answer = await call({ op: 'data.get', name: 'LAB_CATALOG', limit: 3 })

    expect(answer.total).toBe(LAB_CATALOG.length)
    expect(answer.items).toEqual(LAB_CATALOG.slice(0, 3))
  })

  it('does not expose the retired private-save decoding operation', async () => {
    const call = await loadCaller()
    const answer = await call({ op: 'save.decode', base64: 'VEREMQ==' })
    expect(answer.ok).toBe(false)
    expect(answer.error).toEqual(expect.any(String))
  })

  it('answers an unknown op with a value, not a trap', async () => {
    /*
     * A trap surfaces in the host language as an abort with no message. In Python or Go that is
     * nearly unreadable, so every failure here has to come back as JSON.
     */
    const call = await loadCaller()
    const answer = await call({ op: 'nope.not.a.real.op' })

    expect(answer.ok).toBe(false)
    expect(String(answer.error)).toContain('unknown op')
    expect(Array.isArray(answer.ops)).toBe(true)
  })

  it('says when a number could not survive JSON', async () => {
    /*
     * `JSON.stringify(NaN)` is `null`. A formula given arguments it cannot use returned NaN, the
     * response carried `{"ok": true, "result": null}`, and in Python that null becomes None and
     * flows onward — a successful call with no answer, indistinguishable from a formula that
     * returns nothing on purpose.
     */
    const call = await loadCaller()
    const answer = await call({ op: 'mechanics.call', name: 'thornDamageOnHit', args: 'not an array' })

    expect(answer.ok).toBe(true)
    expect(answer.result).toBeNull()
    expect(answer.nonFinite, 'the lost value must be named').toContain('result.result = NaN')
  })

  it('stays quiet when every number is representable', async () => {
    const call = await loadCaller()
    const answer = await call({
      op: 'mechanics.call',
      name: 'thornDamageOnHit',
      args: [{ enemyFactor: 2, thornMultiplier: 5, contactDamage: 1000 }],
    })

    expect(answer.result).toBe(10000)
    expect(answer.nonFinite).toBeUndefined()
  })

  it('opens the chart an id names, without being told the variant again', async () => {
    /*
     * A chart id carries its variant: `bots:upgrades-and-costs:golden-bot`. The MCP server read it
     * from the id; this module did not, so the same id that worked there came back as an error
     * here, or — for the bot renderer, which once fell back to the first bot — as Flame Bot.
     */
    const call = await loadCaller()

    for (const [id, bot] of [
      ['bots:upgrades-and-costs:golden-bot', 'Golden Bot'],
      ['bots:upgrades-and-costs:bot-bot', 'Bot Bot'],
    ] as const) {
      const answer = await call({ op: 'charts.rows', id, limit: 3 })
      const expected = resolveCanonicalToolDataset('bot-upgrades', [bot])

      expect(answer.ok, id).toBe(true)
      expect(answer.columns, id).toEqual(expected?.columns)
      expect(answer.items, id).toEqual(expected?.rows.slice(0, 3))
    }
  })

  it('returns the same series the library does', async () => {
    const call = await loadCaller()
    const expected = getChartSeries('lab:damage:cost')

    const series = await call({ op: 'charts.series', id: 'lab:damage:cost', limit: 3 })
    expect(series.ok).toBe(true)
    expect(series.points).toBe(expected?.points)
    expect(series.items).toEqual(expected?.data.slice(0, 3))

    const listing = await call({ op: 'charts.seriesList', family: 'guardian', limit: 100 })
    expect(listing.total).toBe(listChartSeries({ family: 'guardian' }).length)

    expect((await call({ op: 'charts.series', id: 'constructor' })).ok).toBe(false)
  })

  it('will not read the prototype for a catalog name', async () => {
    const call = await loadCaller()

    for (const name of ['constructor', '__proto__', 'toString']) {
      const answer = await call({ op: 'data.get', name })
      expect(answer.ok, name).toBe(false)
    }
  })
})
