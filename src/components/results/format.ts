import type { FeeInclusion } from "@/domain/types";

export function feeLabel(f: FeeInclusion): string {
  switch (f) {
    case "included":
      return "Taxes & fees included";
    case "excluded":
      return "Excl. taxes & fees";
    case "unknown":
      return "Fee details not available";
  }
}

/** Label under a price: only confirmed-inclusive prices are called a total. */
export function priceLabel(f: FeeInclusion): string {
  return f === "included" ? "Sample total" : "Sample price";
}

/** Short fee status for compact places (glance strip). */
export function shortFeeLabel(f: FeeInclusion): string {
  switch (f) {
    case "included":
      return "Fees included";
    case "excluded":
      return "+ taxes & fees";
    case "unknown":
      return "Fees not confirmed";
  }
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
