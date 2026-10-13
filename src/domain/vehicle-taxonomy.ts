import type { VehicleCategory } from "./types";

export const CATEGORY_ORDER: VehicleCategory[] = [
  "economy_sedan",
  "standard_sedan",
  "comfort_sedan",
  "business_sedan",
  "executive",
  "minivan",
  "minibus",
  "unclassified",
];

export const CATEGORY_LABEL: Record<VehicleCategory, string> = {
  economy_sedan: "Economy car",
  standard_sedan: "Standard sedan",
  comfort_sedan: "Comfort sedan",
  business_sedan: "Business sedan",
  executive: "Executive vehicle",
  minivan: "Minivan",
  minibus: "Minibus",
  unclassified: "Unclassified vehicle",
};

/** Shared explicit mapping rules (normalized lowercase label -> category). */
const SHARED_RULES: Record<string, VehicleCategory> = {
  "economy car": "economy_sedan",
  "standard sedan": "standard_sedan",
  "standard car": "standard_sedan",
  "comfort sedan": "comfort_sedan",
  "business sedan": "business_sedan",
  "business class sedan": "business_sedan",
  "executive vehicle": "executive",
  minivan: "minivan",
  minibus: "minibus",
};

/** Provider-specific rules, for wording only one provider uses. */
const PROVIDER_RULES: Record<string, Record<string, VehicleCategory>> = {
  skyshuttle: { "people carrier": "minivan", "saloon (standard)": "standard_sedan" },
  aeroride: { "sedan · standard": "standard_sedan", "van (up to 6)": "minivan" },
  transfernest: { "private car": "standard_sedan", "family van": "minivan" },
  blueterminal: { "classic sedan": "standard_sedan", "group shuttle bus": "minibus" },
};

/** Labels without an explicit rule are "unclassified" and never treated as equivalent. */
export function mapVehicleLabel(providerId: string, label: string): VehicleCategory {
  const key = label.trim().toLowerCase();
  return PROVIDER_RULES[providerId]?.[key] ?? SHARED_RULES[key] ?? "unclassified";
}

/** Ladder used to choose the default comparison class for a group size. */
const DEFAULT_LADDER: VehicleCategory[] = ["standard_sedan", "minivan", "minibus"];

export function defaultCategoryFor(available: Set<VehicleCategory>): VehicleCategory | null {
  for (const c of DEFAULT_LADDER) if (available.has(c)) return c;
  return CATEGORY_ORDER.find((c) => available.has(c)) ?? null;
}
