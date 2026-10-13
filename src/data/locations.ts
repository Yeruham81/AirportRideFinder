import type { NormalizedLocation } from "@/domain/types";

/**
 * Demonstration locations. Each provider has its own identifier for the same
 * place (providerRefs) — the UI only ever uses our internal `id`.
 */
export const LOCATIONS: NormalizedLocation[] = [
  {
    id: "lhr",
    displayName: "London Heathrow Airport (LHR)",
    shortName: "Heathrow (LHR)",
    type: "airport",
    iata: "LHR",
    coords: { lat: 51.47, lng: -0.4543 },
    countryCode: "GB",
    locality: "London",
    timeZone: "Europe/London",
    providerRefs: { skyshuttle: "SKY-LHR", aeroride: "lhr_airport", transfernest: "GB-LON-LHR", blueterminal: "4471" },
  },
  {
    id: "central-london",
    displayName: "Central London",
    shortName: "Central London",
    type: "city",
    coords: { lat: 51.5115, lng: -0.1235 },
    countryCode: "GB",
    locality: "London",
    timeZone: "Europe/London",
    providerRefs: { skyshuttle: "SKY-LON-C", aeroride: "london_center", transfernest: "GB-LON-CTR", blueterminal: "9012" },
  },
  {
    id: "jfk",
    displayName: "New York JFK Airport (JFK)",
    shortName: "JFK Airport",
    type: "airport",
    iata: "JFK",
    coords: { lat: 40.6413, lng: -73.7781 },
    countryCode: "US",
    locality: "New York",
    timeZone: "America/New_York",
    providerRefs: { skyshuttle: "SKY-JFK", aeroride: "jfk_airport", transfernest: "US-NYC-JFK", blueterminal: "1180" },
  },
  {
    id: "manhattan",
    displayName: "Manhattan, New York",
    shortName: "Manhattan",
    type: "city",
    coords: { lat: 40.7831, lng: -73.9712 },
    countryCode: "US",
    locality: "New York",
    timeZone: "America/New_York",
    providerRefs: { skyshuttle: "SKY-NYC-M", aeroride: "manhattan", transfernest: "US-NYC-MAN", blueterminal: "1202" },
  },
  {
    id: "cdg",
    displayName: "Paris Charles de Gaulle Airport (CDG)",
    shortName: "Paris CDG",
    type: "airport",
    iata: "CDG",
    coords: { lat: 49.0097, lng: 2.5479 },
    countryCode: "FR",
    locality: "Paris",
    timeZone: "Europe/Paris",
    providerRefs: { skyshuttle: "SKY-CDG", aeroride: "cdg_airport", transfernest: "FR-PAR-CDG", blueterminal: "3305" },
  },
  {
    id: "central-paris",
    displayName: "Central Paris",
    shortName: "Central Paris",
    type: "city",
    coords: { lat: 48.8566, lng: 2.3522 },
    countryCode: "FR",
    locality: "Paris",
    timeZone: "Europe/Paris",
    providerRefs: { skyshuttle: "SKY-PAR-C", aeroride: "paris_center", transfernest: "FR-PAR-CTR", blueterminal: "3390" },
  },
];

export const LOCATION_BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));
export const getLocation = (id: string) => LOCATION_BY_ID.get(id) ?? null;

export interface DemoRoute {
  pickupId: string;
  dropoffId: string;
  /** Predefined sample currency for the whole route. */
  currency: string;
  label: string;
}

export const DEMO_ROUTES: DemoRoute[] = [
  { pickupId: "lhr", dropoffId: "central-london", currency: "USD", label: "London Heathrow → Central London" },
  { pickupId: "jfk", dropoffId: "manhattan", currency: "USD", label: "New York JFK → Manhattan" },
  { pickupId: "cdg", dropoffId: "central-paris", currency: "EUR", label: "Paris CDG → Central Paris" },
];

export function findDemoRoute(pickupId: string, dropoffId: string): DemoRoute | null {
  return DEMO_ROUTES.find((r) => r.pickupId === pickupId && r.dropoffId === dropoffId) ?? null;
}
