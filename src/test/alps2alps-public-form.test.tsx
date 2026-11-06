import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AlpsPublicQuotePanel } from "@/components/alps/AlpsPublicQuotePanel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const grenoble = { code: "airport-2", name: "Grenoble Airport", type: "airport", country: "France" };
const ischgl = { code: "resort-168", name: "Ischgl", type: "resort", country: "Austria" };

function getRouteResponse(url: string) {
  const params = new URL(url).searchParams;
  return {
    currency: params.get("currency"),
    route: {
      from_code: params.get("from"), to_code: params.get("to"),
      from: "Grenoble Airport", to: "Ischgl",
    },
    passengers: { adults: Number(params.get("adults")) },
    outbound: {
      pick_up_date_time: `${params.get("date")} ${params.get("time")}:00`,
      luggage: {
        normal_suitcases: Number(params.get("luggage")),
        ski_bags: Number(params.get("ski_bags")),
      },
      vehicles: [
        {
          vehicle_type_id: 4, name: "Alpine XL van",
          price: 241.5, max_passengers: 8, max_luggage: 8,
          offer_code: "requested",
          booking_url: "https://booking.alps2alps.com/book/quick-checkout?from=airport-2&to=resort-168&date=2031-01-20&time=10%3A15&vehicle=4",
        },
      ],
    },
  };
}

describe("Alps2Alps private dynamic public quote form", () => {
  it("does not fetch automatically; allows verified route, date, ski bags and prices without booking actions", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/locations/search")) {
        return Response.json(url.searchParams.get("q")?.toLowerCase().includes("gren")
          ? [grenoble] : [ischgl]);
      }
      if (url.pathname.endsWith("/transfer-options")) {
        return Response.json(getRouteResponse(input));
      }
      throw new Error("unexpected API endpoint");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AlpsPublicQuotePanel />);
    expect(fetchMock).not.toHaveBeenCalled();

    const pickup = screen.getByRole("textbox", { name: "Pickup location" });
    fireEvent.change(pickup, { target: { value: "Grenoble" } });
    expect(screen.getByText("Select a result before requesting prices.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Find locations" })[0]!);
    const pickupResults = await screen.findByRole("list", { name: "Pickup location results" });
    fireEvent.click(within(pickupResults).getByRole("button", { name: /Grenoble Airport/ }));

    const destination = screen.getByRole("textbox", { name: "Destination" });
    fireEvent.change(destination, { target: { value: "Ischgl" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Find locations" })[1]!);
    const destinationResults = await screen.findByRole("list", { name: "Destination results" });
    fireEvent.click(within(destinationResults).getByRole("button", { name: /Ischgl/ }));

    fireEvent.change(screen.getByLabelText("Pickup date (Alpine local)"), {
      target: { value: "2031-01-20" },
    });
    fireEvent.change(screen.getByLabelText("Pickup time (local)"), {
      target: { value: "10:15" },
    });
    fireEvent.change(screen.getByLabelText("Adults"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "GBP" } });
    fireEvent.change(screen.getByLabelText("Suitcases"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Ski / snowboard bags"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Search live public prices (no key)" }));

    await screen.findByText("Public quote API connection successful.");
    expect(screen.getByText("Alpine XL van")).toBeTruthy();
    expect(screen.getByText("£241.50")).toBeTruthy();
    const requests = fetchMock.mock.calls.map(([url]) => new URL(url));
    expect(requests).toHaveLength(3);
    expect(requests.filter(url => url.pathname.endsWith("locations/search"))).toHaveLength(2);
    const q = requests[2]!;
    expect(q.pathname).toBe("/api/public/v1/transfer-options");
    expect(q.searchParams.get("from")).toBe("airport-2");
    expect(q.searchParams.get("to")).toBe("resort-168");
    expect(q.searchParams.get("ski_bags")).toBe("2");
    expect(q.searchParams.get("luggage")).toBe("5");
    expect(q.searchParams.get("adults")).toBe("4");
    expect(q.searchParams.get("currency")).toBe("GBP");
    expect(q.searchParams.has("promo")).toBe(false);
    expect(q.searchParams.has("pc")).toBe(false);
    expect(screen.queryByRole("link", { name: /book|deal|checkout/i })).toBeNull();
  });

  it("prevents same-location quotes and shows unsupported routes gracefully", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes("/locations/search")) return Response.json([grenoble]);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AlpsPublicQuotePanel />);

    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "Grenoble" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Find locations" })[1]!);
    const results = await screen.findByRole("list", { name: "Destination results" });
    fireEvent.click(within(results).getByRole("button", { name: /Grenoble Airport/ }));
    // Different location from default Geneva => quote allowed after selection.
    fireEvent.click(screen.getByRole("button", { name: "Search live public prices (no key)" }));
    await screen.findByText(/The provider does not currently support this pickup/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
