/**
 * Intui.travel ProviderAdapter — server-side only, disabled unless explicitly
 * constructed with enabled:true AND INTUI_LIVE_ENABLED=true + INTUI_API_KEY.
 * Not registered in the site's four-provider demonstration registry.
 */
import type { NormalizedLocation, ProviderSearchResult } from "@/domain/types";
import type { ProviderAdapter } from "@/providers/adapter";
import { buildIntuiGeoRequest } from "./request";
import { fetchIntuiGetAvailCar } from "./client.server";

export const INTUI_ENDPOINT = "https://api.intui.travel/ver1_0/GetAvailCar/";
export const INTUI_PROVIDER = {
  id: "intui", displayName: "Intui.travel", brand: "blue", isFictional: false,
} as const;

export interface IntuiAdapterOptions {
  /** Dedicated opt-in: disabled by default even if deployment secrets exist. */
  enabled?: boolean;
  env?: { INTUI_API_KEY?: string; INTUI_LIVE_ENABLED?: string };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Test-only deterministic clock. Production uses actual receipt time. */
  now?: () => Date;
}

export function createIntuiAdapter(
  locations: readonly NormalizedLocation[],
  options: IntuiAdapterOptions = {},
): ProviderAdapter {
  const byId = new Map(locations.map((location) => [location.id, location]));
  return {
    provider: INTUI_PROVIDER,
    mapLocation: (location) => location.coords ? location.id : null,
    async search(request, context): Promise<ProviderSearchResult> {
      const startedAt = Date.now();
      const failure = (code: string, status: "error" | "timeout" = "error"): ProviderSearchResult => ({
        providerId: INTUI_PROVIDER.id,
        status,
        offers: [],
        durationMs: Date.now() - startedAt,
        error: { code, message: "Intui search could not be completed" },
      });
      if (!options.enabled) return failure("integration_disabled");
      const pickup = byId.get(request.pickupId);
      const dropoff = byId.get(request.dropoffId);
      if (!pickup || !dropoff) return failure("invalid_locations");

      let query: ReturnType<typeof buildIntuiGeoRequest>;
      try {
        query = buildIntuiGeoRequest(request, pickup, dropoff);
      } catch {
        return failure("invalid_request");
      }

      const result = await fetchIntuiGetAvailCar(query, {
        env: options.env,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        signal: context.signal,
        normalization: {
          searchRef: context.searchRef,
          retrievedAt: (options.now?.() ?? new Date()).toISOString(),
          passengers: request.passengers,
          luggage: request.luggage,
        },
      });
      if (result.status === "ok") return {
        providerId: INTUI_PROVIDER.id,
        status: "ok",
        offers: result.offers,
        durationMs: Date.now() - startedAt,
      };
      if (result.status === "no_offers") return {
        providerId: INTUI_PROVIDER.id,
        status: "no_offers", offers: [],
        durationMs: Date.now() - startedAt,
      };
      if (result.status === "timeout") return failure("timeout", "timeout");
      return failure(result.status);
    },
  };
}
