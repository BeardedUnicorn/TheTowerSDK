import { describe, expect, it } from 'vitest'

import { findToolExport } from '../../src/node'
import type { FindToolExportFs } from '../../src/node'
import { towerMacExportPath } from '../../src/save'

/*
 * On a Mac the game is an iOS app, and macOS names its container after a per-install UUID:
 * ~/Library/Containers/D26913FA-4CC5-46E9-8DEC-E59AB0EEDABD/Data/Documents/tool_export.json. The
 * container's metadata plist holds the bundle id, com.TechTreeGames.TheTower.
 */
const HOME = '/Users/player'
const CONTAINERS = `${HOME}/Library/Containers`
const GAME = 'D26913FA-4CC5-46E9-8DEC-E59AB0EEDABD'
const OTHER = '1C74415B-C175-47BC-98A3-DABFCC9E6B9F'
const METADATA = '.com.apple.containermanagerd.metadata.plist'

/** A file system holding exactly these files: path → { modified time, contents }. */
function fakeFs(files: Record<string, { mtimeMs?: number, text?: string }>): FindToolExportFs {
  const missing = (file: string): never => {
    throw new Error(`ENOENT: ${file}`)
  }
  return {
    readdirSync: (directory) => {
      const names = new Set(
        Object.keys(files)
          .filter(file => file.startsWith(`${directory}/`))
          .map(file => file.slice(directory.length + 1).split('/')[0]!),
      )
      return names.size > 0 ? [...names] : missing(directory)
    },
    statSync: file => (files[file] ? { isFile: () => true, mtimeMs: files[file]!.mtimeMs ?? 0 } : missing(file)),
    readFileSync: file => (files[file] ? new TextEncoder().encode(files[file]!.text ?? '') : missing(file)),
  }
}

const exportIn = (container: string) => towerMacExportPath(HOME, container)
const metadataIn = (container: string) => `${CONTAINERS}/${container}/${METADATA}`

describe('the macOS export path', () => {
  it('is the container\'s Data/Documents folder', () => {
    expect(exportIn(GAME)).toBe(`${CONTAINERS}/${GAME}/Data/Documents/tool_export.json`)
    expect(towerMacExportPath(`${HOME}/`, GAME)).toBe(exportIn(GAME))
  })

  it('refuses a container id that is not one folder name', () => {
    expect(() => towerMacExportPath(HOME, '../elsewhere')).toThrow()
    expect(() => towerMacExportPath(HOME, '')).toThrow()
  })
})

describe('finding tool_export.json', () => {
  it('finds the export in a container named after a UUID', () => {
    const fs = fakeFs({
      [exportIn(GAME)]: { mtimeMs: 10 },
      [metadataIn(GAME)]: { text: 'bplist00…com.TechTreeGames.TheTower…' },
      [`${CONTAINERS}/${OTHER}/Data/Documents/notes.txt`]: {},
    })
    expect(findToolExport({ home: HOME, platform: 'darwin', env: {}, fs })).toEqual({
      path: exportIn(GAME),
      source: 'macos-container',
      searched: [`${CONTAINERS}/*/Data/Documents/tool_export.json`],
    })
  })

  it('prefers the game\'s own container over a newer file of the same name elsewhere', () => {
    const fs = fakeFs({
      [exportIn(GAME)]: { mtimeMs: 10 },
      [metadataIn(GAME)]: { text: 'com.TechTreeGames.TheTower' },
      [exportIn(OTHER)]: { mtimeMs: 99 },
      [metadataIn(OTHER)]: { text: 'com.example.other' },
    })
    expect(findToolExport({ home: HOME, platform: 'darwin', env: {}, fs }).path).toBe(exportIn(GAME))
  })

  it('takes the most recently written export when no container is marked as the game\'s', () => {
    const fs = fakeFs({ [exportIn(GAME)]: { mtimeMs: 10 }, [exportIn(OTHER)]: { mtimeMs: 99 } })
    expect(findToolExport({ home: HOME, platform: 'darwin', env: {}, fs }).path).toBe(exportIn(OTHER))
  })

  it('uses the file TOWER_TOOL_EXPORT names before searching', () => {
    const fs = fakeFs({ '/exports/mine.json': {}, [exportIn(GAME)]: { mtimeMs: 10 } })
    expect(findToolExport({ home: HOME, platform: 'darwin', env: { TOWER_TOOL_EXPORT: '/exports/mine.json' }, fs }))
      .toMatchObject({ path: '/exports/mine.json', source: 'env' })
  })

  it('falls back to the search when TOWER_TOOL_EXPORT names no file', () => {
    const fs = fakeFs({ [exportIn(GAME)]: { mtimeMs: 10 } })
    const found = findToolExport({ home: HOME, platform: 'darwin', env: { TOWER_TOOL_EXPORT: '/gone.json' }, fs })
    expect(found.path).toBe(exportIn(GAME))
    expect(found.searched).toHaveLength(2)
  })

  it('finds nothing, and says where it looked, when no container holds an export', () => {
    const fs = fakeFs({ [`${CONTAINERS}/${OTHER}/Data/Documents/notes.txt`]: {} })
    expect(findToolExport({ home: HOME, platform: 'darwin', env: {}, fs })).toEqual({
      path: null, source: null, searched: [`${CONTAINERS}/*/Data/Documents/tool_export.json`],
    })
  })

  it('finds nothing when the containers folder cannot be read', () => {
    expect(findToolExport({ home: HOME, platform: 'darwin', env: {}, fs: fakeFs({}) }).path).toBeNull()
  })

  it('does not search containers on another platform', () => {
    const fs = fakeFs({ [exportIn(GAME)]: { mtimeMs: 10 } })
    const found = findToolExport({ home: HOME, platform: 'linux', env: {}, fs })
    expect(found.path).toBeNull()
    expect(found.searched.join(' ')).toMatch(/TOWER_TOOL_EXPORT/)
  })
})
