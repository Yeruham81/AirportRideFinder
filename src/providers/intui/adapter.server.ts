import type { NormalizedLocation } from "@/domain/types";
import type { ProviderAdapter } from "@/providers/adapter";
import { buildIntuiGeoRequest } from "./request";

export const INTUI_ENDPOINT = "https://api.intui.travel/ver1_0/GetAvailCar/";
/** Isolated metadata only; never append to the four-provider demo list. */
export const INTUI_PROVIDER = { id: "intui", displayName: "Intui.travel", brand: "blue", isFictional: false } as const;

export type IntuiClientStatus = "missing_secret" | "disabled";

/**
 * Deliberately non-networking client scaffold. No actual credentials are read.
 * TODO: independently verify response allprice shape and resolve official
 * article's GET heading vs POST JSON examples before enabling transport.
 * Verified examples place `apikey` in JSON, NOT a header or query string.
 * Future transport: server-only POST JSON, HTTPS, redirect:error, bounded
 * fetch+body timeout, sanitized 401/403/429/status/network errors, no retries.
 * Read process.env.INTUI_API_KEY only inside that future execution boundary.
 * Both key and INTUI_LIVE_ENABLED='true' will be required, not sufficient.
 * Tracking is unconfirmed; raw intuiUrlOrderSingle must never be actionable.
 */
export async function intuiGetAvailCar(
  request: ReturnType<typeof buildIntuiGeoRequest>,
  options: { fetchImpl?: typeof fetch; secretConfigured?: boolean; liveEnabled?: boolean } = {},
): Promise<{ status: IntuiClientStatus }> {
  void request;
  // Presence only, supplied by a future trusted caller; never accept a key here.
  if (!options.secretConfigured) return { status: "missing_secret" };
  return { status: "disabled" };
}

export function createIntuiAdapter(locations: readonly NormalizedLocation[]): ProviderAdapter {
  const byId = new Map(locations.map((l) => [l.id, l]));
  return {
    provider: INTUI_PROVIDER,
    mapLocation: (location) => location.coords ? location.id : null,
    async search(request) {
      const pickup = byId.get(request.pickupId);
      const dropoff = byId.get(request.dropoffId);
      if (!pickup || !dropoff) return {
        providerId: "intui", status: "error", offers: [], durationMs: 0,
        error: { code: "invalid_locations", message: "Intui locations are invalid" },
      };
      try { buildIntuiGeoRequest(request, pickup, dropoff); }
      catch { return {
        providerId: "intui", status: "error", offers: [], durationMs: 0,
        error: { code: "invalid_request", message: "Intui search inputs are invalid" },
      }; }
      return {
        providerId: "intui", status: "error", offers: [], durationMs: 0,
        error: { code: "integration_disabled", message: "Intui integration is not activated" },
      };
    },
  };
}