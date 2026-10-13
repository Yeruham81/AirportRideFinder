import type { RawMockOffer } from "./types";

/**
 * New York JFK → Manhattan. Sample data, USD.
 * TransferNest intentionally has no offers here (a successful empty reply).
 */
export const JFK_OFFERS: RawMockOffer[] = [
  { providerId: "aeroride", ref: "AR-JFK-STD", pickupRef: "jfk_airport", dropoffRef: "manhattan", vehicleLabel: "Sedan · Standard", maxPassengers: 3, maxLuggage: 3, price: "72", currency: "USD", taxes: "excluded", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: null, waitingTimeMins: 30 },
  { providerId: "skyshuttle", ref: "SS-JFK-SED", pickupRef: "SKY-JFK", dropoffRef: "SKY-NYC-M", vehicleLabel: "Saloon (Standard)", maxPassengers: 3, maxLuggage: 2, price: "78.50", currency: "USD", taxes: "included", cancellation: { kind: "free_until", hoursBefore: 48 }, meetAndGreet: true, waitingTimeMins: 60 },
  { providerId: "blueterminal", ref: "BT-JFK-CS", pickupRef: "1180", dropoffRef: "1202", vehicleLabel: "Classic sedan", maxPassengers: 3, maxLuggage: 2, price: "85", currency: "USD", taxes: "included", cancellation: { kind: "with_fee", feeDescription: "$15 fee if cancelled within 12h" }, meetAndGreet: null, waitingTimeMins: null },
  { providerId: "aeroride", ref: "AR-JFK-VAN", pickupRef: "jfk_airport", dropoffRef: "manhattan", vehicleLabel: "Van (up to 6)", maxPassengers: 6, maxLuggage: 5, price: "110", currency: "USD", taxes: "excluded", cancellation: { kind: "free_until", hoursBefore: 24 }, meetAndGreet: null, waitingTimeMins: 30 },
  { providerId: "blueterminal", ref: "BT-JFK-BUS", pickupRef: "1180", dropoffRef: "1202", vehicleLabel: "Group shuttle bus", maxPassengers: 12, maxLuggage: 12, price: "165", currency: "USD", taxes: "included", cancellation: { kind: "non_refundable" }, meetAndGreet: null, waitingTimeMins: null },
];
