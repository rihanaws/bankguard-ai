/**
 * Curated alpha seed for the six tracked institutions.
 * ILLUSTRATIVE APPETITE DATA — encode observed/published patterns, then verify
 * against each institution's current ToS before production (dataAsOf gates
 * staleness; the KB crawl loop keeps these rows fresh once live).
 * Production source of truth is the BankProfile table; this seed boots it.
 */
import type { BankAppetite } from "./bankability";

export const BANK_SEED_DATA_AS_OF = "2026-06-12";

export const BANK_APPETITE_SEED: BankAppetite[] = [
  {
    slug: "mercury",
    name: "Mercury",
    kind: "NEOBANK_BAAS",
    nraEligible: true,
    requiresUsAddress: false,
    requiresUsOperations: false,
    restrictedGeoIso: ["IR", "RU", "BY", "MM"],
    mccBlocklist: ["6051", "7995"],
    mccGreylist: ["7372"],
  },
  {
    slug: "relay",
    name: "Relay",
    kind: "NEOBANK_BAAS",
    nraEligible: true,
    requiresUsAddress: true,
    requiresUsOperations: false,
    restrictedGeoIso: ["IR", "RU", "BY"],
    mccBlocklist: ["6051", "7995", "5967"],
    mccGreylist: [],
  },
  {
    slug: "rho",
    name: "Rho",
    kind: "NEOBANK_BAAS",
    nraEligible: true,
    requiresUsAddress: false,
    requiresUsOperations: true,
    restrictedGeoIso: ["IR", "RU", "BY", "BD"],
    mccBlocklist: ["6051"],
    mccGreylist: ["7372", "7392"],
  },
  {
    slug: "wise",
    name: "Wise Business",
    kind: "EMI_MSB",
    nraEligible: true,
    requiresUsAddress: false,
    requiresUsOperations: false,
    restrictedGeoIso: ["IR", "MM"],
    mccBlocklist: ["6051", "7995"],
    mccGreylist: [],
  },
  {
    slug: "payoneer",
    name: "Payoneer",
    kind: "EMI_MSB",
    nraEligible: true,
    requiresUsAddress: false,
    requiresUsOperations: false,
    restrictedGeoIso: ["IR", "RU", "BY"],
    mccBlocklist: ["7995"],
    mccGreylist: ["6051"],
  },
  {
    slug: "brex",
    name: "Brex",
    kind: "NEOBANK_BAAS",
    nraEligible: false,
    requiresUsAddress: true,
    requiresUsOperations: true,
    restrictedGeoIso: [],
    mccBlocklist: ["6051", "7995"],
    mccGreylist: [],
  },
];
