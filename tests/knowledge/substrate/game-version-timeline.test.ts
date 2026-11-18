import { describe, expect, it } from 'vitest'
import {
  CURRENT_GAME_VERSION,
  GAME_VERSION_TIMELINE,
  gameVersionOn,
  readAgainstOlderBuild,
} from '../../../src/knowledge/substrate/game-version-timeline'

/**
 * The timeline is what ages a wiki claim. Before v29 windows existed every claim stamped
 * v28.3.0 and `readAgainstOlderBuild` could never be true, so staleness was invisible.
 */
describe('game version timeline', () => {
  it('has contiguous windows with exactly one open window, last', () => {
    for (let index = 1; index < GAME_VERSION_TIMELINE.length; index += 1) {
      const previous = GAME_VERSION_TIMELINE[index - 1]
      const next = GAME_VERSION_TIMELINE[index]
      expect(previous.until, previous.version).not.toBeNull()
      const dayAfter = new Date(`${previous.until}T00:00:00Z`)
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
      expect(next.from, `${previous.version} → ${next.version}`).toBe(dayAfter.toISOString().slice(0, 10))
    }
    expect(GAME_VERSION_TIMELINE.at(-1)?.until).toBeNull()
  })

  it('stamps reads by the build that was live, per the developers\' patch notes', () => {
    expect(gameVersionOn('2026-08-16')).toBe('v28.3.0')
    expect(gameVersionOn('2026-08-27')).toBe('v29.0.0')
    expect(gameVersionOn('2026-10-15')).toBe('v29.1.0')
    expect(gameVersionOn('2026-11-16')).toBe('v29.2.0')
    expect(gameVersionOn('2026-06-29')).toBeNull()
    expect(gameVersionOn(undefined)).toBeNull()
  })

  it('flags a claim read before the current build', () => {
    expect(CURRENT_GAME_VERSION).toBe('v29.2.0')
    expect(readAgainstOlderBuild('2026-08-16')).toBe(true)
    expect(readAgainstOlderBuild('2026-11-18')).toBe(false)
  })
})
