import type { RawMockOffer } from "./types";

/** London Heathrow → Central London. Sample data, USD. */
export const LHR_OFFERS: RawMockOffer[] = [
  { providerId: "skyshuttle", ref: "SS-LHR-SED", pickupRef: "SKY-LHR", dropoffRef: "SKY-LON-C", vehicleLabel: "Saloon (Standard)", maxPassengers: 3, maxLuggage: 2, price: "42", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: true, waitingTimeMins: 60 },
  { providerId: "aeroride", ref: "AR-LHR-STD", pickupRef: "lhr_airport", dropoffRef: "london_center", vehicleLabel: "Sedan · Standard", maxPassengers: 3, maxLuggage: 2, price: "47", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 48 }, meetAndGreet: null, waitingTimeMins: 45 },
  { providerId: "transfernest", ref: "TN-LHR-PC", pickupRef: "GB-LON-LHR", dropoffRef: "GB-LON-CTR", vehicleLabel: "Private car", maxPassengers: 3, maxLuggage: 2, price: "51", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: true, waitingTimeMins: null },
  { providerId: "blueterminal", ref: "BT-LHR-CS", pickupRef: "4471", dropoffRef: "9012", vehicleLabel: "Classic sedan", maxPassengers: 3, maxLuggage: 2, price: "58", currency: "USD", taxes: "unknown", cancellation: { kind: "non_refundable" }, meetAndGreet: null, waitingTimeMins: null },
  // Other vehicle types
  { providerId: "aeroride", ref: "AR-LHR-ECO", pickupRef: "lhr_airport", dropoffRef: "london_center", vehicleLabel: "Economy car", maxPassengers: 3, maxLuggage: 1, price: "36", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: null, waitingTimeMins: 30 },
  { providerId: "skyshuttle", ref: "SS-LHR-MPV", pickupRef: "SKY-LHR", dropoffRef: "SKY-LON-C", vehicleLabel: "People carrier", maxPassengers: 6, maxLuggage: 6, price: "68", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: true, waitingTimeMins: 60 },
  { providerId: "transfernest", ref: "TN-LHR-FV", pickupRef: "GB-LON-LHR", dropoffRef: "GB-LON-CTR", vehicleLabel: "Family van", maxPassengers: 7, maxLuggage: 7, price: "74", currency: "USD", taxes: "included", cancellation: { kind: "with_fee", feeDescription: "25% fee within 24h of pickup" }, meetAndGreet: true, waitingTimeMins: null },
  { providerId: "blueterminal", ref: "BT-LHR-BUS", pickupRef: "4471", dropoffRef: "9012", vehicleLabel: "Business class sedan", maxPassengers: 3, maxLuggage: 2, price: "89", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: true, waitingTimeMins: 60 },
];
