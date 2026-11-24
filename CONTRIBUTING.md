# Contributing

Contributions are welcome — this is meant to be the community's SDK, not one person's.

## Getting set up

```bash
pnpm install
pnpm verify   # lint, conventions, types, build, tests — what CI runs
```

Or individually: `pnpm lint`, `pnpm lint:conventions`, `pnpm type-check`,
`pnpm test`, `pnpm build`. The repository uses [pnpm](https://pnpm.io); the version is pinned by
`packageManager` in `package.json`, and `corepack enable` gives you exactly that one.

Node 22+. The only runtime dependency is `zod`.

There's also an MCP server (`pnpm mcp`) if you work with an AI agent — see
[mcp/README.md](mcp/README.md) and [AGENTS.md](AGENTS.md).

## What's most useful

**Extractors for save fields that aren't covered yet.** The save root is a plain object, so if you
work out what a field means, an extractor is usually a small addition. See any file in `src/save/`
for the shape.

**Data corrections.** Include evidence — a save file, or a screenshot of the value in game. A number
without evidence is hard to act on.

**Examples.** If you built something with this, an example others can learn from is valuable.

**Bug reports.** A save file that reproduces the problem is worth more than a description. Strip
anything you consider private first.

## Layout

```
src/
  data/         game tables — costs, levels, effects, catalogs
  save/         reading a save file
    catalogs/   save indices -> named entities
  node/         the save decoder (needs Node)
  formatting/   number formatting matching the game's display
  mechanics/    formulas (approximate — see README)
```

Public entry points are declared in `package.json`; each domain exports its API through its
`index.ts` barrel. If you add a module, export it from the matching barrel —
otherwise nobody can import it.

There is no `src/internal/`. A module belongs to a domain and is exported from it, or it is
application code and belongs in the consumer — see `docs/ORGANIZATION_CONTRACT.md`.

## Conventions

- **File names** are kebab-case. Inside `data/` and `save/` the directory already gives the context,
  so name the file after the thing: `save/labs.ts`, not `save/labs-from-save.ts`.
- **Save readers** are `read<Thing>FromSaveRoot(root)` and return `null` when the save has no data
  for that feature. Never throw on an old or partial save.
- **Report what you couldn't read** with a `warnings: string[]` on the result rather than silently
  dropping it.
- **Don't mutate the save root.** Callers run many extractors over the same object.
- **No side effects on import.** Importing a module must not do I/O or mutate global state.
- **Comments explain behaviour**, not history. Say what a value does and what breaks if it changes,
  not where it came from or what it used to be.
- **Use the game's names.** Look a term up with `lookupGlossary()` before writing it down; several
  acronyms mean more than one thing, and a confident wrong name is worse than no name. If you add
  data that introduces names, run `pnpm glossary` so the glossary covers them.
- **Nothing outside the package.** Fixtures and test data live in the package, so a fork works.

## Tests

Tests live next to the code as `*.test.ts` and run under Vitest. Anything that decodes or maps save
data should have one — index-mapping bugs are silent and misreport a player's data rather than
failing.

Use a synthetic fixture rather than a real save. `src/save/fixtures/` has an example. Tests that
genuinely need a real save read `TOWER_TEST_SAVE` and skip when it is unset, so they never block
a contributor who does not have one — and no one's save data ends up in the repository.

## Pull requests

Keep them focused; one concern per PR is much easier to review. Run `pnpm verify` before
opening — it is exactly what CI runs.

## Releases

Nobody cuts a release by hand. Every push to `main` runs
[`.github/workflows/release.yml`](.github/workflows/release.yml), which reads the commits since
the last `v*` tag and decides the next version from their
[Conventional Commit](https://www.conventionalcommits.org) types:

| Commit | Release |
|---|---|
| `fix: …` | patch |
| `feat: …` | minor |
| `feat!: …`, or a `BREAKING CHANGE:` footer | major |
| `docs`, `chore`, `test`, `build`, `ci`, `refactor`, `style` | none |

Before anything is versioned, the workflow runs the whole CI suite on the commit: `pnpm verify`
on Node 22, 24 and 26, the documentation site's check, lint and build, the WASM parity suite,
and the Claude Desktop extension. If any of it fails, nothing is released.

When there is something to release, the workflow writes the entry into `CHANGELOG.md`, bumps
`package.json`, commits both as `chore(release): <version> [skip ci]`, tags it, publishes to npm,
and creates the GitHub release. Then, from the released tag, it attaches `thetowersdk.wasm` and
`thetowersdk.mcpb`, regenerates the GitHub wiki, and deploys the documentation site to GitHub
Pages. Do not edit the version or add changelog entries yourself.

Two things follow from that:

- **A `feat` or `fix` that reaches `main` is published.** There is no review step after the
  merge, and a published version cannot be changed. If a change is not ready to ship, it is not
  ready to merge.
- **The commit subject is the changelog line.** `fix(save): read the relic list when the export
  omits the count` is what a reader of the changelog sees, so write it for them. With squash
  merges, that is the pull request title.
- **The site and the wiki change with a release, not with a push.** Both describe the published
  version, so a `docs:` commit reaches them with the next release. To ship a site-only fix sooner,
  run the **github-pages** workflow by hand from the Actions tab with `tag` set to `main`. Left
  empty, it rebuilds the latest release.

## Third-party work

If you contribute code adapted from another project, say so in the PR and add the project and its
license to `NOTICE`. Credit costs nothing and keeps this usable by everyone.

By contributing you agree your work is licensed under the MIT license of this project.
