import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getNextWorkshopUnlock,
  WORKSHOP_DATA,
  WORKSHOP_STATS_OPEN_FROM_START,
  WORKSHOP_UNLOCK_ROWS,
} from '../../src/data'
import type { WorkshopCategory } from '../../src/data'
import { workshopStatOrder } from '../../src/save/workshop/read'

/*
 * The workshop unlock chain, held to the two things it was built from that a test can read: the
 * stat table it names, and the save's own unlock-group layout. The prices themselves come from the
 * wiki and the screen; the screen readings are checked in live-ui-check-v29-2-2-facts.test.ts.
 */

const CATEGORIES: readonly WorkshopCategory[] = ['attack', 'defense', 'utility']
const chain = (category: WorkshopCategory) => WORKSHOP_UNLOCK_ROWS.filter(row => row.category === category)

interface SaveFormat {
  upgradeIndices: Record<string, Record<string, string> | string>
  upgradeUnlockIndices: Record<string, Record<string, string[]> | string>
}

const format = JSON.parse(readFileSync(
  join(__dirname, '..', '..', 'fixtures', 'data', 'save-format', 'workshop_save_format.json'),
  'utf8',
)) as SaveFormat

const SAVE_CATEGORY: Record<WorkshopCategory, string> = { attack: 'Attack', defense: 'Defense', utility: 'Utility' }

describe('workshop unlocks', () => {
  it('names every workshop stat exactly once, gated or open from the start', () => {
    const named = [...WORKSHOP_STATS_OPEN_FROM_START, ...WORKSHOP_UNLOCK_ROWS.flatMap(row => row.stats)]
    expect(new Set(named).size).toBe(named.length)
    expect([...named].sort()).toEqual(Object.keys(WORKSHOP_DATA).sort())
  })

  it.each(CATEGORIES)('%s is one chain numbered from 0', category => {
    expect(chain(category).map(row => row.order)).toEqual(chain(category).map((_, index) => index))
  })

  /*
   * Slot u of the save's unlock flags opens the group the save format lists at u. Names differ
   * between the two (`Super Critical Chance`, `Thorn Damage`), so both sides are resolved to the
   * level-array index and compared there, through the save reader's own stat order.
   */
  it.each(CATEGORIES)('%s groups sit at the slots the save gives them', category => {
    const names = format.upgradeIndices[SAVE_CATEGORY[category]] as Record<string, string>
    const indexOf = new Map(Object.entries(names).map(([index, name]) => [name, Number(index)]))
    const order = workshopStatOrder()[category]
    const groups = format.upgradeUnlockIndices[SAVE_CATEGORY[category]] as Record<string, string[]>

    const fromSave = Object.entries(groups).map(([slot, group]) => ({
      order: Number(slot),
      stats: group.map(name => order[indexOf.get(name)!]),
    }))
    expect(chain(category).map(({ order: slot, stats }) => ({ order: slot, stats }))).toEqual(fromSave)
  })

  /*
   * Not a rule the game states — a transcription check. Every chain the wiki gives rises, so a
   * row pasted into the wrong slot or a dropped digit shows up as a price going down.
   */
  it.each(CATEGORIES)('%s prices rise along the chain', category => {
    const prices = chain(category).map(row => row.coins)
    expect(prices.every((price, index) => index === 0 || price > prices[index - 1])).toBe(true)
  })

  it('every row says where its price was read', () => {
    expect(WORKSHOP_UNLOCK_ROWS.filter(row => !/^wiki "/.test(row.source))).toEqual([])
  })
})

describe('getNextWorkshopUnlock', () => {
  it('gives the button a tab shows after that many unlocks', () => {
    expect(getNextWorkshopUnlock('utility', 0)?.stats).toEqual(['Cash Bonus', 'Cash / Wave'])
    expect(getNextWorkshopUnlock('defense', 3)?.stats).toEqual(['Knockback Chance', 'Knockback Force'])
    expect(getNextWorkshopUnlock('attack', 5)?.coins).toBe(500_000_000_000)
  })

  it('has nothing to offer once a tab is fully unlocked', () => {
    expect(getNextWorkshopUnlock('attack', 6)).toBeNull()
    expect(getNextWorkshopUnlock('defense', 9)).toBeNull()
    expect(getNextWorkshopUnlock('utility', 6)).toBeNull()
  })

  it('refuses a count that cannot be one', () => {
    expect(getNextWorkshopUnlock('attack', -1)).toBeNull()
    expect(getNextWorkshopUnlock('attack', 1.5)).toBeNull()
    expect(getNextWorkshopUnlock('attack', Number.NaN)).toBeNull()
  })
})
