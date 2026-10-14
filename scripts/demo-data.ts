/**
 * Fictional demo inventory for the OPTIONAL seed script.
 *
 * Everything here is made up: owners are not real people, addresses are placeholders (never a real
 * residence), and coordinates are small offsets around the approximate centre of each locality.
 * Availability values are sample data only and are not a claim that any space exists.
 */
import type { ListingFormValues } from "../src/lib/validation/listing";
import { EMPTY_LISTING_FORM } from "../src/lib/validation/listing";

export const DEMO_EMAIL_DOMAIN = "example.invalid"; // reserved TLD (RFC 2606): can never be a real mailbox
export const DEMO_EMAIL_PREFIX = "demo-owner-";
export const DEMO_TITLE_PREFIX = "[Demo] ";

export const DEMO_OWNERS = [
  { key: "a", displayName: "Demo Owner A" },
  { key: "b", displayName: "Demo Owner B" },
  { key: "c", displayName: "Demo Owner C" },
] as const;

export const demoEmail = (key: string) => `${DEMO_EMAIL_PREFIX}${key}@${DEMO_EMAIL_DOMAIN}`;

type DemoListing = { owner: (typeof DEMO_OWNERS)[number]["key"]; values: ListingFormValues };

const base = (v: Partial<ListingFormValues>): ListingFormValues => ({
  ...EMPTY_LISTING_FORM,
  city: "Hyderabad",
  locationPrivacy: "approximate",
  showAddressPublicly: false,
  ownerDeclaration: true,
  permissionStatus: "not_required",
  permissionNotes: "Fictional demo listing.",
  minDuration: "1",
  depositInr: "0",
  ...v,
});

const NOTE = " This is a fictional DEMO listing for previewing the product. It is not real inventory.";

export const DEMO_LISTINGS: DemoListing[] = [
  {
    owner: "a",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Covered car bay, Madhapur`,
      description: `Sample covered bay in a gated community near the main road, suitable for a hatchback or sedan.${NOTE}`,
      vehicleTypes: ["car"], coverType: "covered", locality: "Madhapur", postalCode: "500081",
      addressLine: "Demo address — not a real location (Madhapur)", latitude: "17.4492", longitude: "78.3915",
      rentalType: "monthly", priceInr: "3500", availableDays: [1, 2, 3, 4, 5, 6], access24h: true, overnightAllowed: true,
      securityFeatures: ["cctv", "gated", "security_guard"], accessInstructions: "Fictional: ask the demo security desk.",
    }),
  },
  {
    owner: "a",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Weekday office-hours slot, Kondapur`,
      description: `Sample open-air slot that is empty during office hours, ideal for a daily commuter.${NOTE}`,
      vehicleTypes: ["car", "motorcycle"], coverType: "open", locality: "Kondapur", postalCode: "500084",
      addressLine: "Demo address — not a real location (Kondapur)", latitude: "17.4608", longitude: "78.3661",
      rentalType: "daily", priceInr: "120", availableDays: [1, 2, 3, 4, 5], access24h: false, availableFrom: "08:00", availableTo: "19:00",
      securityFeatures: ["well_lit"], accessInstructions: "Fictional: call the demo number on arrival.",
    }),
  },
  {
    owner: "b",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Two-wheeler parking, Gachibowli`,
      description: `Sample covered two-wheeler stand with a shutter and CCTV.${NOTE}`,
      vehicleTypes: ["motorcycle"], coverType: "covered", locality: "Gachibowli", postalCode: "500032",
      addressLine: "Demo address — not a real location (Gachibowli)", latitude: "17.4412", longitude: "78.3501",
      rentalType: "monthly", priceInr: "600", availableDays: [0, 1, 2, 3, 4, 5, 6], access24h: true, overnightAllowed: true,
      maxHeightM: "1.8", securityFeatures: ["cctv", "gated"], accessInstructions: "Fictional: collect the demo key from the caretaker.",
    }),
  },
  {
    owner: "b",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Hourly bay near Ameerpet Metro`,
      description: `Sample hourly bay close to a metro station for short errands.${NOTE}`,
      vehicleTypes: ["car", "motorcycle"], coverType: "open", locality: "Ameerpet", postalCode: "500016",
      addressLine: "Demo address — not a real location (Ameerpet)", latitude: "17.4381", longitude: "78.4491",
      rentalType: "hourly", priceInr: "40", minDuration: "2", availableDays: [0, 1, 2, 3, 4, 5, 6], access24h: false, availableFrom: "07:00", availableTo: "22:00",
      securityFeatures: ["well_lit", "cctv"], accessInstructions: "Fictional: pay the demo attendant.",
    }),
  },
  {
    owner: "c",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Night parking for residents, HITEC City`,
      description: `Sample office-basement bay available overnight when the office is closed.${NOTE}`,
      vehicleTypes: ["car"], coverType: "covered", locality: "HITEC City", postalCode: "500081",
      addressLine: "Demo address — not a real location (HITEC City)", latitude: "17.4441", longitude: "78.3779",
      rentalType: "monthly", priceInr: "2800", availableDays: [0, 1, 2, 3, 4, 5, 6], access24h: false, availableFrom: "20:00", availableTo: "07:00", overnightAllowed: true,
      maxHeightM: "2.0", securityFeatures: ["cctv", "security_guard", "gated"], accessInstructions: "Fictional: badge access provided after acceptance.",
    }),
  },
  {
    owner: "c",
    values: base({
      title: `${DEMO_TITLE_PREFIX}EV-friendly bay, Banjara Hills`,
      description: `Sample covered bay with a (fictional) EV charging point.${NOTE}`,
      vehicleTypes: ["car"], coverType: "covered", locality: "Banjara Hills", postalCode: "500034",
      addressLine: "Demo address — not a real location (Banjara Hills)", latitude: "17.4163", longitude: "78.4355",
      rentalType: "daily", priceInr: "250", availableDays: [0, 1, 2, 3, 4, 5, 6], access24h: true,
      securityFeatures: ["ev_charging", "cctv", "gated", "intercom"], accessInstructions: "Fictional: intercom flat 0.",
    }),
  },
  {
    owner: "a",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Open lot near Begumpet`,
      description: `Sample open lot with room for larger vehicles.${NOTE}`,
      vehicleTypes: ["car", "other"], coverType: "open", locality: "Begumpet", postalCode: "500016",
      addressLine: "Demo address — not a real location (Begumpet)", latitude: "17.4406", longitude: "78.4647",
      rentalType: "monthly", priceInr: "2200", availableDays: [1, 2, 3, 4, 5, 6], access24h: false, availableFrom: "06:00", availableTo: "21:00",
      maxLengthM: "6", vehicleRestrictions: "Fictional: no commercial trucks.", securityFeatures: ["well_lit"], accessInstructions: "Fictional: gate opens on request.",
    }),
  },
  {
    owner: "b",
    values: base({
      title: `${DEMO_TITLE_PREFIX}Covered bay, Manikonda`,
      description: `Sample apartment-complex bay offered on weekends.${NOTE}`,
      vehicleTypes: ["car"], coverType: "covered", locality: "Manikonda", postalCode: "500089",
      addressLine: "Demo address — not a real location (Manikonda)", latitude: "17.4041", longitude: "78.3879",
      rentalType: "daily", priceInr: "150", availableDays: [0, 6], access24h: true,
      securityFeatures: ["gated", "cctv"], accessInstructions: "Fictional: visitor entry at the demo gate.",
    }),
  },
];
