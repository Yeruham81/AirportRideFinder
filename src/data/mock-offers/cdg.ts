import type { RawMockOffer } from "./types";

/** Paris CDG → Central Paris. Sample data, EUR. */
export const CDG_OFFERS: RawMockOffer[] = [
  { providerId: "aeroride", ref: "AR-CDG-STD", pickupRef: "cdg_airport", dropoffRef: "paris_center", vehicleLabel: "Sedan · Standard", maxPassengers: 3, maxLuggage: 3, price: "49", currency: "EUR", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: null, waitingTimeMins: 45 },
  { providerId: "skyshuttle", ref: "SS-CDG-SED", pickupRef: "SKY-CDG", dropoffRef: "SKY-PAR-C", vehicleLabel: "Saloon (Standard)", maxPassengers: 3, maxLuggage: 2, price: "55", currency: "EUR", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: true, waitingTimeMins: 60 },
  { providerId: "blueterminal", ref: "BT-CDG-CS", pickupRef: "3305", dropoffRef: "3390", vehicleLabel: "Classic sedan", maxPassengers: 3, maxLuggage: 2, price: "58", currency: "EUR", taxes: "unknown", cancellation: { kind: "unknown" }, meetAndGreet: null, waitingTimeMins: null },
  { providerId: "transfernest", ref: "TN-CDG-PC", pickupRef: "FR-PAR-CDG", dropoffRef: "FR-PAR-CTR", vehicleLabel: "Private car", maxPassengers: 3, maxLuggage: 2, price: "62", currency: "EUR", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 48 }, meetAndGreet: true, waitingTimeMins: null },
  { providerId: "transfernest", ref: "TN-CDG-FV", pickupRef: "FR-PAR-CDG", dropoffRef: "FR-PAR-CTR", vehicleLabel: "Family van", maxPassengers: 7, maxLuggage: 7, price: "79", currency: "EUR", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: true, waitingTimeMins: null },
  { providerId: "skyshuttle", ref: "SS-CDG-MPV", pickupRef: "SKY-CDG", dropoffRef: "SKY-PAR-C", vehicleLabel: "People carrier", maxPassengers: 6, maxLuggage: 6, price: "84", currency: "EUR", taxes: "included", cancellation: { kind: "with_fee", feeDescription: "€20 fee within 24h" }, meetAndGreet: true, waitingTimeMins: 60 },
  { providerId: "blueterminal", ref: "BT-CDG-BUS", pickupRef: "3305", dropoffRef: "3390", vehicleLabel: "Group shuttle bus", maxPassengers: 8, maxLuggage: 8, price: "129", currency: "EUR", taxes: "included", cancellation: { kind: "non_refundable" }, meetAndGreet: null, waitingTimeMins: null },
];
