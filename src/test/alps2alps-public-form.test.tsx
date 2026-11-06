import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AlpsPublicQuotePanel } from "@/components/alps/AlpsPublicQuotePanel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const routes = [
  { station: "airport-1", station_name: "Geneva Airport", resort: "resort-11", resort_name: "Chamonix", is_active: 1 },
  { station: "airport-2", station_name: "Grenoble Airport", resort: "resort-168", resort_name: "Ischgl", is_active: 1 },
  { station: "airport-9", station_name: "Disused Airport", resort: "resort-9", resort_name: "Unused Resort", is_active: 0 },
];

function quoteResponse(url: string, skiBagOverride?: number) {
  const params = new URL(url).searchParams;
  return {
    currency: params.get("currency"),
    route: {
      from_code: params.get("from"), to_code: params.get("to"),
      from: params.get("from") === "airport-1" ? "Geneva Airport" : "Grenoble Airport",
      to: params.get("to") === "resort-11" ? "Chamonix" : "Ischgl",
    },
    passengers: { adults: Number(params.get("adults")) },
    outbound: {
      pick_up_date_time: `${params.get("date")} ${params.get("time")}:00`,
      luggage: {
        normal_suitcases: Number(params.get("luggage")),
        ski_bags: skiBagOverride ?? Number(params.get("ski_bags")),
      },
      vehicles: [
        { vehicle_type_id: 4, name: "Alpine XL van", price: 241.5,
          max_passengers: 8, max_luggage: 8, offer_code: "requested",
          booking_url: "https://booking.alps2alps.com/book/quick-checkout?from=airport-2&to=resort-168&date=2031-01-20&time=10%3A15&vehicle=4" },
      ],
    },
  };
}

function catalogFetchMock(quoteHandler: (url: string) => Promise<Response>) {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/api/resource/routes") return Response.json(routes);
    if (url.pathname.endsWith("/transfer-options")) return quoteHandler(input);
    throw new Error("Unexpected endpoint " + url.pathname);
  });
}

describe("Alps2Alps private instant location typeahead and quote form", () => {
  it("preloads only one route catalog, suggests by first letter, supports keyboard selection and avoids extra lookup calls", async () => {
    const fetchMock = catalogFetchMock(async url => Response.json(quoteResponse(url)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AlpsPublicQuotePanel />);

    await screen.findByText(/2 active supplier routes loaded/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Find locations/i })).toBeNull();

    const origin = screen.getByRole("combobox", { name: "Pickup location" });
    fireEvent.change(origin, { target: { value: "G" } }); // One letter, local supplier catalog only.
    const originMatches = screen.getByRole("listbox", { name: "Pickup location suggestions" });
    expect(within(originMatches).getByRole("option", { name: /Grenoble Airport/ })).toBeTruthy();
    expect(within(originMatches).queryByRole("option", { name: /Disused Airport/ })).toBeNull();
    fireEvent.click(within(originMatches).getByRole("option", { name: /Grenoble Airport/ }));

    // The previously selected Chamonix is not served by Grenoble in the
    // active supplier catalog; clear it and ask for a compatible destination.
    const destination = screen.getByRole("combobox", { name: "Destination" });
    expect((destination as HTMLInputElement).value).toBe("");
    fireEvent.change(destination, { target: { value: "I" } });
    const destMatches = screen.getByRole("listbox", { name: "Destination suggestions" });
    expect(within(destMatches).getByRole("option", { name: /Ischgl/ })).toBeTruthy();
    fireEvent.keyDown(destination, { key: "ArrowDown" });
    fireEvent.keyDown(destination, { key: "Enter" });
    expect((destination as HTMLInputElement).value).toBe("Ischgl");

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
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Search live public prices (no key)" }));
    await screen.findByText("Public quote API connection successful.");
    expect(screen.getByText("Alpine XL van")).toBeTruthy();
    expect(screen.getByText("£241.50")).toBeTruthy();

    const requests = fetchMock.mock.calls.map(([url]) => new URL(url));
    expect(requests).toHaveLength(2);
    expect(requests.filter(url => url.pathname.includes("locations/search"))).toHaveLength(0);
    const q = requests[1]!;
    expect(q.pathname).toBe("/api/public/v1/transfer-options");
    expect(Object.fromEntries(["from", "to", "date", "time", "adults", "luggage", "ski_bags", "currency"]
      .map(k => [k, q.searchParams.get(k)]))).toEqual({
      from: "airport-2", to: "resort-168", date: "2031-01-20",
      time: "10:15", adults: "4", luggage: "5", ski_bags: "2", currency: "GBP",
    });
    expect(q.searchParams.has("promo")).toBe(false);
    expect(q.searchParams.has("pc")).toBe(false);
    expect(screen.queryByRole("link", { name: /book|deal|checkout/i })).toBeNull();
  });

  it("limits destination suggestions to active supplier routes and shows unsupported quotes", async () => {
    const fetchMock = catalogFetchMock(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AlpsPublicQuotePanel />);
    await screen.findByText(/2 active supplier routes loaded/);

    const origin = screen.getByRole("combobox", { name: "Pickup location" });
    fireEvent.change(origin, { target: { value: "Gr" } });
    fireEvent.click(within(screen.getByRole("listbox", { name: "Pickup location suggestions" }))
      .getByRole("option", { name: /Grenoble Airport/ }));

    const destination = screen.getByRole("combobox", { name: "Destination" });
    fireEvent.change(destination, { target: { value: "Ch" } });
    expect(screen.queryByRole("option", { name: /Chamonix/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Search live public prices (no key)" })).toBeDisabled();

    fireEvent.change(destination, { target: { value: "Is" } });
    fireEvent.click(within(screen.getByRole("listbox", { name: "Destination suggestions" }))
      .getByRole("option", { name: /Ischgl/ }));
    fireEvent.click(screen.getByRole("button", { name: "Search live public prices (no key)" }));
    await screen.findByText(/provider does not currently support this pickup/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("automatically changes 3 unquoted ski bags to 0, shows prices immediately and warns clearly", async () => {
    const fetchMock = catalogFetchMock(async url => Response.json(quoteResponse(
      url, new URL(url).searchParams.get("ski_bags") === "3" ? 0 : undefined,
    )));
    vi.stubGlobal("fetch", fetchMock);
    render(<AlpsPublicQuotePanel />);
    await screen.findByText(/2 active supplier routes loaded/);
    fireEvent.change(screen.getByLabelText("Pickup date (Alpine local)"), {
      target: { value: "2027-07-22" },
    });
    fireEvent.change(screen.getByLabelText("Adults"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Suitcases"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Ski / snowboard bags"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search live public prices (no key)" }));

    await screen.findByText("Public quote API connection successful.");
    expect(screen.getByText("Alpine XL van")).toBeTruthy();
    const note = screen.getByRole("alert");
    expect(note.textContent).toContain("You requested 3 ski/snowboard bags");
    expect(note.textContent).toContain("Prices below are for 0 ski bags only");
    expect(note.textContent).toContain("confirm acceptance and any additional charges");
    expect((screen.getByLabelText("Ski / snowboard bags") as HTMLSelectElement).value).toBe("0");
    expect(screen.getByText(/3 suitcases and 0 ski bags/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change ski bags to 0" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // One catalog and ONE quote; no second price search.
    const quoteUrl = new URL(fetchMock.mock.calls[1]![0]);
    expect(quoteUrl.searchParams.get("ski_bags")).toBe("3");
    expect(quoteUrl.searchParams.get("luggage")).toBe("3");
    expect(quoteUrl.searchParams.get("adults")).toBe("3");
    expect(screen.queryByRole("link", { name: /book|deal|checkout/i })).toBeNull();
  });
});
