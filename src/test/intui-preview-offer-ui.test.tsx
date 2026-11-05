import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import { IntuiPreviewOfferResults } from "@/components/intui/IntuiPreviewOfferResults";

afterEach(cleanup);

function quote(
  id: string, category: VehicleCategory, minor: number, seats: number, bags: number,
  freeCancellation = false, meetGreet = false,
): NormalizedTransferOffer {
  return {
    id, providerId: "intui", providerOfferId: id, searchRef: "test",
    category, providerVehicleLabel: "Provider · " + id,
    maxPassengers: seats, maxLuggage: bags,
    price: { quotedPrice: { currency: "USD", minor }, displayPrice: null, taxesAndFees: "unknown" },
    cancellation: freeCancellation
      ? { kind: "free_until", hoursBefore: 24 }
      : { kind: "unknown" },
    waitingTimeMins: null, meetAndGreet: meetGreet, conditions: [],
    bookingRef: "disabled", source: "live",
    quote: { kind: "live", retrievedAt: "2026-11-05T12:00:00.000Z", expiresAt: null },
    actionable: false,
  };
}

const original = [
  quote("business", "business_sedan", 31550, 3, 3),
  quote("van-middle", "minivan", 12924, 6, 5),
  quote("economy", "economy_sedan", 12303, 3, 3, true, true),
  quote("van-pricey", "minivan", 18000, 8, 8),
  quote("van-cheap", "minivan", 10101, 6, 3),
  quote("van-upper", "minivan", 17500, 8, 8),
  quote("van-standard", "minivan", 15500, 6, 5),
];

function section(name: string) {
  return screen.getByRole("region", { name });
}
function priceOrder(sectionName: string): string[] {
  return within(section(sectionName)).getAllByRole("article").map((el) =>
    within(el).getByText(/\$\d/).textContent ?? "",
  );
}

describe("Intui category-first preview", () => {
  it("shows only three cheapest offers per category initially, plus direct category navigation", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);

    expect(screen.getByRole("navigation", { name: "Jump to vehicle category" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Minivan 5/ })).toHaveProperty("hash", "#intui-category-minivan");
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(3);
    expect(priceOrder("Minivan")).toEqual(["$101.01", "$129.24", "$155"]);
    expect(within(section("Business sedan")).getAllByRole("article")).toHaveLength(1);
    expect(within(section("Economy car")).getAllByRole("article")).toHaveLength(1);
    expect(within(section("Minivan")).getByRole("button", { name: /Show 2 more/ })).toBeTruthy();
    expect(original[0]?.id).toBe("business"); // No mutation of API data.
  });

  it("expands and collapses the selected category without changing other categories", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    const van = section("Minivan");
    const expand = within(van).getByRole("button", { name: /Show 2 more/ });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(within(van).getAllByRole("article")).toHaveLength(5);
    expect(within(van).getByRole("button", { name: /Show fewer/ }).getAttribute("aria-expanded")).toBe("true");
    expect(within(section("Economy car")).getAllByRole("article")).toHaveLength(1);
    fireEvent.click(within(van).getByRole("button", { name: /Show fewer/ }));
    expect(within(van).getAllByRole("article")).toHaveLength(3);
  });

  it("sorts prices within each category, including after expansion", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "price_desc" } });
    expect(priceOrder("Minivan")).toEqual(["$180", "$175", "$155"]);
    fireEvent.click(within(section("Minivan")).getByRole("button", { name: /Show 2 more/ }));
    expect(priceOrder("Minivan")).toEqual(["$180", "$175", "$155", "$129.24", "$101.01"]);
  });

  it("preserves category and minimum capacities as client-only filters", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    fireEvent.change(screen.getByLabelText("Vehicle category"), { target: { value: "minivan" } });
    expect(screen.queryByRole("region", { name: "Business sedan" })).toBeNull();
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("Minimum passenger capacity"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Minimum luggage capacity"), { target: { value: "8" } });
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(3);
    expect(screen.getByRole("region", { name: "Business sedan" })).toBeTruthy();
  });

  it("collapses expanded categories after filter changes", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    fireEvent.click(within(section("Minivan")).getByRole("button", { name: /Show 2 more/ }));
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("Minimum luggage capacity"), { target: { value: "3" } });
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(3);
    expect(within(section("Minivan")).getByRole("button", { name: /Show 2 more/ }).getAttribute("aria-expanded"))
      .toBe("false");
  });

  it("filters on exact quoted price without changing server data, and keeps helpful empty states", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    fireEvent.change(screen.getByLabelText("Minimum price (USD)"), { target: { value: "129.24" } });
    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "129.24" } });
    expect(within(section("Minivan")).getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Economy car" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "100.00" } });
    expect(screen.getByRole("alert").textContent).toContain("minimum is not above the maximum");
    expect(screen.queryByRole("region", { name: "Minivan" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Maximum price (USD)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Minimum price (USD)"), { target: { value: "999.00" } });
    expect(screen.queryByRole("region", { name: "Minivan" })).toBeNull();
    expect(screen.getByText(/No offers match these filters/)).toBeTruthy();
  });

  it("shows factual highlights only for supported properties, not fabricated ratings or booking buttons", () => {
    render(<IntuiPreviewOfferResults offers={original} searchedPassengers={2} searchedLuggage={2} />);
    const economy = section("Economy car");
    expect(within(economy).getByText("Lowest in category")).toBeTruthy();
    expect(within(economy).getByText("Free cancellation")).toBeTruthy();
    expect(within(economy).getByText("Meet & greet")).toBeTruthy();
    expect(within(economy).queryByRole("button", { name: /book/i })).toBeNull();
    expect(economy.textContent).toContain("Fees / extras not confirmed");
    expect(economy.textContent).toContain("Booking not yet available");
  });
});
