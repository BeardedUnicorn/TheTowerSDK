import { describe, expect, it } from 'vitest'

import { SHARED_CHART_REGISTRY } from '../../src/charts/registry/data'
import { CHART_MECHANIC_LINKS } from '../../src/charts/registry/mechanic-links'
import { knowledgeFor } from '../../src/knowledge'

/**
 * A chart's oracle links have to resolve.
 *
 * `mechanic-links.ts` promises this file by name. It did not exist, so nothing checked the links:
 * an id that drifted, or one that never matched a node, sent a reader to an entity the oracle
 * does not have — which reads as "the graph knows nothing about this chart".
 */
describe('every chart mechanic link resolves in the knowledge graph', () => {
  it('names only entities the oracle knows', () => {
    const unresolved: string[] = []
    for (const [renderer, ids] of Object.entries(CHART_MECHANIC_LINKS)) {
      for (const id of ids ?? []) {
        if (!knowledgeFor(id)) unresolved.push(`${renderer} -> ${id}`)
      }
    }
    expect(unresolved).toEqual([])
  })

  it('links only renderers the registry has', () => {
    const rendered = new Set<string>(SHARED_CHART_REGISTRY.map(entry => entry.rendererKey))
    const surplus = Object.keys(CHART_MECHANIC_LINKS).filter(renderer => !rendered.has(renderer))
    expect(surplus).toEqual([])
  })

  it('gives no renderer an empty list', () => {
    for (const [renderer, ids] of Object.entries(CHART_MECHANIC_LINKS)) {
      expect(ids?.length ?? 0, renderer).toBeGreaterThan(0)
    }
  })
})
