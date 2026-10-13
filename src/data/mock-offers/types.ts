import type { CancellationPolicy, FeeInclusion } from "@/domain/types";

/**
 * Shape of a raw sample offer as a (fictional) provider would return it, using
 * the provider's own location ids and vehicle wording. Adapters normalize this.
 */
export interface RawMockOffer {
  providerId: string;
  ref: string;
  pickupRef: string;
  dropoffRef: string;
  vehicleLabel: string;
  maxPassengers: number;
  maxLuggage: number;
  /** Decimal string in the route currency. */
  price: string;
  currency: string;
  taxes: FeeInclusion;
  cancellation: CancellationPolicy;
  meetAndGreet: boolean | null;
  waitingTimeMins: number | null;
}
