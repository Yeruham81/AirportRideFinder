import type { TransferProvider } from "@/domain/types";

/** Fictional demonstration providers. Replace names/brands freely later. */
export const PROVIDERS: TransferProvider[] = [
  { id: "skyshuttle", displayName: "SkyShuttle", brand: "sky", isFictional: true },
  { id: "aeroride", displayName: "AeroRide", brand: "aero", isFictional: true },
  { id: "transfernest", displayName: "TransferNest", brand: "nest", isFictional: true },
  { id: "blueterminal", displayName: "BlueTerminal", brand: "blue", isFictional: true },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
