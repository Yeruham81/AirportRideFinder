import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TransferisePreviewResults } from "@/components/transferise/TransferisePreviewResults";
import type { TransferisePreviewOffer } from "@/providers/transferise/preview";

afterEach(cleanup);
const offers: TransferisePreviewOffer[] = [
  { id: "2", name: "VIP Van", type: "private", price: { currency: "EUR", minor: 6000 }, maxPassengers: 7, maxLuggage: null, paymentMethods: [] },
  { id: "1", name: "Standard Sedan", type: "private", price: { currency: "EUR", minor: 2504 }, maxPassengers: 3, maxLuggage: 2, paymentMethods: [] },
];
describe("Transferise preview result cards", () => {
  it("shows actual prices, a consistent count, verified capacities and the intact sandbox link", () => {
    const link = "https://transferise.com/search?test=1&ref=p12";
    render(<TransferisePreviewResults offers={offers} bookingUrl={link} />);
    expect(screen.getByText("2 vehicle options")).toBeInTheDocument();
    expect(screen.getByText("€25.04")).toBeInTheDocument();
    expect(screen.getByText(/Up to 3 passengers/)).toBeInTheDocument();
    expect(screen.getByText(/2 bags/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent))
      .toEqual(["Standard Sedan", "VIP Van"]);
    expect(screen.getByRole("link", { name: "Open sandbox booking page" })).toHaveAttribute("href", link);
  });
  it("offers no checkout link when sandbox status could not be verified", () => {
    render(<TransferisePreviewResults offers={offers} bookingUrl={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No verified sandbox booking link");
  });
});
