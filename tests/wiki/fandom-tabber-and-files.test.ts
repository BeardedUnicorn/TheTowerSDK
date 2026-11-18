import { describe, expect, it } from 'vitest'
import {
  convertFandomWikitextToMarkdown,
  fandomFileWikilinkToMarkdown,
  readFandomFileNamesFromMarkdown,
} from '../../src/wiki'

/**
 * Wiki text that happens to contain markup-like characters survives conversion.
 *
 * A tabber panel is split on `|-|`. The pattern for that was an unanchored alternation, so a
 * plain `-|` inside a sentence was deleted and could cut a panel in two. A file name with a
 * closing parenthesis ended the markdown link it was written into, so `Death Wave (UW).png` was
 * read back as `Death Wave (UW` and its image never resolved.
 */
describe('tabber panels', () => {
  it('keeps a "-|" that is part of the panel text', () => {
    const markdown = convertFandomWikitextToMarkdown(
      '<tabber>\nA=Damage goes up-|down here\n|-|B=second panel\n</tabber>',
    )
    expect(markdown).toContain('Damage goes up-|down here')
    expect(markdown).toContain('## A')
    expect(markdown).toContain('## B')
    expect(markdown).toContain('second panel')
  })
})

describe('file links', () => {
  it('round-trips a file name that contains parentheses', () => {
    const markdown = fandomFileWikilinkToMarkdown('File:Death Wave (UW).png', '32px')
    expect(readFandomFileNamesFromMarkdown(markdown)).toEqual(['Death Wave (UW).png'])
  })

  it('does not use an image size as the alt text', () => {
    expect(fandomFileWikilinkToMarkdown('File:A.png', '32px')).toMatch(/^!\[A\.png\]/)
    expect(fandomFileWikilinkToMarkdown('File:A.png', 'x30px')).toMatch(/^!\[A\.png\]/)
    expect(fandomFileWikilinkToMarkdown('File:A.png', '20x30px')).toMatch(/^!\[A\.png\]/)
    expect(fandomFileWikilinkToMarkdown('File:A.png', '32px|A caption')).toMatch(/^!\[A caption\]/)
  })
})
