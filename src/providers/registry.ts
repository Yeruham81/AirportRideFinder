import { MOCK_OFFERS } from "@/data/mock-offers";
import { PROVIDERS } from "@/data/providers";
import type { ProviderAdapter } from "./adapter";
import { createMockAdapter, type SimulatedOutcome } from "./mock/mock-adapter";

export interface RegistryOptions {
  delayMs?: number;
  simulate?: Record<string, SimulatedOutcome>;
}

/**
 * Phase 1: every provider is served by a mock adapter. Live adapters will be
 * registered here (server-side) without changing the orchestrator or UI.
 */
export function getAdapters(options: RegistryOptions = {}): ProviderAdapter[] {
  return PROVIDERS.map((p) =>
    createMockAdapter(p, MOCK_OFFERS, {
      delayMs: options.delayMs,
      simulate: options.simulate?.[p.id],
    }),
  );
}
