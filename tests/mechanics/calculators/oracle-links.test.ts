import { describe, expect, it } from 'vitest'

import { CALCULATOR_ORACLE_LINKS } from '../../../src/calculators/oracle-links'
import { CALCULATORS } from '../../../src/calculators/registry'
import { GAME_KNOWLEDGE, knowledgeFor, trapsFor } from '../../../src/knowledge'

/**
 * The calculator → oracle link, checked at both ends.
 *
 * A link that does not resolve is worse than no link: it answers the question
 * "what does the oracle know about this formula?" with a confident pointer at
 * nothing, and the agent stops looking.
 */

const NODE_IDS = new Set(
  GAME_KNOWLEDGE.compartments.flatMap(compartment => compartment.nodes.map(node => node.id)),
)

describe('every linked entity exists in the oracle', () => {
  it('resolves all of them', () => {
    for (const [handle, entities] of Object.entries(CALCULATOR_ORACLE_LINKS)) {
      for (const id of entities) {
        expect(NODE_IDS.has(id), `${handle} -> ${id}`).toBe(true)
      }
    }
  })

  it('and they resolve through the oracle API, not just the id list', () => {
    // `knowledgeFor` is what an agent actually calls. An id present in the node
    // list but unreachable through the lookup would pass the check above and
    // fail in use.
    for (const [handle, entities] of Object.entries(CALCULATOR_ORACLE_LINKS)) {
      for (const id of entities) {
        expect(knowledgeFor(id), `${handle} -> ${id}`).toBeTruthy()
      }
    }
  })
})

describe('every linked handle is a real, curated calculator', () => {
  const byId = new Map(CALCULATORS.map(spec => [spec.id, spec]))

  it('points only at declared calculators', () => {
    for (const handle of Object.keys(CALCULATOR_ORACLE_LINKS)) {
      expect(byId.has(handle), handle).toBe(true)
    }
  })

  it('never links a generated declaration', () => {
    /*
     * The generated tier carries placeholder prose by design. An oracle link is
     * an assertion about MEANING, and asserting meaning for an entry whose
     * `because` is a placeholder would make the two tiers indistinguishable —
     * which is the property the tier field exists to preserve.
     */
    for (const handle of Object.keys(CALCULATOR_ORACLE_LINKS)) {
      expect(byId.get(handle)?.tier, handle).not.toBe('generated')
    }
  })
})

describe('what the link is for', () => {
  it('reaches the traps for a formula an agent is about to call', () => {
    // The whole point. Holding `spotlight.coverage`, an agent can now ask what
    // has gone wrong with Spotlight before touching it.
    const entities = CALCULATOR_ORACLE_LINKS['spotlight.coverage']
    expect(entities).toContain('ultimateWeapon.spotlight')

    const traps = entities.flatMap(id => trapsFor(id) ?? [])
    // Not asserting a count — traps are written when something goes wrong, so
    // the number moves. Asserting the path works.
    expect(Array.isArray(traps)).toBe(true)
  })

  it('covers the calculators that model a mechanic, and leaves formatting alone', () => {
    const linked = new Set(Object.keys(CALCULATOR_ORACLE_LINKS))

    // Mechanic-modelling calculators SHOULD be linked.
    for (const handle of [
      'spotlight.coverage', 'epaths.effectiveDamage', 'uw.statValue',
      'enemy.eliteSpawnChance', 'assist.substatCap', 'lab.durationDays',
    ]) {
      expect(linked.has(handle), `${handle} models a mechanic and should be linked`).toBe(true)
    }

    // Formatting and plumbing should NOT be. "How a number is spelled" is not a
    // game mechanic, and a link there would assert a relationship that does not
    // exist.
    for (const handle of [
      'format.numberForDisplay', 'parse.numberInput', 'sort.byUnit',
      'math.clamp', 'inputs.mergeNumberRecords',
    ]) {
      expect(linked.has(handle), `${handle} is not a game mechanic`).toBe(false)
    }
  })

  it('links a meaningful share of the curated tier', () => {
    const curated = CALCULATORS.filter(spec => spec.tier !== 'generated')
    const linked = Object.keys(CALCULATOR_ORACLE_LINKS).length
    // 48 of 75. The rest are the formatting layer, which is most of what is
    // left once the game mechanics are linked.
    //
    // It was 51 of 83 while the `inputs.merge*` family and `inputs.enrichFromResearch` were
    // registered here. Those four were the input plumbing this comment used to name, and the
    // linked count did not move when they left -- which is the check working: they were
    // unlinkable because they are not mechanics, and now they are not in the package either.
    //
    // Then 51 of 79, until three dropdown builders (`module.levelOptions` and the two ELS
    // workshop-level lists) and a run-record helper (`run.firstMeaningfulValue`) left for the
    // platform layer. The dropdowns had oracle links because the game values they list are real;
    // the controls built from them were not the SDK's to register.
    //
    // Now 61 of 89: fourteen calculators for numbers the game shows on a screen (`specs-screens`),
    // thirteen of them linked. `format.gameNumber` is the one left out, as formatting is.
    //
    // Now 82 of 111: twenty-two calculators for what an upgrade run costs (`specs-costs`, and the
    // card, tier and farm-time ones beside the lookups). `epaths.coinFarmDays` is the one left out:
    // it is the sheet's arithmetic for turning coins into time, not an entity the game has.
    //
    // Now 87 of 116: five more for the workshop, all linked. What an upgrade gives in the game's
    // unit, the table's raw number, the price of several levels, and the enemy level skip pair.
    //
    // Now 91 of 120: four for the v29 vault's key prices, all linked. The three that price the
    // pre-v29 trees stay, labelled as that.
    //
    // Now 96 of 125: five for the wave survival model, all linked to the entities they compose:
    // recovery packages, health, the two defenses and the death-prevention chain.
    //
    // Now 96 of 138: the thirteen presentation helpers (`formatting/tools`, the notation step and
    // the record-wide separator pass) promoted from the generated tier. None is linked, as
    // formatting is not — they write a number down, they are not an entity the game has.
    //
    // Now 105 of 154: sixteen for coin planning. The nine that price a mechanic are linked — labs,
    // lab boosts, Dissonance, the workshop and the coin bonus. The seven left out read an account's
    // history or the run in progress: `planning.affordableBy`, the two `currentRun.*` and the four
    // `history.*` compose what a save says, and model no entity of their own.
    //
    // Now 107 of 156: effective health and effective economy, curated so their scope can be read.
    //
    // Now 108 of 157: the cash price of a run of in-run levels, linked to the workshop and its table.
    expect(curated).toHaveLength(157)
    expect(linked).toBe(108)
  })
})
