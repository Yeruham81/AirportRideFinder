/**
 * Precise money handling. Amounts are integers in the currency's minor unit
 * (e.g. cents for USD, whole yen for JPY, fils for KWD). Never use floats for
 * arithmetic or comparison.
 */

/** ISO 4217 minor-unit exponents for currencies we know about. */
const MINOR_UNITS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CHF: 2,
  CAD: 2,
  AUD: 2,
  AED: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export interface Money {
  /** ISO 4217 currency code, e.g. "USD". */
  readonly currency: string;
  /** Integer amount in minor units. */
  readonly minor: number;
}

export function minorUnitsFor(currency: string): number {
  const digits = MINOR_UNITS[currency];
  if (digits === undefined) throw new Error(`Unsupported currency: ${currency}`);
  return digits;
}

export function isSupportedCurrency(currency: string): boolean {
  return currency in MINOR_UNITS;
}

/** Build Money from a decimal string ("42", "42.5", "12.345") without float math. */
export function moneyFromDecimal(currency: string, decimal: string): Money {
  const digits = minorUnitsFor(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
  if (!match) throw new Error(`Invalid decimal amount: ${decimal}`);
  const [, whole, frac = ""] = match;
  if (frac.length > digits) {
    throw new Error(`${currency} supports ${digits} decimal places, got "${decimal}"`);
  }
  const minor = Number(whole + frac.padEnd(digits, "0"));
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${decimal}`);
  return { currency, minor };
}

/** Decimal string for a Money value, e.g. { USD, 4250 } -> "42.50". */
export function toDecimalString(m: Money): string {
  const digits = minorUnitsFor(m.currency);
  if (digits === 0) return String(m.minor);
  const s = String(Math.abs(m.minor)).padStart(digits + 1, "0");
  const sign = m.minor < 0 ? "-" : "";
  return `${sign}${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

/** Compare two amounts. Throws when currencies differ: never rank across currencies. */
export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot compare ${a.currency} with ${b.currency}`);
  }
  return a.minor - b.minor;
}

/**
 * Locale-aware display. Whole amounts are shown without decimals ("$42");
 * otherwise the currency's own precision is used ("$42.50", "KWD 12.345").
 */
export function formatMoney(m: Money, locale = "en-US"): string {
  const digits = minorUnitsFor(m.currency);
  const whole = m.minor % 10 ** digits === 0;
  const fractionDigits = whole ? 0 : digits;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  // Intl accepts decimal strings, avoiding float conversion.
  return formatter.format(toDecimalString(m) as unknown as number);
}

export function currencySymbol(currency: string, locale = "en-US"): string {
  const part = new Intl.NumberFormat(locale, { style: "currency", currency })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}
