import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import { IntuiPreviewOfferResults } from "@/components/intui/IntuiPreviewOfferResults";

afterEach(cleanup);

function quote(id: string, category: VehicleCategory, minor: number, seats: number, bags: number): NormalizedTransferOffer {
  return {
    id, providerId: "intui", providerOfferId: id, searchRef: "test",
    category, providerVehicleLabel: "Standard · Sedan", maxPassengers: seats, maxLuggage: bags,
    price: { quotedPrice: { currency: "USD", minor }, displayPrice: null, taxesAndFees: "unknown" },
    cancellation: { kind: "unknown" }, waitingTimeMins: null, meetAndGreet: null, conditions: [],
    bookingRef: "disabled", source: "live",
    quote: { kind: "live", retrievedAt: "2026-11-05T12:00:00.000Z", expiresAt: null },
    actionable: false,
  };
}

const original = [
  quote("business", "business_sedan", 31550, 3, 3),
  quote("minivan", "minivan", 12924, 6, 5),
  quote("economy", "economy_sedan", 12303, 3, 3),
];

function cardText(): string[] {
  return Array.from(document.querySelectorAll("article")).map((node) => node.textContent ?? "");
}

describe("Intui preview filter UI", () => {
  it("renders cheapest first without changing original order and supports descending order", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    expect(cardText()[0]).toContain("$123.03");
    expect(cardText()[1]).toContain("$129.24");
    expect(cardText()[2]).toContain("$315.50");

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "price_desc" } });
    expect(cardText()[0]).toContain("$315.50");
    expect(cardText()[2]).toContain("$123.03");
    expect(original[0].id).toBe("business");
  });

  it("filters by category and capacity entirely on the client", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    fireEvent.change(screen.getByLabelText("Vehicle category"), { target: { value: "minivan" } });
    expect(cardText()).toHaveLength(1);
    expect(cardText()[0]).toContain("Minivan");

    fireEvent.change(screen.getByLabelText("Minimum passenger capacity"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Minimum luggage capacity"), { target: { value: "5" } });
    expect(cardText()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Minimum luggage capacity"), { target: { value: "4" } });
    expect(cardText()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cardText()).toHaveLength(3);
  });

  it("applies decimal price range and handles empty matches and validation", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    fireEvent.change(screen.getByLabelText("Minimum price (USD)"), { target: { value: "129.24" } });
    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "129.24" } });
    expect(cardText()).toHaveLength(1);
    expect(cardText()[0]).toContain("$129.24");

    fireEvent.change(screen.getByLabelText("Minimum passenger capacity"), { target: { value: "6" } });
    expect(cardText()).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "100.00" } });
    expect(screen.getByRole("alert").textContent).toContain("minimum is not above the maximum");
    expect(cardText()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "130.00" } });
    expect(cardText()).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Minimum price (USD)"), { target: { value: "999.00" } });
    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "" } });
    expect(cardText()).toHaveLength(0);
    expect(screen.getByText(/No offers match these filters/)).toBeTruthy();
  });
});
