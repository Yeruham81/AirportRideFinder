import type { CancellationPolicy } from "./types";

export type CancellationTone = "positive" | "neutral" | "negative" | "unknown";

export function describeCancellation(policy: CancellationPolicy): {
  headline: string;
  detail: string;
  tone: CancellationTone;
} {
  switch (policy.kind) {
    case "free_until":
      return {
        headline: "Free cancellation",
        detail: `Until ${policy.hoursBefore}h before pickup`,
        tone: "positive",
      };
    case "with_fee":
      return {
        headline: "Cancellation fee applies",
        detail: policy.feeDescription ?? "Fee amount not provided",
        tone: "neutral",
      };
    case "non_refundable":
      return { headline: "Non-refundable", detail: "No free cancellation", tone: "negative" };
    case "unknown":
      return {
        headline: "Cancellation terms not available",
        detail: "Check with the provider",
        tone: "unknown",
      };
  }
}
