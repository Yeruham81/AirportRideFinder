import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { TransferiseLocationAutocomplete } from "@/components/transferise/TransferiseLocationAutocomplete";
import type { TransferisePlaceSuggestions, TransferiseSelectablePlace } from "@/providers/transferise/locations";

const airport: TransferiseSelectablePlace = {
  id: "airport:1", name: "Antalya Airport", label: "Antalya Airport (AYT)", kind: "airport",
  country: "Türkiye", iata: "AYT", timeZone: "Europe/Istanbul", searchQuery: "Antalya",
};
const kemer: TransferiseSelectablePlace = { ...airport, id: "destination:799", name: "Kemer", label: "Kemer, Antalya", kind: "destination", iata: null, searchQuery: "Kemer" };
function Harness({ search }: { search: (query: string) => Promise<TransferisePlaceSuggestions> }) {
  const [selected, setSelected] = useState<TransferiseSelectablePlace | null>(null);
  return <><TransferiseLocationAutocomplete label="Pickup" search={search} selected={selected} onSelected={setSelected} />
    <output data-testid="selection">{selected?.id ?? "none"}</output><button disabled={!selected}>Search price</button></>;
}
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(400); }); }

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Transferise autocomplete selection", () => {
  it("suggests while typing after two characters, requires selection, and clears selection on any edit", async () => {
    const search = vi.fn<(query: string) => Promise<TransferisePlaceSuggestions>>().mockResolvedValue({ kind: "ok", places: [airport] });
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox", { name: "Pickup" });
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "A" } }); await tick();
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Search price" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Ant" } });
    expect(search).not.toHaveBeenCalled(); await tick();
    expect(search).toHaveBeenCalledWith("Ant");
    expect(screen.getByRole("option", { name: /Antalya Airport/ })).toBeInTheDocument();
    expect(screen.getByTestId("selection")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("option", { name: /Antalya Airport/ }));
    expect(screen.getByTestId("selection")).toHaveTextContent("airport:1");
    expect(screen.getByRole("button", { name: "Search price" })).toBeEnabled();
    fireEvent.change(input, { target: { value: "Antalya edited" } });
    expect(screen.getByTestId("selection")).toHaveTextContent("none");
    expect(screen.getByRole("button", { name: "Search price" })).toBeDisabled();
  });

  it("supports keyboard selection and leaves arbitrary text unselected", async () => {
    const search = vi.fn<(query: string) => Promise<TransferisePlaceSuggestions>>().mockResolvedValue({ kind: "ok", places: [airport] });
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "Antalya" } }); await tick();
    fireEvent.keyDown(input, { key: "ArrowDown" }); fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("selection")).toHaveTextContent("airport:1");
    fireEvent.change(input, { target: { value: "A place I invented" } });
    fireEvent.keyDown(input, { key: "Escape" }); fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("selection")).toHaveTextContent("none");
    expect(screen.getByRole("button", { name: "Search price" })).toBeDisabled();
  });

  it("ignores a late response for an old query instead of replacing current suggestions", async () => {
    let finishOld!: (result: TransferisePlaceSuggestions) => void;
    const old = new Promise<TransferisePlaceSuggestions>((resolve) => { finishOld = resolve; });
    const search = vi.fn<(query: string) => Promise<TransferisePlaceSuggestions>>()
      .mockReturnValueOnce(old).mockResolvedValueOnce({ kind: "ok", places: [kemer] });
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox"); fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Antalya" } }); await tick();
    fireEvent.change(input, { target: { value: "Kemer" } }); await tick();
    expect(screen.getByRole("option", { name: /Kemer/ })).toBeInTheDocument();
    await act(async () => { finishOld({ kind: "ok", places: [airport] }); await Promise.resolve(); });
    expect(screen.queryByRole("option", { name: /Antalya Airport/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Kemer/ })).toBeInTheDocument();
  });

  it("does not manufacture selectable results when the provider returns no locations", async () => {
    const search = vi.fn<(query: string) => Promise<TransferisePlaceSuggestions>>().mockResolvedValue({ kind: "ok", places: [] });
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox"); fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzzzzz" } }); await tick();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("No matching locations returned by Transferise.")).toBeInTheDocument();
    expect(screen.getByTestId("selection")).toHaveTextContent("none");
  });

  it("asks for more text for an empty RI search and preserves verified Rixos records when shortening RIX", async () => {
    const rixos: TransferiseSelectablePlace = {
      ...airport, id: "hotel:811", name: "Rixos Downtown Antalya Hotel", label: "Rixos Downtown Antalya Hotel",
      kind: "hotel", iata: null, searchQuery: "RIX",
    };
    const search = vi.fn<(query: string) => Promise<TransferisePlaceSuggestions>>()
      .mockResolvedValueOnce({ kind: "ok", places: [] })
      .mockResolvedValueOnce({ kind: "ok", places: [rixos] });
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox"); fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "RI" } });
    expect(screen.queryByText("No matching locations returned by Transferise.")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByText("No suggestions yet. Keep typing the location name.")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "RIX" } }); await tick();
    expect(screen.getByRole("option", { name: /Rixos Downtown/ })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "RI" } }); await tick();
    expect(screen.getByRole("option", { name: /Rixos Downtown/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("selection")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("option", { name: /Rixos Downtown/ }));
    expect(screen.getByTestId("selection")).toHaveTextContent("hotel:811");
  });

  it("shows the safe provider error when a short-prefix query is explicitly rejected", async () => {
    const search = vi.fn<(query: string) => Promise<TransferisePlaceSuggestions>>()
      .mockResolvedValue({ kind: "error", code: "api_rejected", httpStatus: 400, providerCode: "q_too_short" });
    render(<Harness search={search} />);
    const input = screen.getByRole("combobox"); fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "RI" } }); await tick();
    const status = screen.getByText(/Keep typing. Transferise needs a longer search/);
    expect(status).toHaveTextContent("HTTP 400");
    expect(status).toHaveTextContent("q_too_short");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});

