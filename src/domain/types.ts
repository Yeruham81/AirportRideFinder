import type { Money } from "./money";

export type LocationType = "airport" | "terminal" | "city" | "hotel" | "address";

export interface NormalizedLocation {
  /** Stable internal identifier, independent of any provider. */
  id: string;
  displayName: string;
  shortName: string;
  type: LocationType;
  iata?: string;
  coords?: { lat: number; lng: number };
  countryCode: string;
  locality: string;
  /** IANA time zone used to interpret local pickup times. */
  timeZone: string;
  /** Each provider's own identifier for this location. */
  providerRefs: Record<string, string>;
}

export type VehicleCategory =
  | "economy_sedan"
  | "standard_sedan"
  | "comfort_sedan"
  | "business_sedan"
  | "minivan"
  | "minibus"
  | "executive"
  | "unclassified";

export interface TransferSearchRequest {
  pickupId: string;
  dropoffId: string;
  /** Local date at the pickup location, YYYY-MM-DD. */
  localDate: string;
  /** Local time at the pickup location, HH:mm. */
  localTime: string;
  /** IANA time zone of the pickup location. */
  timeZone: string;
  passengers: number;
  luggage: number;
  /** Null = no preference (Phase 1 has no conversion). */
  preferredCurrency: string | null;
  vehicleCategories?: VehicleCategory[];
  /** Reserved for future return-transfer support. */
  returnTrip?: null;
}

export type CancellationPolicy =
  | { kind: "free_until"; hoursBefore: number }
  | { kind: "with_fee"; feeDescription: string | null }
  | { kind: "non_refundable" }
  | { kind: "unknown" };

export type FeeInclusion = "included" | "excluded" | "unknown";

export interface PriceMetadata {
  /** Provider's original quoted price and currency; never overwritten. */
  quotedPrice: Money;
  /** Reserved for future conversion (with rate + source). Always null in Phase 1. */
  displayPrice: null;
  taxesAndFees: FeeInclusion;
  components?: { label: string; amount: Money }[];
}

export type BrandToken = "sky" | "aero" | "nest" | "blue";

export interface TransferProvider {
  id: string;
  displayName: string;
  brand: BrandToken;
  isFictional: boolean;
}

/** Sample data carries no timestamps; live quotes will. */
export type QuoteInfo =
  | { kind: "sample" }
  | { kind: "live"; retrievedAt: string; expiresAt: string | null };

export interface NormalizedTransferOffer {
  id: string;
  providerId: string;
  providerOfferId: string;
  searchRef: string;
  category: VehicleCategory;
  /** Provider's own vehicle wording, kept verbatim. */
  providerVehicleLabel: string;
  maxPassengers: number;
  maxLuggage: number;
  price: PriceMetadata;
  cancellation: CancellationPolicy;
  waitingTimeMins: number | null;
  meetAndGreet: boolean | null;
  conditions: string[];
  /** Opaque reference resolved by the redirect layer at click time. */
  bookingRef: string;
  source: "mock" | "live";
  quote: QuoteInfo;
  actionable: boolean;
}

export type ProviderStatus = "ok" | "no_offers" | "error" | "timeout";

export interface ProviderSearchResult {
  providerId: string;
  /** "no_offers" is a successful reply, not a failure. */
  status: ProviderStatus;
  offers: NormalizedTransferOffer[];
  error?: { code: string; message: string };
  durationMs: number;
}
