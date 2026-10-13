import { getLocation } from "@/data/locations";
import type { RawMockOffer } from "@/data/mock-offers";
import { moneyFromDecimal } from "@/domain/money";
import type { NormalizedTransferOffer, TransferProvider } from "@/domain/types";
import { mapVehicleLabel } from "@/domain/vehicle-taxonomy";
import { ProviderError, type ProviderAdapter } from "../adapter";

export type SimulatedOutcome = "error" | "timeout";

export interface MockAdapterOptions {
  /** Artificial latency in ms (0 in tests / SSR). */
  delayMs?: number | undefined;
  /** Demo-only failure simulation. */
  simulate?: SimulatedOutcome | undefined;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("aborted", "Request aborted"));
    });
  });

/** Demonstration adapter backed by local sample data. Makes no network calls. */
export function createMockAdapter(
  provider: TransferProvider,
  dataset: RawMockOffer[],
  options: MockAdapterOptions = {},
): ProviderAdapter {
  const mine = dataset.filter((o) => o.providerId === provider.id);

  return {
    provider,
    mapLocation: (loc) => loc.providerRefs[provider.id] ?? null,
    async search(request, ctx) {
      const started = Date.now();
      if (options.simulate === "timeout") {
        // Never answers; the orchestrator's timeout decides.
        await new Promise<never>((_, reject) =>
          ctx.signal?.addEventListener("abort", () =>
            reject(new ProviderError("aborted", "Request aborted")),
          ),
        );
      }
      await wait(options.delayMs ?? 0, ctx.signal);
      if (options.simulate === "error") {
        throw new ProviderError("provider_unavailable", "Provider service unavailable");
      }

      const pickup = getLocation(request.pickupId);
      const dropoff = getLocation(request.dropoffId);
      const pickupRef = pickup ? this.mapLocation(pickup) : null;
      const dropoffRef = dropoff ? this.mapLocation(dropoff) : null;

      const offers: NormalizedTransferOffer[] = mine
        .filter((o) => o.pickupRef === pickupRef && o.dropoffRef === dropoffRef)
        .map((o) => ({
          id: `${provider.id}:${o.ref}`,
          providerId: provider.id,
          providerOfferId: o.ref,
          searchRef: ctx.searchRef,
          category: mapVehicleLabel(provider.id, o.vehicleLabel),
          providerVehicleLabel: o.vehicleLabel,
          maxPassengers: o.maxPassengers,
          maxLuggage: o.maxLuggage,
          price: {
            quotedPrice: moneyFromDecimal(o.currency, o.price),
            displayPrice: null,
            taxesAndFees: o.taxes,
          },
          cancellation: o.cancellation,
          waitingTimeMins: o.waitingTimeMins,
          meetAndGreet: o.meetAndGreet,
          conditions: [],
          bookingRef: `demo:${provider.id}:${o.ref}`,
          source: "mock",
          quote: { kind: "sample" },
          actionable: false,
        }));

      return {
        providerId: provider.id,
        status: offers.length ? "ok" : "no_offers",
        offers,
        durationMs: Date.now() - started,
      };
    },
  };
}
