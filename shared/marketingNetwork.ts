export type MarketingRepSeed = {
  slug: string;
  displayName: string;
  brandName: string;
  tagline: string;
  promoCode: string;
  serviceFocus: string[];
  territory: string;
  audience: string;
  ctaLabel: string;
  phoneNumber: string;
  sortOrder: number;
  contentStrategy: {
    facebookPersonality: string;
    weeklyPrompts: string[];
  };
};

const weeklyAngles = [
  "intro post",
  "before and after",
  "quick tip",
  "customer story",
  "behind the scenes",
  "seasonal reminder",
  "local trust post",
  "common mistake",
  "service checklist",
  "limited-time promo",
  "FAQ answer",
  "weekend availability",
  "safety tip",
  "tool or truck spotlight",
  "testimonial request",
  "neighborhood focus",
  "problem solved",
  "estimate reminder",
  "teamwork post",
  "value comparison",
  "spring cleanup",
  "summer busy-season tip",
  "fall prep",
  "winter readiness",
  "holiday scheduling",
  "same-week opening",
  "referral ask",
  "small job spotlight",
  "large job spotlight",
  "repeat customer thanks",
  "photo walk-through",
  "myth busting",
  "packing or prep tip",
  "local business shoutout",
  "property manager note",
  "realtor note",
  "contractor note",
  "family support post",
  "senior-friendly post",
  "cabin or seasonal property post",
  "cleanout post",
  "heavy item post",
  "U-Haul help post",
  "commercial project post",
  "weather plan",
  "last-minute booking",
  "crew appreciation",
  "pricing transparency",
  "service bundle idea",
  "community post",
  "year-end recap",
  "next-year booking push",
];

function promptsFor(repName: string, voice: string, focus: string) {
  return weeklyAngles.map((angle, index) => (
    `Week ${index + 1}: ${repName} ${angle} - ${voice}. Tie it back to ${focus} and remind customers to use the rep promo code.`
  ));
}

export const DEFAULT_MARKETING_REPS: MarketingRepSeed[] = [
  {
    slug: "matt",
    displayName: "Matt",
    brandName: "Matt The Mover",
    tagline: "Need Moving Help? Call Matt.",
    promoCode: "MATT10",
    serviceFocus: ["Local Moves", "U-Haul Loading & Unloading", "Apartment Moves", "Heavy Furniture"],
    territory: "Local moving labor jobs",
    audience: "Customers who need practical moving help without a full-service sales pitch.",
    ctaLabel: "Book Moving Help",
    phoneNumber: "19062859312",
    sortOrder: 10,
    contentStrategy: {
      facebookPersonality: "Videos of lifting couches, loading trucks, and simple moving tips.",
      weeklyPrompts: promptsFor("Matt", "show useful moving labor in action", "local moves and U-Haul loading"),
    },
  },
  {
    slug: "troy",
    displayName: "Troy",
    brandName: "Troy's Junk Removal",
    tagline: "Junk Gone Fast.",
    promoCode: "TROY10",
    serviceFocus: ["Junk Removal", "Garage Cleanouts", "Furniture Removal", "Appliance Removal"],
    territory: "Junk and cleanout jobs",
    audience: "Homeowners, renters, and landlords who want clutter gone quickly.",
    ctaLabel: "Schedule Junk Removal",
    phoneNumber: "19062859312",
    sortOrder: 20,
    contentStrategy: {
      facebookPersonality: "Before-and-after junk removal photos with short captions.",
      weeklyPrompts: promptsFor("Troy", "show fast cleanouts and visible before-after wins", "junk removal and cleanouts"),
    },
  },
  {
    slug: "evan",
    displayName: "Evan",
    brandName: "Evan's Helping Hands",
    tagline: "Moving Made Easier.",
    promoCode: "EVAN10",
    serviceFocus: ["Senior Moves", "Downsizing", "Packing Assistance", "Family Transition Support"],
    territory: "Senior-focused moving and downsizing",
    audience: "Seniors, adult children, and families planning a careful transition.",
    ctaLabel: "Plan Senior Move",
    phoneNumber: "19062859312",
    sortOrder: 30,
    contentStrategy: {
      facebookPersonality: "Helpful senior moving advice, reassurance, and testimonials.",
      weeklyPrompts: promptsFor("Evan", "keep the tone patient, clear, and family-friendly", "senior moves and downsizing"),
    },
  },
  {
    slug: "bill",
    displayName: "Bill",
    brandName: "Bill's Northwoods Moving & Removal",
    tagline: "Keeping The Northwoods Clean.",
    promoCode: "BILL10",
    serviceFocus: ["Cabins", "Seasonal Properties", "Camp Cleanup", "Property Hauling"],
    territory: "Mercer, Watersmeet, Eagle River, Iron River, and vacation properties",
    audience: "Cabin owners and seasonal-property customers across the Northwoods.",
    ctaLabel: "Book Northwoods Help",
    phoneNumber: "19062859312",
    sortOrder: 40,
    contentStrategy: {
      facebookPersonality: "Fishing, cabins, camp openings and closings, and Northwoods lifestyle.",
      weeklyPrompts: promptsFor("Bill", "sound local, outdoorsy, and useful for seasonal property owners", "cabins and property hauling"),
    },
  },
  {
    slug: "darrell",
    displayName: "Darrell",
    brandName: "Darrell's Priority Moving",
    tagline: "When It Has To Get Done.",
    promoCode: "DARRELL10",
    serviceFocus: ["Commercial Jobs", "Contractors", "Realtors", "Property Managers"],
    territory: "Commercial, contractor, realtor, and priority accounts",
    audience: "Business owners and property pros who need dependable repeat service.",
    ctaLabel: "Request Priority Service",
    phoneNumber: "19062859312",
    sortOrder: 50,
    contentStrategy: {
      facebookPersonality: "Commercial cleanouts, realtor partnerships, and contractor projects.",
      weeklyPrompts: promptsFor("Darrell", "position JC ON THE MOVE as the reliable priority crew", "commercial and repeat-account work"),
    },
  },
];
