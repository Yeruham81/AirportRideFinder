import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AlpsPublicQuotePanel } from "@/components/alps/AlpsPublicQuotePanel";
import { alpsResponseForUrl } from "./alps-public-fixtures";

const routes = [
  { station: "airport-1", station_name: "Geneva Airport", resort: "resort-11", resort_name: "Chamonix", is_active: 1 },
  { station: "airport-2", station_name: "Grenoble Airport", resort: "resort-168", resort_name: "Ischgl", is_active: 1 },
  { station: "airport-9", station_name: "Disused Airport", resort: "resort-9", resort_name: "Unused Resort", is_active: 0 },
];
const button = () => screen.getByRole("button", { name: "Search transfer prices" });
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function mockFetch(mode: "winter" | "summer" = "winter") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/api/resource/routes")) return Response.json(routes);
    return Response.json(alpsResponseForUrl(url, mode));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
async function mount() {
  render(<AlpsPublicQuotePanel />);
  await screen.findByText(/2 active supplier routes loaded/);
  change("Pickup date (Alpine local)", "2031-01-16");
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Alps2Alps quote and referral form", () => {
  it("retains instant, route-constrained suggestions and makes no price calls while typing", async () => {
    const fetchMock = mockFetch(); await mount();
    const origin = screen.getByRole("combobox", { name: "Pickup location" });
    fireEvent.change(origin, { target: { value: "G" } });
    const matches = screen.getByRole("listbox", { name: "Pickup location suggestions" });
    expect(within(matches).queryByRole("option", { name: /Disused Airport/ })).toBeNull();
    fireEvent.click(within(matches).getByRole("option", { name: /Grenoble Airport/ }));
    expect(button()).toBeDisabled();
    const destination = screen.getByRole("combobox", { name: "Destination" });
    fireEvent.change(destination, { target: { value: "Ch" } });
    expect(screen.queryByRole("option", { name: /Chamonix/ })).toBeNull();
    fireEvent.change(destination, { target: { value: "I" } });
    fireEvent.keyDown(destination, { key: "ArrowDown" });
    fireEvent.keyDown(destination, { key: "Enter" });
    expect((destination as HTMLInputElement).value).toBe("Ischgl");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("quotes everyone and all winter bags, displays the returned discount, and exposes the exact supplier URL", async () => {
    const fetchMock = mockFetch(); await mount();
    change("Children", "1"); change("Infants", "1"); change("Child seats", "1"); change("Boosters", "1");
    change("Suitcases", "2"); change("Ski / snowboard bags", "2");
    fireEvent.click(button());
    await screen.findByText("Current Alps2Alps prices.");
    const link = await screen.findByRole("link", { name: "Book with Alps2Alps" });
    expect(fetchMock).toHaveBeenCalledTimes(3); // Catalog + discovery + final basket.
    const final = fetchMock.mock.calls[2]![0];
    const params = new URL(final).searchParams;
    expect(params.get("ski_bags")).toBe("4");
    expect(params.get("children")).toBe("1");
    expect(params.get("infants")).toBe("1");
    expect(params.get("pc")).toBe("AIRPORTRIDEFINDER");
    expect(link.getAttribute("href")).toBe(alpsResponseForUrl(final).outbound.vehicles[0]!.booking_url);
    expect(screen.getByText("€272.49")).toBeTruthy();
    expect(screen.getByText(/Includes the supplier’s 5% partner discount/)).toBeTruthy();
    change("Suitcases", "3");
    expect(screen.queryByRole("link", { name: "Book with Alps2Alps" })).toBeNull();
    expect(screen.queryByText("€272.49")).toBeNull();
  });

  it("keeps both bag selectors and preserves ski requirements when the supplier returns summer", async () => {
    const fetchMock = mockFetch("summer"); await mount();
    expect(screen.getByLabelText("Suitcases")).toBeTruthy();
    expect(screen.getByLabelText("Ski / snowboard bags")).toBeTruthy();
    change("Ski / snowboard bags", "2");
    fireEvent.click(button());
    await screen.findByText(/Ski equipment requires confirmation/);
    expect((screen.getByLabelText("Ski / snowboard bags") as HTMLSelectElement).value).toBe("2");
    expect(screen.queryByRole("link", { name: "Book with Alps2Alps" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("expires displayed booking links after a minute without making automatic quote requests", async () => {
    const fetchMock = mockFetch(); await mount();
    fireEvent.click(button());
    await screen.findByRole("link", { name: "Book with Alps2Alps" });
    vi.useFakeTimers();
    // Re-submit while fake timers are active so the new expiry timer is controlled.
    fireEvent.click(button());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("link", { name: "Book with Alps2Alps" })).toBeTruthy();
    const count = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByRole("link", { name: "Book with Alps2Alps" })).toBeNull();
    expect(screen.getByText("Refresh prices to book")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });

  it("ignores an in-flight response after a search field changes", async () => {
    let release: ((response: Response) => void) | undefined;
    let requestUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/resource/routes")) return Response.json(routes);
      if (!new URL(url).searchParams.has("luggage")) return Response.json(alpsResponseForUrl(url));
      requestUrl = url;
      return new Promise<Response>(resolve => { release = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock); await mount();
    fireEvent.click(button());
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    change("Pickup time (local)", "11:00");
    await act(async () => { release!(Response.json(alpsResponseForUrl(requestUrl))); });
    // A changed input cannot resurrect a previous trip's prices or links.
    expect(screen.queryByText("€272.49")).toBeNull();
    expect(screen.queryByRole("link", { name: "Book with Alps2Alps" })).toBeNull();
  });
});
