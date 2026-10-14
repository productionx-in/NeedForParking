/**
 * Approximate centre points of common Hyderabad localities, used ONLY to pre-position the map and to
 * rank search results by distance from a chosen area. They are rough (±1 km) and are not authoritative.
 */
export type Locality = { name: string; lat: number; lng: number };

export const HYDERABAD_LOCALITIES: readonly Locality[] = [
  { name: "Abids", lat: 17.392, lng: 78.474 },
  { name: "Ameerpet", lat: 17.4375, lng: 78.4483 },
  { name: "Attapur", lat: 17.368, lng: 78.426 },
  { name: "Banjara Hills", lat: 17.4156, lng: 78.4347 },
  { name: "Begumpet", lat: 17.4399, lng: 78.4638 },
  { name: "Dilsukhnagar", lat: 17.3688, lng: 78.5247 },
  { name: "Financial District", lat: 17.4172, lng: 78.3433 },
  { name: "Gachibowli", lat: 17.4401, lng: 78.3489 },
  { name: "Himayatnagar", lat: 17.4046, lng: 78.4824 },
  { name: "HITEC City", lat: 17.4435, lng: 78.3772 },
  { name: "Jubilee Hills", lat: 17.4325, lng: 78.4071 },
  { name: "Kokapet", lat: 17.3918, lng: 78.33 },
  { name: "Kondapur", lat: 17.46, lng: 78.365 },
  { name: "Koti", lat: 17.385, lng: 78.4867 },
  { name: "KPHB Colony", lat: 17.4849, lng: 78.3913 },
  { name: "Kukatpally", lat: 17.4948, lng: 78.3996 },
  { name: "LB Nagar", lat: 17.3457, lng: 78.5522 },
  { name: "Madhapur", lat: 17.4486, lng: 78.3908 },
  { name: "Malkajgiri", lat: 17.45, lng: 78.526 },
  { name: "Manikonda", lat: 17.4034, lng: 78.3871 },
  { name: "Mehdipatnam", lat: 17.395, lng: 78.44 },
  { name: "Miyapur", lat: 17.4967, lng: 78.356 },
  { name: "Nampally", lat: 17.3919, lng: 78.4666 },
  { name: "Nanakramguda", lat: 17.4177, lng: 78.343 },
  { name: "Secunderabad", lat: 17.4399, lng: 78.4983 },
  { name: "Somajiguda", lat: 17.4239, lng: 78.4573 },
  { name: "SR Nagar", lat: 17.44, lng: 78.44 },
  { name: "Tolichowki", lat: 17.4, lng: 78.417 },
  { name: "Uppal", lat: 17.4058, lng: 78.5591 },
];

export function findLocality(name: string | null | undefined): Locality | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return HYDERABAD_LOCALITIES.find((l) => l.name.toLowerCase() === n);
}
