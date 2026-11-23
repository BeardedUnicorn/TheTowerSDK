import { describe, expect, it } from 'vitest'
import { readProfileFromSaveRoot } from '../../src/save/profile/read'

describe('profile read from a save', () => {
  it('returns the name, avatar and guild fields', () => {
    expect(readProfileFromSaveRoot({ userName: 'Defender', avatarId: 24, inGuild: true, lastGuildSeason: 12, playerID: 'ABC123' })).toEqual({
      userName: 'Defender', avatarId: 24, inGuild: true, lastGuildSeason: 12, warnings: [],
    })
  })

  it('never returns the account id', () => {
    expect(JSON.stringify(readProfileFromSaveRoot({ userName: 'Defender', playerID: 'ABC123' }))).not.toContain('ABC123')
  })

  it('is null for a save with no profile fields, and for no save', () => {
    expect(readProfileFromSaveRoot({ coins: 5 })).toBeNull()
    expect(readProfileFromSaveRoot(null)).toBeNull()
  })

  it('reports an unreadable guild flag instead of guessing', () => {
    const extract = readProfileFromSaveRoot({ userName: '', inGuild: 'yes' })!
    expect(extract).toMatchObject({ userName: null, inGuild: null })
    expect(extract.warnings).toEqual(['inGuild is not a true/false value.'])
  })
})
