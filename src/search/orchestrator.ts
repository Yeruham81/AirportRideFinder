import { findDemoRoute, type DemoRoute } from "@/data/locations";
import type {
  NormalizedTransferOffer,
  ProviderSearchResult,
  TransferSearchRequest,
} from "@/domain/types";
import { ProviderError, type ProviderAdapter } from "@/providers/adapter";
import { getAdapters, type RegistryOptions } from "@/providers/registry";

export interface SearchResponse {
  request: TransferSearchRequest;
  searchRef: string;
  /** Non-null only for predefined demonstration routes. */
  demoRoute: DemoRoute | null;
  results: ProviderSearchResult[];
  offers: NormalizedTransferOffer[];
}

export interface SearchOptions extends RegistryOptions {
  adapters?: ProviderAdapter[];
  timeoutMs?: number;
}

const searchRefFor = (r: TransferSearchRequest) =>
  [r.pickupId, r.dropoffId, r.localDate, r.localTime, r.passengers, r.luggage].join("|");

/**
 * Query all providers in parallel. One failing or slow provider never blocks
 * the others; each gets its own status.
 */
export async function searchTransfers(
  request: TransferSearchRequest,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const adapters = options.adapters ?? getAdapters(options);
  const timeoutMs = options.timeoutMs ?? 4000;
  const searchRef = searchRefFor(request);

  const results = await Promise.all(
    adapters.map(async (adapter): Promise<ProviderSearchResult> => {
      const started = Date.now();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      try {
        const outcome = await Promise.race([
          adapter.search(request, { searchRef, signal: controller.signal }),
          timeout,
        ]);
        if (outcome === "timeout") {
          controller.abort();
          return {
            providerId: adapter.provider.id,
            status: "timeout",
            offers: [],
            error: { code: "timeout", message: "Provider did not respond in time" },
            durationMs: Date.now() - started,
          };
        }
        return outcome;
      } catch (err) {
        return {
          providerId: adapter.provider.id,
          status: "error",
          offers: [],
          error: {
            code: err instanceof ProviderError ? err.code : "unknown",
            message: "Provider returned an error",
          },
          durationMs: Date.now() - started,
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return {
    request,
    searchRef,
    demoRoute: findDemoRoute(request.pickupId, request.dropoffId),
    results,
    offers: results.flatMap((r) => r.offers),
  };
}
