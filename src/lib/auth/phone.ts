import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/mobile";

export const DEFAULT_COUNTRY: CountryCode = "IN";

export type CountryOption = { code: CountryCode; name: string; dial: string };

/** All countries, India first, then alphabetical. */
export function getCountryOptions(locale = "en"): CountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  const list = getCountries().map((code) => ({
    code,
    name: names?.of(code) ?? code,
    dial: `+${getCountryCallingCode(code)}`,
  }));
  list.sort((a, b) => (a.code === DEFAULT_COUNTRY ? -1 : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name)));
  return list;
}

export type PhoneParseResult = { ok: true; e164: string; country: CountryCode } | { ok: false; error: string };

/** Validates a national number for the chosen country and returns E.164 (e.g. +919876543210). */
export function parsePhone(country: string, input: string): PhoneParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter your mobile number." };
  if (!/^[0-9+()\-\s.]+$/.test(raw)) return { ok: false, error: "Mobile numbers can only contain digits." };
  if (!getCountries().includes(country as CountryCode)) return { ok: false, error: "Choose a valid country." };
  const parsed = parsePhoneNumberFromString(raw, country as CountryCode);
  if (!parsed || !parsed.isValid()) return { ok: false, error: "That mobile number doesn't look valid for the selected country." };
  const type = parsed.getType();
  if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") {
    return { ok: false, error: "Enter a mobile number that can receive SMS." };
  }
  return { ok: true, e164: parsed.number, country: (parsed.country ?? country) as CountryCode };
}

/** +91 ••••• •3210 — never show a full number in UI or logs. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "Not set";
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  return `+${digits.slice(0, digits.length - 10 > 0 ? digits.length - 10 : 2)} ••••• •${digits.slice(-4)}`;
}
