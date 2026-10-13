import type { NormalizedTransferOffer } from "@/domain/types";

/**
 * Provider-independent booking-link resolution. Each provider may later use
 * temporary URLs, quote ids, signed links or affiliate parameters; the final
 * strategy is an open decision. Phase 1 never produces a real URL.
 */
export type BookingLinkResolution =
  | { kind: "demo"; providerId: string; message: string }
  | { kind: "url"; url: string; expiresAt: string | null }
  | { kind: "unavailable"; reason: string };

export async function resolveBookingLink(
  offer: NormalizedTransferOffer,
): Promise<BookingLinkResolution> {
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
