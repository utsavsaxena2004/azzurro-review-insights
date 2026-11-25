import { PropertyMeta } from "@/types";

export const AZZURRO_PROPERTIES: PropertyMeta[] = [
  {
    id: "darling-harbour",
    name: "Azzurro Pod Hotel Darling Harbour - Near Convention Center",
    shortName: "Darling Harbour",
    bookingSlug: "chateau-de-venus",
    bookingUrl: "https://www.booking.com/hotel/au/chateau-de-venus.html",
    address: "22 Allen Street, Pyrmont NSW 2009",
    propertyType: "pod_hotel",
    hasFreeDinner: true,
    dinnerWindow: "6:30 PM – 7:45 PM",
    bookingScore: 6.6,
    totalBookingReviews: 4310,
    wifiScore: 8.3,
    opsNotes:
      "Pod hotel with free dinner; stairs only (no elevator); $10 towel & $10 padlock fees; 3.5% card surcharge.",
  },
  {
    id: "central-sydney",
    name: "Azzurro Pod Hotel Central Sydney - Near Central Station",
    shortName: "Central Sydney",
    bookingSlug: "venus-surry-hills",
    bookingUrl: "https://www.booking.com/hotel/au/venus-surry-hills.html",
    address: "90 Wentworth Avenue, Surry Hills NSW 2010",
    propertyType: "pod_hotel",
    hasFreeDinner: true,
    dinnerWindow: "7:00 PM – 8:00 PM",
    bookingScore: 6.6,
    totalBookingReviews: 2450,
    wifiScore: 9.0,
    opsNotes:
      "Pod hotel near Central Station; highest Wi-Fi rating (9.0); free dinner; stairs only; $10 towel/padlock fees.",
  },
  {
    id: "potts-point",
    name: "Azzurro Pod Hotel Potts Point - Near Kings Cross Station",
    shortName: "Potts Point",
    bookingSlug: "venus-potts-point-sydney",
    bookingUrl: "https://www.booking.com/hotel/au/venus-potts-point-sydney.html",
    address: "141–143 Victoria Street, Potts Point NSW 2011",
    propertyType: "pod_hotel",
    hasFreeDinner: true,
    dinnerWindow: "7:00 PM – 8:00 PM",
    bookingScore: 6.3,
    totalBookingReviews: 2405,
    wifiScore: 8.3,
    opsNotes:
      "Lowest Booking.com score in portfolio (6.3); shared bathrooms & terrace; Kings Cross nightlife corridor.",
  },
  {
    id: "olympic-paddington",
    name: "Olympic Hotel Paddington",
    shortName: "Olympic Paddington",
    bookingSlug: "olympic-paddington",
    bookingUrl: "https://www.booking.com/hotel/au/olympic-paddington.html",
    address: "308 Moore Park Road, Paddington NSW 2021",
    propertyType: "boutique_pub_hotel",
    hasFreeDinner: false,
    dinnerWindow: null,
    bookingScore: 6.5,
    totalBookingReviews: 125,
    wifiScore: 8.3,
    opsNotes:
      "Private-room boutique pub hotel across Allianz Stadium & SCG; sports bar & rooftop terrace; dinner NOT included.",
  },
];

// All 8 required operational topics from the trial brief + Azzurro's Free Dinner topic
export const CORE_ASPECTS = [
  "Cleanliness",
  "Check-in experience",
  "Staff or receptionist behaviour",
  "Noise",
  "Facilities",
  "Location",
  "Room condition",
  "Value for money",
  "Free Dinner",
] as const;
