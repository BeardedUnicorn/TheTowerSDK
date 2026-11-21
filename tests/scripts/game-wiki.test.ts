import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CARD_TEMPLATES, LAB_CATALOG, MODULE_TEMPLATES, WORKSHOP_DATA, uwStoneChartData } from '../../src/data'
import { PATCH_NOTES } from '../../src/knowledge'
import { PACKAGE_ROOT } from '../helpers/paths'

/**
 * The game pages of the wiki are generated and pushed to a repository nobody reviews, so
 * what a wrong page looks like has to be caught here. Two failures are quiet: a record that
 * never became a page, and a field that was missing and printed as the word `undefined`.
 */
type GameWiki = { pages: Map<string, string>, nav: { group: string, entries: { title: string, name: string }[] }[], problems: string[] }

const { buildGameWikiPages } = (await import(
  pathToFileURL(path.join(PACKAGE_ROOT, 'scripts', 'game-wiki', 'index.mjs')).href
)) as { buildGameWikiPages: () => GameWiki }

describe('the game wiki generator', () => {
  const wiki = buildGameWikiPages()
  const names = [...wiki.pages.keys()]
  const count = (prefix: string) => names.filter(name => name.startsWith(prefix)).length

  it('reports no problems of its own', () => {
    expect(wiki.problems).toEqual([])
  })

  it('gives every record in a catalog its own page', () => {
    expect(count('Card-')).toBe(CARD_TEMPLATES.length)
    expect(count('Lab-')).toBe(LAB_CATALOG.length)
    expect(count('Module-')).toBe(MODULE_TEMPLATES.length + 3) // plus rarities, substats and costs
    expect(count('Workshop-')).toBe(Object.keys(WORKSHOP_DATA).length + 1) // plus enhancements
    expect(count('Ultimate-Weapon-')).toBe(Object.keys(uwStoneChartData).length + 1) // plus the plus page
  })

  it('covers every year of patch notes', () => {
    const years = new Set(PATCH_NOTES.map(note => note.postedAt.slice(0, 4)))
    for (const year of years) expect(names).toContain(`Game-Patch-Notes-${year}`)
  })

  it('never prints a missing value as a word', () => {
    // Patch notes are the developers' own text and may say "NaN"; every other page is built
    // from fields, where these words only appear when a field was absent.
    const leaked = names
      .filter(name => !name.startsWith('Game-Patch-Notes-'))
      .filter(name => /\bundefined\b|\bNaN\b|\[object |\bnull\b/.test(wiki.pages.get(name) ?? ''))
    expect(leaked).toEqual([])
  })

  it('links only to pages that exist', () => {
    const broken: string[] = []
    for (const [name, body] of wiki.pages) {
      if (name.startsWith('Game-Patch-Notes-')) continue // links in a note are the developers' own
      for (const match of body.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1]
        if (/^(https?:|mailto:|#)/.test(target)) continue
        if (!wiki.pages.has(target)) broken.push(`${name} -> ${target}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('lists every index page on the landing page', () => {
    const landing = wiki.pages.get('Game-Wiki') ?? ''
    const entries = wiki.nav.flatMap(group => group.entries)
    expect(entries.length).toBeGreaterThan(20)
    for (const entry of entries) expect(landing).toContain(`](${entry.name})`)
  })

  it('writes the same pages twice', () => {
    const again = buildGameWikiPages()
    expect([...again.pages]).toEqual([...wiki.pages])
  })
})
