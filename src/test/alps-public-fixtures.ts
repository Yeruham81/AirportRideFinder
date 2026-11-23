import {
  buildAlpsPublicQuoteUrl, type AlpsBagMode, type AlpsPublicQuoteQuery,
} from "@/providers/alps2alps/public-quote";

export const alpsQuery: AlpsPublicQuoteQuery = {
  from: "airport-1", to: "resort-11", date: "2031-01-16", time: "14:30",
  passengers: 2, children: 1, infants: 1, childSeats: 1, boosters: 1,
  luggage: 2, skiBags: 2, currency: "EUR",
};

export function alpsResponse(query = alpsQuery, mode: AlpsBagMode = "winter", discovery = false) {
  const params = new URL(buildAlpsPublicQuoteUrl(query, discovery ? undefined : mode)).searchParams;
  const prefix = "https://booking.alps2alps.com/booking/";
  const skiBags = mode === "winter" ? (discovery ? 2 : query.skiBags + query.luggage) : 0;
  return {
    currency: query.currency,
    route: { from_code: query.from, to_code: query.to, from: "Geneva Airport", to: "Chamonix" },
    passengers: { adults: query.passengers, children: query.children ?? 0,
      infants: query.infants ?? 0, child_seats: query.childSeats ?? 0, boosters: query.boosters ?? 0 },
    quote_url: `${prefix}quick-search?${params}`,
    outbound: {
      pick_up_date_time: `${query.date} ${query.time}:00`,
      luggage: { normal_suitcases: mode === "summer" ? (discovery ? 2 : query.luggage) : 0,
        ski_bags: skiBags, ski_equipment: skiBags > 0 ? 1 : 0 },
      vehicles: [{ vehicle_type_id: 10, name: "Standard minivan", price: 272.49,
        max_passengers: 8, max_luggage: 8, offer_code: "requested",
        booking_url: `${prefix}quick-checkout?${params}&vehicle=10` }],
    },
    return: null,
    promo_code: "AIRPORTRIDEFINDER", promo_code_applied: true,
    promo_code_discount: { type: "percentage", value: 5 },
  };
}

export function alpsResponseForUrl(url: string, mode: AlpsBagMode = "winter") {
  const params = new URL(url).searchParams;
  const query: AlpsPublicQuoteQuery = {
    from: params.get("from")!, to: params.get("to")!, date: params.get("date")!, time: params.get("time")!,
    passengers: Number(params.get("adults")), children: Number(params.get("children")),
    infants: Number(params.get("infants")), childSeats: Number(params.get("child_seats")),
    boosters: Number(params.get("boosters")), luggage: Number(params.get("luggage")),
    skiBags: Number(params.get("ski_bags")), currency: params.get("currency") as "EUR",
  };
  if (mode === "winter") query.luggage = 0; // ski_bags already contains the total.
  return alpsResponse(query, mode, !params.has("luggage"));
}
