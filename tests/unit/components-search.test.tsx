import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/search" }));

import { FilterForm } from "@/components/search/filter-form";
import { Pagination } from "@/components/search/pagination";
import { ResultsExplorer } from "@/components/search/results-explorer";
import { MapView } from "@/components/map/map-view";
import { LocationPicker } from "@/components/map/location-picker";
import { parseSearchParams } from "@/lib/validation/search";
import type { SearchRow } from "@/lib/types";

const card = (id: string, title: string): SearchRow => ({
  id, title, locality: "Madhapur", city: "Hyderabad", vehicle_types: ["car"], cover_type: "open", rental_type: "daily", price_inr: "100", min_duration: 1, deposit_inr: "0",
  available_days: [1], available_from: null, available_to: null, access_24h: true, overnight_allowed: false, latitude: 17.45, longitude: 78.39, location_privacy: "approximate",
  is_demo: false, created_at: "2026-01-01T00:00:00Z", cover_photo_path: null, is_open_now: false, distance_km: null, total_count: 2,
});

let getCurrentPosition: ReturnType<typeof vi.fn>;
beforeEach(() => {
  getCurrentPosition = vi.fn();
  Object.defineProperty(globalThis.navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("FilterForm", () => {
  it("is a plain GET search form reflecting the current URL filters", () => {
    const filters = parseSearchParams({ q: "bay", vehicle: "car", rental: "monthly", cover: "covered", minPrice: "500", maxPrice: "4000", day: "3", openNow: "1", near: "Madhapur" });
    const { container } = render(<FilterForm filters={filters} />);
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/search");
    expect(screen.getByLabelText(/Locality or listing title/)).toHaveValue("bay");
    expect(screen.getByLabelText("Near area (destination)")).toHaveValue("Madhapur");
    expect(screen.getByLabelText("Vehicle type")).toHaveValue("car");
    expect(screen.getByLabelText("Rental type")).toHaveValue("monthly");
    expect(screen.getByLabelText("Covered / open")).toHaveValue("covered");
    expect(screen.getByLabelText("Available on")).toHaveValue("3");
    expect(screen.getByLabelText("Min price (₹)")).toHaveValue(500);
    expect(screen.getByLabelText("Max price (₹)")).toHaveValue(4000);
    expect(screen.getByLabelText(/Available right now/)).toBeChecked();
    expect(screen.getByLabelText(/Overnight parking allowed/)).not.toBeChecked();
  });

  it("never asks for the browser location until the user presses the button", async () => {
    render(<FilterForm filters={parseSearchParams({})} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByText(/only requested when you press the button/)).toBeInTheDocument();
  });

  it("requests location on explicit click and fills coordinates when inside Hyderabad", async () => {
    getCurrentPosition.mockImplementation((ok: PositionCallback) => ok({ coords: { latitude: 17.4435, longitude: 78.3772 } } as GeolocationPosition));
    const user = userEvent.setup();
    render(<FilterForm filters={parseSearchParams({})} />);
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Latitude")).toHaveValue("17.44350");
    expect(screen.getByLabelText("Longitude")).toHaveValue("78.37720");
    expect(screen.getByText(/this search only/)).toBeInTheDocument();
  });

  it("explains denial and out-of-area positions without filling anything", async () => {
    const user = userEvent.setup();
    getCurrentPosition.mockImplementationOnce((_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    render(<FilterForm filters={parseSearchParams({})} />);
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText(/permission was denied/)).toBeInTheDocument();
    getCurrentPosition.mockImplementationOnce((ok: PositionCallback) => ok({ coords: { latitude: 51.5, longitude: -0.12 } } as GeolocationPosition));
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByText(/outside Hyderabad/)).toBeInTheDocument();
    expect(screen.getByLabelText("Latitude")).toHaveValue("");
  });
});

describe("Pagination", () => {
  const href = (p: number) => `/search?page=${p}`;
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} totalPages={1} hrefFor={href} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("marks the current page, disables Previous on page 1 and links the rest", () => {
    render(<Pagination page={1} totalPages={5} hrefFor={href} />);
    expect(screen.getByLabelText("Page 1")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Page 3")).toHaveAttribute("href", "/search?page=3");
    expect(screen.getByText("← Previous")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Next →" })).toHaveAttribute("href", "/search?page=2");
  });
  it("disables Next on the last page", () => {
    render(<Pagination page={5} totalPages={5} hrefFor={href} />);
    expect(screen.getByText("Next →")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "← Previous" })).toHaveAttribute("href", "/search?page=4");
  });
});

describe("maps without an API key", () => {
  it("MapView shows a clear message instead of crashing", () => {
    render(<MapView markers={[]} ariaLabel="map" />);
    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
    expect(screen.getByText(/NEXT_PUBLIC_MAPBOX_TOKEN/)).toBeInTheDocument();
  });
  it("LocationPicker falls back to manual coordinates", () => {
    render(<LocationPicker lat={null} lng={null} onChange={vi.fn()} />);
    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Enter the latitude and longitude below/)).toBeInTheDocument();
  });
});

describe("ResultsExplorer", () => {
  const items = [card("a", "Alpha bay"), card("b", "Bravo bay")];
  it("list view shows only cards (no map)", () => {
    render(<ResultsExplorer items={items} view="list" destination={null} />);
    expect(screen.getAllByTestId("listing-card")).toHaveLength(2);
    expect(screen.queryByText("Map unavailable")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show on map" })).not.toBeInTheDocument();
  });
  it("map view synchronises selection between list and map and survives a missing map key", async () => {
    const user = userEvent.setup();
    render(<ResultsExplorer items={items} view="map" destination={null} />);
    expect(screen.getByText("Map unavailable")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Show on map" });
    await user.click(buttons[1]!);
    const cards = screen.getAllByTestId("listing-card");
    expect(cards[1]).toHaveAttribute("aria-current", "true");
    expect(cards[0]).not.toHaveAttribute("aria-current");
    await user.hover(cards[0]!);
    expect(cards[0]).toHaveAttribute("aria-current", "true");
  });
});
