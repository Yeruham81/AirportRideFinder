/**
 * Read-only, explicitly gated Intui preview server function.
 *
 * This endpoint never mixes demo providers and never returns any booking URL.
 * Keep INTUI_PREVIEW_ENABLED unset unless the deployment is intentionally
 * secured for preview traffic. INTUI_LIVE_ENABLED and INTUI_API_KEY are also
 * required; the GitHub Actions secret is NOT a deployment environment secret.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LOCATIONS } from "@/data/locations";
import { createIntuiAdapter } from "@/providers/intui/adapter.server";
import { searchTransfers } from "@/search/orchestrator";
import { buildRequest } from "@/search/validation";

const previewSearchSchema = z.object({
  from: z.string().max(64),
  to: z.string().max(64),
  date: z.string().max(64),
  time: z.string().max(64),
  pax: z.number().int().min(1).max(16),
  bags: z.number().int().min(0).max(16),
}).strict();

export const loadIntuiPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => previewSearchSchema.parse(input))
  .handler(async ({ data }) => {
    if (process.env['INTUI_PREVIEW_ENABLED'] !== "true") {
      return { kind: "disabled" as const };
    }
    if (process.env['INTUI_LIVE_ENABLED'] !== "true" ||
      !process.env['INTUI_API_KEY']?.trim()) {
      return { kind: "unconfigured" as const };
    }

    const built = buildRequest(data);
    if (!built.ok) return { kind: "invalid" as const, errors: built.errors };

    // One vendor only. Never call getAdapters() or include fictional offers.
    const adapter = createIntuiAdapter(LOCATIONS, { enabled: true, timeoutMs: 9000 });
    const response = await searchTransfers(built.request, {
      adapters: [adapter], timeoutMs: 11000,
    });
    const status = response.results[0]?.status;
    if (status === "no_offers") return { kind: "no_offers" as const };
    if (status !== "ok") return { kind: "error" as const };
    // The normalized adapter never returns URLs or actionable offers.
    return {
      kind: "ok" as const,
      offers: response.offers.filter((offer) =>
        offer.providerId === "intui" && offer.source === "live" && !offer.actionable
      ),
    };
  });
