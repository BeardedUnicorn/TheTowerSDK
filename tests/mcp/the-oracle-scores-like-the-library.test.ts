import { describe, expect, it } from 'vitest'
// @ts-expect-error — the oracle tools are plain ESM JavaScript with no declarations.
import { TOWER_ORACLE_TOOLS } from '../../mcp/oracle-tools.mjs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { DIST } from '../helpers/paths'

/**
 * The oracle tools resolve a name to the same entity the library does.
 *
 * The tools carried their own copy of the library's scorer. The library's was fixed twice and the
 * copy was not, so the two disagreed about what a phrase meant: `oracle_traps('card levels')`
 * returned the traps for MODULE levels, while `resolveWithConfidence` gave `card.level`. An agent
 * asking what goes wrong with card levels was handed a different mechanic's warnings, marked
 * `found: true`.
 *
 * The tools read the built package, so this compares against the same build.
 */
const KNOWLEDGE_ENTRY = path.join(DIST, 'knowledge', 'index.js')
const describeBuilt = existsSync(KNOWLEDGE_ENTRY) ? describe : describe.skip

const QUERIES = [
  'card levels',
  'module levels',
  'assist module',
  'death ray',
  'coin bonus enhancement',
  'thunder bot',
  'wave skip',
]

describeBuilt('oracle tools and the library resolver', () => {
  const knowledge = createRequire(import.meta.url)(KNOWLEDGE_ENTRY) as {
    search: (query: string, limit?: number) => { node: { id: string } }[]
  }

  for (const query of QUERIES) {
    it(`agree on "${query}"`, () => {
      const expected = knowledge.search(query, 1)[0]?.node.id ?? null
      expect(expected, `the library finds nothing for "${query}"`).not.toBeNull()

      expect(TOWER_ORACLE_TOOLS.oracle_traps.run({ id: query }).resolvedTo).toBe(expected)
      expect(TOWER_ORACLE_TOOLS.oracle_brief.run({ mechanic: query }).resolvedTo).toBe(expected)
      expect(TOWER_ORACLE_TOOLS.oracle_search.run({ query, limit: 1 }).results[0].id).toBe(expected)
    })
  }

  it('answers "card levels" about cards', () => {
    expect(TOWER_ORACLE_TOOLS.oracle_traps.run({ id: 'card levels' }).resolvedTo).toBe('card.level')
  })
})
