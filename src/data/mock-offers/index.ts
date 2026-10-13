import { CDG_OFFERS } from "./cdg";
import { JFK_OFFERS } from "./jfk";
import { LHR_OFFERS } from "./lhr";
import type { RawMockOffer } from "./types";

export type { RawMockOffer } from "./types";

/** All sample offers. Used only by mock adapters — never by live integrations. */
export const MOCK_OFFERS: RawMockOffer[] = [...LHR_OFFERS, ...JFK_OFFERS, ...CDG_OFFERS];
