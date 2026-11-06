import { describe, expect, it } from 'vitest'
import { readRelicsFromSaveRoot } from '../../src/save/relics/read'

const unlockedIndices = (root: Record<string, unknown>) =>
  (readRelicsFromSaveRoot(root)?.relics ?? []).filter(relic => relic.unlocked).map(relic => relic.index)

describe('relics read from a save', () => {
  it('does not treat an unreadable profile entry as relic 0', () => {
    const extract = readRelicsFromSaveRoot({ profileRelics: [5, null] })
    expect(extract?.profileRelicIndices).toEqual([5])
    expect(extract?.relics[0]?.unlocked).toBe(false)
    expect(extract?.relics[0]?.onProfile).toBe(false)
  })

  it('ignores stale profile entries past the end of the list', () => {
    expect(unlockedIndices({ profileRelics: { _items: [5, 99, 0, 0], _size: 1 } })).toEqual([5])
  })

  it('ignores stale unlock flags past the end of the list', () => {
    expect(unlockedIndices({ relicsUnlocked: { _items: [true, false, true, true], _size: 2 } })).toEqual([0])
  })

  it('reports relics past a short list as absent, not locked', () => {
    const warnings = readRelicsFromSaveRoot({ relicsUnlocked: { _items: [true, true, true], _size: 2 } })?.warnings
    expect(warnings?.join(' ')).toMatch(/relicsUnlocked has 2 entries/)
  })

  it('keeps a real relic 0 on the profile', () => {
    expect(unlockedIndices({ profileRelics: [0, 5] })).toEqual([0, 5])
  })
})
