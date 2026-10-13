import type {
  NormalizedLocation,
  ProviderSearchResult,
  TransferProvider,
  TransferSearchRequest,
} from "@/domain/types";

export interface AdapterContext {
  /** Stable reference tying offers to this search. */
  searchRef: string;
  /** Abort signal for timeouts / cancellation. */
  signal?: AbortSignal;
}

/**
 * Contract every provider integration implements, mock or live. Live adapters
 * will run server-side only so credentials never reach the browser.
 */
export interface ProviderAdapter {
  readonly provider: TransferProvider;
  /** Translate our location to the provider's own identifier (null = unsupported). */
  mapLocation(location: NormalizedLocation): string | null;
  /** Return normalized offers. "no_offers" is a successful, empty reply. */
  search(request: TransferSearchRequest, ctx: AdapterContext): Promise<ProviderSearchResult>;
}

export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
