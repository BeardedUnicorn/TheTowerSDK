/**
 * The coin planning fixture: eleven stored readings of one tier-7 account across the two days it
 * bought the Starter and Epic packs. `SAVE` is the newest reading, `HISTORY` the ten before it.
 */
import fixture from '../../fixtures/save/planning-t7.snapshots.json'

export const PLANNING_SNAPSHOTS = fixture.snapshots as unknown as Record<string, unknown>[]
export const PLANNING_SAVE = PLANNING_SNAPSHOTS.at(-1) as Record<string, unknown>
export const PLANNING_HISTORY = PLANNING_SNAPSHOTS.slice(0, -1)
export const PLANNING_SOURCES = { save: PLANNING_SAVE, snapshots: PLANNING_HISTORY }
