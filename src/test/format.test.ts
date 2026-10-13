import { describe, expect, it } from "vitest";
import { feeLabel, priceLabel, shortFeeLabel } from "@/components/results/format";

describe("price and fee labels", () => {
  it("only confirmed-inclusive prices are called a total", () => {
    expect(priceLabel("included")).toBe("Sample total");
    expect(priceLabel("excluded")).toBe("Sample price");
    expect(priceLabel("unknown")).toBe("Sample price");
  });
  it("fee labels never imply all-inclusive when unknown or excluded", () => {
    for (const f of ["excluded", "unknown"] as const) {
      expect(feeLabel(f)).not.toMatch(/included/i);
      expect(shortFeeLabel(f)).not.toMatch(/included/i);
    }
    expect(shortFeeLabel("included")).toBe("Fees included");
  });
});
