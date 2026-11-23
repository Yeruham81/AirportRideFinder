import type { NormalizedTransferOffer } from "@/domain/types";
import { ALPS_QUOTE_MAX_AGE_MS, isAlpsBookingUrl } from "@/providers/alps2alps/booking-link";

export interface LiveReferralOffer {
  source: "public_live";
  providerId: "alps2alps";
  actionable: boolean;
  bookingUrl: string | null;
  quotedAt: number;
  expiresAt: number;
}

/**
 * Provider-independent booking-link resolution. Each provider may later use
 * temporary URLs, quote ids, signed links or affiliate parameters; the final
 * strategy is provider-specific. Mock offers never produce a real URL.
 */
export type BookingLinkResolution =
  | { kind: "demo"; providerId: string; message: string }
  | { kind: "url"; url: string; expiresAt: string | null }
  | { kind: "unavailable"; reason: string };

export async function resolveBookingLink(
  offer: NormalizedTransferOffer | LiveReferralOffer,
): Promise<BookingLinkResolution> {
  if (offer.source === "public_live") {
    if (!offer.actionable || !isAlpsBookingUrl(offer.bookingUrl))
      return { kind: "unavailable", reason: "Supplier booking link unavailable." };
    const now = Date.now();
    if (!Number.isFinite(offer.quotedAt) || !Number.isFinite(offer.expiresAt) ||
      offer.quotedAt > now || offer.expiresAt <= now || offer.expiresAt - offer.quotedAt > ALPS_QUOTE_MAX_AGE_MS)
      return { kind: "unavailable", reason: "Refresh prices to continue booking." };
    return { kind: "url", url: offer.bookingUrl, expiresAt: new Date(offer.expiresAt).toISOString() };
  }
  if (offer.source === "mock" || !offer.actionable) {
    return {
      kind: "demo",
      providerId: offer.providerId,
      message:
        "In the live version, this button will take you to the provider's own website to review the price and complete your booking there.",
    };
  }
  return { kind: "unavailable", reason: "Live redirects are not enabled in this preview." };
}
