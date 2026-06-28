export type MarketplaceSideId = "customer" | "worker" | "company";

export type MarketplaceRequestShapeId =
  | "fast_quote"
  | "moving_help"
  | "delivery_reuse"
  | "repeat_loop";

export type MarketplaceRequestShape = {
  id: MarketplaceRequestShapeId;
  shape: string;
  references: string;
  customer: string;
  worker: string;
  company: string;
  pricingServices: string[];
};

export type MarketplaceSimpleSide = {
  id: MarketplaceSideId;
  side: string;
  tabs: string;
  tasks: string;
  options: string;
};

export type MarketplaceZoneServiceOption = {
  code: string;
  label: string;
  shapeId: MarketplaceRequestShapeId;
  defaultCrewSize: number;
  defaultHours: number;
  customerPrompt: string;
  workerReality: string;
  companyReality: string;
};

export const MARKETPLACE_REQUEST_SHAPES: MarketplaceRequestShape[] = [
  {
    id: "fast_quote",
    shape: "Fast Quote",
    references: "Google, Yelp, Facebook, Craigslist",
    customer: "ZIP/date, service, contact, notes, optional photos.",
    worker: "Hidden until staff prices or opens the card.",
    company: "Owner alert, funnel tracking, quote_requested lead card.",
    pricingServices: [],
  },
  {
    id: "moving_help",
    shape: "Moving Help",
    references: "U-Haul, MovingHelp, MovingHelper, HireAHelper",
    customer: "Load, unload, or both; truck provider; truck size; crew package.",
    worker: "Available job or assigned job with calendar and dispatch steps.",
    company: "Zone rate, minimum hours, Square link, crew payout preview.",
    pricingServices: ["load_unload", "pack_unpack", "ubox"],
  },
  {
    id: "delivery_reuse",
    shape: "Delivery / Reuse",
    references: "Target, Walmart, Goodwill, PODS",
    customer: "Pickup, drop-off, item size, photos, timing window.",
    worker: "Driver/helper task with route, access notes, and completion proof.",
    company: "Travel variables, item handling, route bundling, reuse leads.",
    pricingServices: ["delivery"],
  },
  {
    id: "repeat_loop",
    shape: "Repeat Loop",
    references: "McDonald's, JCMOVES, reviews, rep links",
    customer: "Simple offer, review, reward credit, next-service shortcut.",
    worker: "Advertise, accept, complete, earn task and job bonuses.",
    company: "Webhook ads, payout safety, referral attribution, review follow-up.",
    pricingServices: [],
  },
];

export const MARKETPLACE_SIMPLE_SIDES: MarketplaceSimpleSide[] = [
  {
    id: "customer",
    side: "Customer",
    tabs: "Book, Track",
    tasks: "Request help, review estimate, pay link, leave review.",
    options: "Contact info, photos, notes, rewards.",
  },
  {
    id: "worker",
    side: "Worker",
    tabs: "Today, Jobs, Schedule, Earnings",
    tasks: "Accept, navigate, start, complete, advertise.",
    options: "Availability, profile, payout, notifications.",
  },
  {
    id: "company",
    side: "Company",
    tabs: "Ops Board, Dispatch, Jobs, Schedule",
    tasks: "Price, assign, notify, collect, complete, payout.",
    options: "Pricing, People, Finance, Funnel, Marketing, Launch.",
  },
];

export const MARKETPLACE_ZONE_SERVICE_OPTIONS: MarketplaceZoneServiceOption[] = [
  {
    code: "load_unload",
    label: "Load/Unload",
    shapeId: "moving_help",
    defaultCrewSize: 2,
    defaultHours: 3,
    customerPrompt: "Load, unload, or both.",
    workerReality: "Crew count, window, truck access, stairs, completion proof.",
    companyReality: "Hourly rate, minimum hours, discount threshold, travel fee.",
  },
  {
    code: "pack_unpack",
    label: "Pack/Unpack",
    shapeId: "moving_help",
    defaultCrewSize: 2,
    defaultHours: 3,
    customerPrompt: "Rooms, boxes, fragile items, and packing supplies.",
    workerReality: "Labor-only task with supplies and room priority notes.",
    companyReality: "Hourly rate, minimum hours, materials note, add-on option.",
  },
  {
    code: "delivery",
    label: "Delivery",
    shapeId: "delivery_reuse",
    defaultCrewSize: 2,
    defaultHours: 2,
    customerPrompt: "Pickup, drop-off, item size, and timing window.",
    workerReality: "Driver/helper route with access notes and photo proof.",
    companyReality: "Travel rate, item handling, route bundling, Square link.",
  },
  {
    code: "ubox",
    label: "U-Box Style",
    shapeId: "moving_help",
    defaultCrewSize: 2,
    defaultHours: 2,
    customerPrompt: "Delivery only, load/unload only, or both.",
    workerReality: "Container job with site access, box count, and time window.",
    companyReality: "Box fee, hourly minimum, mileage, and quote snapshot.",
  },
];

export function getMarketplaceRequestShape(id: MarketplaceRequestShapeId) {
  return MARKETPLACE_REQUEST_SHAPES.find((shape) => shape.id === id);
}

