/**
 * The v29 Vault: every buyable Harmony, Power and Enemy upgrade, with its key cost and value
 * per level, its unit, its game label and what it requires.
 *
 * Every row matches game data v29.2.1 (build 1294), pinned row by row to
 * facts/v29.2.1/vault-upgrades.json by tests/data/vault-v29-facts.test.ts. Bastion Automation
 * (1300) and Smart Bastion Automation (1310) are in the game data too, but they need the Bastion
 * card, which is not released, so they are not listed here.
 *
 * This reference is separate from the pre-v29 vault tree API in src/data/vault. Row `name` and
 * `stat` values are also the keys the save reader reports, so a wording difference from the game
 * stays here and the game's own label goes in `gameName`.
 */

export interface VaultV29Category {
  readonly name: string
  /** Keys to unlock the category. 0 where it is open from the start. */
  readonly unlockCost: number | null
  readonly autoUnlocked: boolean
  /** What the player must have before the category can be opened. Absent when nothing is needed. */
  readonly requirements?: readonly VaultV29Requirement[]
}

/** What the workbook's colour legend says about a Power row. */
export type VaultV29Status = 'excluded' | 'clarified' | 'added'

/**
 * What a level value means.
 *
 * - `percent`: already a percent (5 means 5%).
 * - `fraction`: a fraction (0.05 means 5%).
 * - `seconds`, `time`, `meters`, `degrees`: that unit.
 * - `plain`: a number shown as it is (0.01 coin bonus, 2 m of bot range, 3 presets, 1 for an
 *   on/off upgrade).
 */
export type VaultV29Unit = 'percent' | 'fraction' | 'seconds' | 'time' | 'meters' | 'degrees' | 'plain'

/**
 * Something the player must own or reach before an upgrade or category can be bought.
 *
 * `value` is the game's id:
 * - a card id for `card` and `cardMastery`, with `cardId` naming the card in CARDS;
 * - an ultimate weapon id for `ultimateWeapon`;
 * - for `tournamentLeague`, a league id (0 Copper … 6 Mythic) that the highest league reached
 *   must at least equal.
 *
 * `name` is the card, weapon or league it refers to.
 */
export interface VaultV29Requirement {
  readonly kind: 'card' | 'cardMastery' | 'ultimateWeapon' | 'tournamentLeague'
  readonly value: number
  readonly name: string
  readonly cardId?: string
}

export interface VaultV29Upgrade {
  readonly category: string
  readonly name: string
  /** The game's stable Vault upgrade id. */
  readonly vaultId?: number
  /** Parent VaultID this upgrade depends on — it cannot be bought until the parent is maxed. */
  readonly dependsOn?: number
  /** Key cost per level, in order. */
  readonly levelCosts: readonly number[]
  /** Total benefit at each level, in order, as the game stores it, in `unit`. */
  readonly levelValues: readonly number[]
  readonly unit: VaultV29Unit
  /** The game's English label for the upgrade, which can word it differently from `name`. */
  readonly gameName: string
  /** What must be owned first. Absent when nothing is needed. */
  readonly requirements?: readonly VaultV29Requirement[]
  readonly status: VaultV29Status | null
}

/**
 * An Enemy-tree row, which is named by its enemy and stat rather than by a single label.
 *
 * Deliberately not extending VaultV29Upgrade: that carries a name, and an enemy row has no
 * single name to put in it. Extending it and leaving name off does not type-check, which is the
 * type system noticing that these are two different shapes wearing one word.
 */
export interface VaultV29EnemyUpgrade {
  readonly category: string
  /** The game's stable Vault upgrade id. */
  readonly vaultId?: number
  readonly enemy: string
  readonly stat: string
  readonly levelCosts: readonly number[]
  /** Total benefit at each level, in order, as the game stores it, in `unit`. */
  readonly levelValues: readonly number[]
  readonly unit: VaultV29Unit
  /** The game's English label for the stat, which can word it differently from `stat`. */
  readonly gameName: string
  readonly status: VaultV29Status | null
}

export interface VaultV29Tree {
  readonly categories: readonly VaultV29Category[]
  readonly upgrades: readonly VaultV29Upgrade[]
}

/** Every row below matches game data v29.2.1. */
export const VAULT_V29_VERIFIED = true

export const VAULT_V29_PROVENANCE =
  'Matches game data v29.2.1 (build 1294): every key cost, level value, unit, dependency and requirement is pinned to facts/v29.2.1/vault-upgrades.json. The key costs were first cross-confirmed 80/80 against mytower.app (credit: https://mytower.app).'


export const VAULT_V29_HARMONY: VaultV29Tree = {
  "categories": [
    {
      "name": "Gameplay",
      "unlockCost": 0,
      "autoUnlocked": true
    },
    {
      "name": "Cards",
      "unlockCost": 5,
      "autoUnlocked": false
    },
    {
      "name": "Ultimate Weapons",
      "unlockCost": 5,
      "autoUnlocked": false
    },
    {
      "name": "Modules",
      "unlockCost": 5,
      "autoUnlocked": false
    },
    {
      "name": "Bots",
      "unlockCost": 10,
      "autoUnlocked": false
    },
    {
      "name": "Workshop",
      "unlockCost": 10,
      "autoUnlocked": false
    },
    {
      "name": "Guardians",
      "unlockCost": 10,
      "autoUnlocked": false
    }
  ],
  "upgrades": [
    {
      "category": "Gameplay",
      "name": "Auto Restart Run",
      "vaultId": 1000,
      "levelCosts": [20],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Auto Restart Run",
      "status": null
    },
    {
      "category": "Gameplay",
      "name": "Ad Gem Stack",
      "vaultId": 1010,
      "levelCosts": [10, 20, 40, 60],
      "levelValues": [2, 3, 4, 5],
      "unit": "plain",
      "gameName": "Ad Gem Stack",
      "status": null
    },
    {
      "category": "Gameplay",
      "name": "Damage Cap Slider",
      "vaultId": 1020,
      "levelCosts": [25],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Damage Cap Slider",
      "status": null
    },
    {
      "category": "Gameplay",
      "name": "Global Presets",
      "vaultId": 1030,
      "levelCosts": [20],
      "levelValues": [3],
      "unit": "plain",
      "gameName": "Global Presets",
      "status": null
    },
    {
      "category": "Cards",
      "name": "Additional Card Slot",
      "vaultId": 1200,
      "levelCosts": [5, 10, 20, 40, 60, 80],
      "levelValues": [1, 2, 3, 4, 5, 6],
      "unit": "plain",
      "gameName": "Additional Card Slot",
      "status": null
    },
    {
      "category": "Cards",
      "name": "Charge Berserker",
      "vaultId": 1210,
      "levelCosts": [5],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Charge Berserker",
      "requirements": [
        {
          "kind": "card",
          "value": 32,
          "cardId": "zerk",
          "name": "Berserker"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Demon Mode Automation",
      "vaultId": 1220,
      "levelCosts": [10],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Demon Mode Automation",
      "requirements": [
        {
          "kind": "card",
          "value": 29,
          "cardId": "dm",
          "name": "Demon Mode"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Smart Demon Mode Automation",
      "vaultId": 1230,
      "dependsOn": 1220,
      "levelCosts": [25],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Smart Demon Mode Automation",
      "requirements": [
        {
          "kind": "card",
          "value": 29,
          "cardId": "dm",
          "name": "Demon Mode"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Nuke Automation",
      "vaultId": 1240,
      "levelCosts": [10],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Nuke Automation",
      "requirements": [
        {
          "kind": "card",
          "value": 34,
          "cardId": "nuke",
          "name": "Nuke"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Smart Nuke Automation",
      "vaultId": 1250,
      "dependsOn": 1240,
      "levelCosts": [25],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Smart Nuke Automation",
      "requirements": [
        {
          "kind": "card",
          "value": 34,
          "cardId": "nuke",
          "name": "Nuke"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Death Ray Toggle",
      "vaultId": 1260,
      "levelCosts": [15],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Death Ray Toggle",
      "requirements": [
        {
          "kind": "card",
          "value": 25,
          "cardId": "dr",
          "name": "Death Ray"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Spawn Accelerator Toggle",
      "vaultId": 1270,
      "levelCosts": [20],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Spawn Accelerator Toggle",
      "requirements": [
        {
          "kind": "cardMastery",
          "value": 31,
          "cardId": "wa",
          "name": "Wave Accelerator"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Elite Balance Toggle",
      "vaultId": 1320,
      "levelCosts": [20],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Elite Balance Toggle",
      "requirements": [
        {
          "kind": "cardMastery",
          "value": 11,
          "cardId": "eb",
          "name": "Enemy Balance"
        }
      ],
      "status": null
    },
    {
      "category": "Cards",
      "name": "Life Saving Ordering",
      "vaultId": 1280,
      "levelCosts": [50],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Life Saving Ordering",
      "status": null
    },
    {
      "category": "Cards",
      "name": "Energy Shield Restriction",
      "vaultId": 1290,
      "levelCosts": [50],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Energy Shield Restriction",
      "requirements": [
        {
          "kind": "card",
          "value": 30,
          "cardId": "es",
          "name": "Energy Shield"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Missile Barrage Automation",
      "vaultId": 1400,
      "levelCosts": [10],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Missile Barrage Automation",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 1,
          "name": "Smart Missile"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Smart Missile Barrage Automation",
      "vaultId": 1410,
      "dependsOn": 1400,
      "levelCosts": [25],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Smart Missile Barrage Automation",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 1,
          "name": "Smart Missile"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Black Hole Size Slider",
      "vaultId": 1420,
      "levelCosts": [25],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Black Hole Size Slider",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 7,
          "name": "Black Hole"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Swamp Range Slider",
      "vaultId": 1430,
      "levelCosts": [25],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Swamp Range Slider",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 6,
          "name": "Poison Swamp"
        }
      ],
      "status": null
    },
    {
      "category": "Modules",
      "name": "Auto Shatter Rare Modules",
      "vaultId": 1600,
      "levelCosts": [5],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Auto Shatter Rare Modules",
      "status": null
    },
    {
      "category": "Modules",
      "name": "Daily Mission Shard Type",
      "vaultId": 1610,
      "levelCosts": [10],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Daily Mission Shard Type",
      "status": null
    },
    {
      "category": "Modules",
      "name": "Free Mission Reroll",
      "vaultId": 1620,
      "levelCosts": [15],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Free Mission Reroll",
      "status": null
    },
    {
      "category": "Modules",
      "name": "Module Reroll Discount",
      "vaultId": 1630,
      "levelCosts": [5, 10, 15, 20, 25, 30, 35, 40],
      "levelValues": [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20],
      "unit": "percent",
      "gameName": "Module Reroll Discount",
      "status": null
    },
    {
      "category": "Modules",
      "name": "Module Presets",
      "vaultId": 1640,
      "levelCosts": [20],
      "levelValues": [3],
      "unit": "plain",
      "gameName": "Module Presets",
      "status": null
    },
    {
      "category": "Bots",
      "name": "Bot Respec Discount",
      "vaultId": 1800,
      "levelCosts": [5, 10, 15],
      "levelValues": [33, 66, 100],
      "unit": "percent",
      "gameName": "Bot Respec Discount",
      "status": null
    },
    {
      "category": "Bots",
      "name": "Bot Presets",
      "vaultId": 1805,
      "dependsOn": 1800,
      "levelCosts": [20],
      "levelValues": [3],
      "unit": "plain",
      "gameName": "Bot Presets",
      "status": null
    },
    {
      "category": "Bots",
      "name": "Bot Range",
      "vaultId": 1810,
      "levelCosts": [10, 20, 30, 40],
      "levelValues": [2, 4, 6, 8],
      "unit": "plain",
      "gameName": "Bot Range",
      "status": null
    },
    {
      "category": "Bots",
      "name": "Bot Cooldown Sliders",
      "vaultId": 1820,
      "levelCosts": [15],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Bot Cooldown Sliders",
      "status": null
    },
    {
      "category": "Workshop",
      "name": "Workshop Respec Discount",
      "vaultId": 2000,
      "levelCosts": [5, 10, 15],
      "levelValues": [33, 66, 100],
      "unit": "percent",
      "gameName": "Workshop Respec Discount",
      "status": null
    },
    {
      "category": "Workshop",
      "name": "Workshop Presets",
      "vaultId": 2005,
      "dependsOn": 2000,
      "levelCosts": [20],
      "levelValues": [3],
      "unit": "plain",
      "gameName": "Workshop Presets",
      "status": null
    },
    {
      "category": "Workshop",
      "name": "Enhancements Discount",
      "vaultId": 2010,
      "levelCosts": [2, 4, 6, 8, 10, 12, 14, 16, 18],
      "levelValues": [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5],
      "unit": "percent",
      "gameName": "Enhancements Discount",
      "status": null
    },
    {
      "category": "Workshop",
      "name": "Workshop Orb Adjuster",
      "vaultId": 2020,
      "levelCosts": [15],
      "levelValues": [1],
      "unit": "plain",
      "gameName": "Workshop Orb Adjuster",
      "status": null
    },
    {
      "category": "Guardians",
      "name": "Guardian Respec Discount",
      "vaultId": 2200,
      "levelCosts": [5, 10, 15],
      "levelValues": [33, 66, 100],
      "unit": "percent",
      "gameName": "Guardian Respec Discount",
      "status": null
    },
    {
      "category": "Guardians",
      "name": "Guardian Presets",
      "vaultId": 2205,
      "dependsOn": 2200,
      "levelCosts": [20],
      "levelValues": [3],
      "unit": "plain",
      "gameName": "Guardian Presets",
      "status": null
    }
  ]
}
export const VAULT_V29_POWER: VaultV29Tree = {
  "categories": [
    {
      "name": "Attack",
      "unlockCost": 25,
      "autoUnlocked": false
    },
    {
      "name": "Defense",
      "unlockCost": 25,
      "autoUnlocked": false
    },
    {
      "name": "Utility",
      "unlockCost": 25,
      "autoUnlocked": false
    },
    {
      "name": "Ultimate Weapons",
      "unlockCost": 25,
      "autoUnlocked": false
    }
  ],
  "upgrades": [
    {
      "category": "Attack",
      "name": "Damage",
      "vaultId": 1,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Damage",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Attack Speed",
      "vaultId": 10,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Attack Speed",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Critical Chance",
      "vaultId": 20,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [1, 2, 3, 4, 5],
      "unit": "percent",
      "gameName": "Critical Chance",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Crit Factor",
      "vaultId": 30,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Crit Factor",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Damage / Meter",
      "vaultId": 40,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Damage / Meter",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Multishot Chance",
      "vaultId": 50,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [4, 8, 12, 16, 20],
      "unit": "percent",
      "gameName": "Multishot Chance",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Rapid Fire Chance",
      "vaultId": 60,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [4, 8, 12, 16, 20],
      "unit": "percent",
      "gameName": "Rapid Fire Chance",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Bounce Shot Chance",
      "vaultId": 70,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [4, 8, 12, 16, 20],
      "unit": "percent",
      "gameName": "Bounce Shot Chance",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Super Crit Chance",
      "vaultId": 80,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [2, 4, 6, 8, 10],
      "unit": "percent",
      "gameName": "Super Crit Chance",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Super Crit Mult",
      "vaultId": 90,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Super Crit Mult",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Rend Armor Chance",
      "vaultId": 100,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [4, 8, 12, 16, 20],
      "unit": "percent",
      "gameName": "Rend Armor Chance",
      "status": null
    },
    {
      "category": "Attack",
      "name": "Rend Armor Mult",
      "vaultId": 110,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Rend Armor Mult",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Health",
      "vaultId": 200,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Health Regen",
      "vaultId": 210,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Health Regen",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Defense %",
      "vaultId": 220,
      "levelCosts": [20, 40, 70],
      "levelValues": [0.5, 1, 1.5],
      "unit": "percent",
      "gameName": "Defense %",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Defense Absolute",
      "vaultId": 230,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Defense Absolute",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Thorn Damage",
      "vaultId": 240,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Thorn Damage",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Knockback Chance",
      "vaultId": 250,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [1, 2, 3, 4, 5],
      "unit": "percent",
      "gameName": "Knockback Chance",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Knockback Force",
      "vaultId": 260,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Knockback Force",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Orb Speed",
      "vaultId": 270,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Orb Speed",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Orbs",
      "vaultId": 280,
      "levelCosts": [20, 40],
      "levelValues": [1, 2],
      "unit": "plain",
      "gameName": "Orbs",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Shockwave Size",
      "vaultId": 290,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Shockwave Size",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Shockwave Frequency",
      "vaultId": 300,
      "levelCosts": [20, 40],
      "levelValues": [1, 2],
      "unit": "seconds",
      "gameName": "Shockwave Frequency",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Death Defy",
      "vaultId": 310,
      "levelCosts": [20, 40, 80, 140, 220],
      "levelValues": [2, 4, 6, 8, 10],
      "unit": "percent",
      "gameName": "Death Defy",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Wall Health",
      "vaultId": 320,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Wall Health",
      "status": null
    },
    {
      "category": "Defense",
      "name": "Wall Rebuild",
      "vaultId": 330,
      "levelCosts": [20, 40, 80, 140, 220],
      "levelValues": [20, 40, 60, 80, 100],
      "unit": "seconds",
      "gameName": "Wall Rebuild",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Cash Bonus",
      "vaultId": 400,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Cash Bonus",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Cash / Wave",
      "vaultId": 410,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [100, 200, 300, 400, 500],
      "unit": "percent",
      "gameName": "Cash / Wave",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Coins / Kill",
      "vaultId": 420,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Coins / Kill",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Coins / Wave",
      "vaultId": 430,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [100, 200, 300, 400, 500],
      "unit": "percent",
      "gameName": "Coins / Wave",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Free Attack Upgrade",
      "vaultId": 440,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Free Attack Upgrade",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Free Defense Upgrade",
      "vaultId": 450,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Free Defense Upgrade",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Free Utility Upgrade",
      "vaultId": 460,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Free Utility Upgrade",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Interest / Wave",
      "vaultId": 470,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [100, 200, 300, 400, 500],
      "unit": "percent",
      "gameName": "Interest / Wave",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Recovery Amount",
      "vaultId": 480,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Recovery Amount",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Max Recovery",
      "vaultId": 490,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [20, 40, 60, 80, 100],
      "unit": "percent",
      "gameName": "Max Recovery",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Enemy Attack Skip",
      "vaultId": 500,
      "levelCosts": [20, 40, 80],
      "levelValues": [0.5, 1, 1.5],
      "unit": "percent",
      "gameName": "Enemy Attack Skip",
      "status": null
    },
    {
      "category": "Utility",
      "name": "Enemy Health Skip",
      "vaultId": 510,
      "levelCosts": [20, 40, 80],
      "levelValues": [0.5, 1, 1.5],
      "unit": "percent",
      "gameName": "Enemy Health Skip",
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Ultimate Damage",
      "vaultId": 600,
      "levelCosts": [5, 10, 20, 35, 55],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Ultimate Damage",
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Chain Lightning Damage",
      "vaultId": 610,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Chain Lightning Damage",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 0,
          "name": "Chain Lightning"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Smart Missile Damage",
      "vaultId": 620,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Smart Missile Damage",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 1,
          "name": "Smart Missile"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Death Wave Damage",
      "vaultId": 630,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Death Wave Damage",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 2,
          "name": "Death Wave"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Inner Land Mine Damage",
      "vaultId": 640,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Inner Land Mine Damage",
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Golden Tower Bonus",
      "vaultId": 650,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [1, 2, 3, 4, 5],
      "unit": "percent",
      "gameName": "Golden Tower Bonus",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 5,
          "name": "Golden Tower"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Swamp Damage",
      "vaultId": 660,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Swamp Damage",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 6,
          "name": "Poison Swamp"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Spotlight Bonus",
      "vaultId": 670,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Spotlight Bonus",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 8,
          "name": "Spotlight"
        }
      ],
      "status": null
    },
    {
      "category": "Ultimate Weapons",
      "name": "Black Hole Size",
      "vaultId": 680,
      "levelCosts": [10, 20, 40, 70, 110],
      "levelValues": [5, 10, 15, 20, 25],
      "unit": "percent",
      "gameName": "Black Hole Size",
      "requirements": [
        {
          "kind": "ultimateWeapon",
          "value": 7,
          "name": "Black Hole"
        }
      ],
      "status": null
    }
  ]
}
export const VAULT_V29_ENEMY: {
  readonly categories: readonly VaultV29Category[]
  readonly upgrades: readonly VaultV29EnemyUpgrade[]
} = {
  "categories": [
    {
      "name": "Simple",
      "unlockCost": 0,
      "autoUnlocked": true,
      "requirements": [
        {
          "kind": "tournamentLeague",
          "value": 6,
          "name": "Mythic"
        }
      ]
    },
    {
      "name": "Advanced",
      "unlockCost": 50,
      "autoUnlocked": false,
      "requirements": [
        {
          "kind": "tournamentLeague",
          "value": 6,
          "name": "Mythic"
        }
      ]
    },
    {
      "name": "Elites",
      "unlockCost": 100,
      "autoUnlocked": false,
      "requirements": [
        {
          "kind": "tournamentLeague",
          "value": 6,
          "name": "Mythic"
        }
      ]
    },
    {
      "name": "Fleets",
      "unlockCost": 150,
      "autoUnlocked": false,
      "requirements": [
        {
          "kind": "tournamentLeague",
          "value": 6,
          "name": "Mythic"
        }
      ]
    }
  ],
  "upgrades": [
    {
      "category": "Simple",
      "vaultId": 3000,
      "enemy": "Basic",
      "stat": "Attack (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3010,
      "enemy": "Basic",
      "stat": "Health (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3020,
      "enemy": "Basic",
      "stat": "Coin Bonus (+1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3],
      "unit": "plain",
      "gameName": "Coin Bonus",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3100,
      "enemy": "Fast",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3110,
      "enemy": "Fast",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3120,
      "enemy": "Fast",
      "stat": "Speed (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Speed",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3200,
      "enemy": "Tank",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3210,
      "enemy": "Tank",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Simple",
      "vaultId": 3220,
      "enemy": "Tank",
      "stat": "Mass (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Mass",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4000,
      "enemy": "Boss",
      "stat": "Attack (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4010,
      "enemy": "Boss",
      "stat": "Health (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4020,
      "enemy": "Boss",
      "stat": "Common Module Drop Chance (+0.1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3],
      "unit": "percent",
      "gameName": "Common Drop Chance",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4100,
      "enemy": "Ranged",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4110,
      "enemy": "Ranged",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4120,
      "enemy": "Ranged",
      "stat": "Ranged Distance (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Range",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4200,
      "enemy": "Protector",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4210,
      "enemy": "Protector",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Advanced",
      "vaultId": 4220,
      "enemy": "Protector",
      "stat": "Radius (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Radius",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5000,
      "enemy": "Vampire",
      "stat": "Attack (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5010,
      "enemy": "Vampire",
      "stat": "Health (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5020,
      "enemy": "Vampire",
      "stat": "Attack Speed (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Speed",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5100,
      "enemy": "Scatter",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5110,
      "enemy": "Scatter",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5120,
      "enemy": "Scatter",
      "stat": "Attack Speed (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Speed",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5200,
      "enemy": "Ray",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5210,
      "enemy": "Ray",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Elites",
      "vaultId": 5220,
      "enemy": "Ray",
      "stat": "Attack Speed (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Speed",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6000,
      "enemy": "Saboteur",
      "stat": "Attack Speed (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Speed",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6010,
      "enemy": "Saboteur",
      "stat": "Health (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6020,
      "enemy": "Saboteur",
      "stat": "Miss Chance (+1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Miss Chance",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6100,
      "enemy": "Commander",
      "stat": "Pulse Effect (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Pulse Effect",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6110,
      "enemy": "Commander",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6120,
      "enemy": "Commander",
      "stat": "Pulse Speed (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Pulse Speed",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6200,
      "enemy": "Overcharge",
      "stat": "Attack",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6210,
      "enemy": "Overcharge",
      "stat": "Health",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Health",
      "status": null
    },
    {
      "category": "Fleets",
      "vaultId": 6220,
      "enemy": "Overcharge",
      "stat": "Attack Exponent (-1%)",
      "levelCosts": [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103],
      "levelValues": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      "unit": "percent",
      "gameName": "Attack Exponent",
      "status": null
    }
  ]
} as const
