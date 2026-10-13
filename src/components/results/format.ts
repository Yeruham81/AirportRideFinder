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

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
