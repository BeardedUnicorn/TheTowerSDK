/**
 * Piece 1 of the wave survival model: each heal has its own clamp, and a test can reach each one
 * alone. The values are pinned from the workshop table, not restated from the implementation.
 */
import { describe, expect, it } from 'vitest'
import {
  healingForWave,
  resolveSurvivalStats,
  survivalExpectedPackagesForWave,
  survivalHealthAfterCappedHeal,
  survivalHealthAfterPackage,
} from '../../../src/mechanics/survival'
import { survivalTestState } from '../../helpers/survival-state'

describe('recovery packages', () => {
  const state = survivalTestState()
  const stats = resolveSurvivalStats(state)

  it('resolves the workshop table: 14% + 0.4% a level, and x1.5 + 0.03 a level', () => {
    expect(stats.recoveryAmount).toBeCloseTo(0.14 + 0.004 * 20, 10)
    /* The table, not the wiki's "x1.00 + 0.031": level 45 is x2.85 on the Workshop screen. */
    expect(stats.maxRecovery).toBeCloseTo(1.5 + 0.03 * 30, 10)
  })

  it('adds Recovery Amount x max health when there is room', () => {
    const healing = healingForWave(state, 5, { health: stats.maxHealth, packages: 1 })
    expect(healing.packages).toBeCloseTo(stats.recoveryAmount * stats.maxHealth, 6)
    expect(healing.healthAfter).toBeCloseTo(stats.maxHealth * (1 + stats.recoveryAmount), 6)
  })

  it('stops at Max Recovery x max health', () => {
    const cap = stats.maxRecovery * stats.maxHealth
    const nearly = healingForWave(state, 5, { health: cap - 10, packages: 1 })
    expect(nearly.packages).toBeCloseTo(10, 6)
    expect(nearly.healthAfter).toBeCloseTo(cap, 6)
    expect(healingForWave(state, 5, { health: cap, packages: 3 }).packages).toBe(0)
  })

  it('never heals past the cap however many packages land', () => {
    const cap = stats.maxRecovery * stats.maxHealth
    expect(healingForWave(state, 5, { health: 1, packages: 50 }).healthAfter).toBeCloseTo(cap, 6)
  })

  it('heals nothing with zero packages, whatever Recovery Amount is', () => {
    for (const level of [0, 20, 300]) {
      const richer = survivalTestState({}, { 'Recovery Amount': level })
      expect(healingForWave(richer, 5, { health: 100, packages: 0, lifestealActive: false, seconds: 0 }).healthAfter).toBe(100)
    }
  })

  it('expects one more package after a boss wave only with the lab', () => {
    expect(survivalExpectedPackagesForWave(state, 10, 0.3)).toBeCloseTo(1.3, 10)
    expect(survivalExpectedPackagesForWave(state, 11, 0.3)).toBeCloseTo(0.3, 10)
    expect(survivalExpectedPackagesForWave({ ...state, packageAfterBoss: false }, 10, 0.3)).toBeCloseTo(0.3, 10)
  })

  it('leaves health that is already above the cap where it is', () => {
    expect(survivalHealthAfterPackage(500, 100, 0.5, 2)).toBe(500)
  })
})

describe('lifesteal and health regen', () => {
  const state = survivalTestState()
  const stats = resolveSurvivalStats(state)

  it('stop at full health', () => {
    const healing = healingForWave(state, 5, { health: stats.maxHealth - 5, packages: 0, projectileDamage: 1e12, seconds: 1e6 })
    expect(healing.lifesteal).toBeCloseTo(5, 6)
    expect(healing.regen).toBe(0)
    expect(healing.healthAfter).toBeCloseTo(stats.maxHealth, 6)
  })

  it('never remove the overheal a package gave', () => {
    const over = stats.maxHealth * 1.8
    const healing = healingForWave(state, 5, { health: over, packages: 0, projectileDamage: 1e12, seconds: 1e6 })
    expect(healing.lifesteal).toBe(0)
    expect(healing.regen).toBe(0)
    expect(healing.healthAfter).toBe(over)
    expect(survivalHealthAfterCappedHeal(180, 100, 50)).toBe(180)
  })

  it('heal lifesteal x projectile damage and regen x seconds below the cap', () => {
    const healing = healingForWave(state, 5, { health: 1, packages: 0, projectileDamage: 1000, seconds: 2 })
    expect(healing.lifesteal).toBeCloseTo(stats.lifesteal * 1000, 6)
    expect(healing.regen).toBeCloseTo(stats.regenPerSecond * 2, 6)
  })

  it('are both off while a Vampire drains the tower', () => {
    const healing = healingForWave(state, 5, { health: 1, packages: 0, projectileDamage: 1000, seconds: 2, healingBlocked: true })
    expect(healing.lifesteal).toBe(0)
    expect(healing.regen).toBe(0)
  })
})

describe('Death Wave health', () => {
  const state = survivalTestState({ deathWave: { maxHealthFractionPerWave: 0.1, maxHealthFractionCap: 0.25 } })
  const base = resolveSurvivalStats(state).baseMaxHealth

  it('raises max health and current health by the same amount', () => {
    const healing = healingForWave(state, 5, { health: 100, packages: 0, lifestealActive: false, seconds: 0 })
    expect(healing.deathWave).toBeCloseTo(0.1 * base, 6)
    expect(healing.maxHealth).toBeCloseTo(1.1 * base, 6)
    expect(healing.healthAfter).toBeCloseTo(100 + 0.1 * base, 6)
  })

  it('stops at its cap', () => {
    const nearly = healingForWave(state, 5, { health: 100, packages: 0, lifestealActive: false, seconds: 0, deathWaveFraction: 0.2 })
    expect(nearly.deathWave).toBeCloseTo(0.05 * base, 6)
    const full = healingForWave(state, 5, { health: 100, packages: 0, lifestealActive: false, seconds: 0, deathWaveFraction: 0.25 })
    expect(full.deathWave).toBe(0)
  })
})
