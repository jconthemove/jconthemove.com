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

export type MarketplaceFunctionalIdeaStatus = "live" | "in_progress" | "next";

export type MarketplaceFunctionalIdea = {
  reference: string;
  pattern: string;
  jcMove: string;
  customerReality: string;
  workerReality: string;
  companyReality: string;
  surface: string;
  status: MarketplaceFunctionalIdeaStatus;
  shapeIds: MarketplaceRequestShapeId[];
};

export const MARKETPLACE_REQUEST_SHAPES: MarketplaceRequestShape[] = [
  {
    id: "fast_quote",
    shape: "Fast Quote",
    references: "Google, Yelp, Facebook, Craigslist",
    customer: "ZIP/date, service, contact, notes, optional photos.",
    worker: "Bronze marketers can pick guided quote options; matching picks raise confidence.",
    company: "Owner alert, funnel tracking, quote_requested lead card, consensus quote safety net.",
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
    worker: "Advertise, sample quote, accept, complete, earn task and job bonuses.",
    company: "Webhook ads, payout safety, referral attribution, quote consensus, review follow-up.",
    pricingServices: [],
  },
];

export const MARKETPLACE_FUNCTIONAL_IDEAS: MarketplaceFunctionalIdea[] = [
  {
    reference: "Target + Walmart",
    pattern: "Catalog cards, add-ons, pickup/delivery windows, and simple item choices.",
    jcMove: "Turn services into quick cards with common packages, add-ons, photos, and tracked booking links.",
    customerReality: "Pick the closest service in under a minute, then add address/date and photos.",
    workerReality: "See a clear task type, route, crew need, and add-on handling notes.",
    companyReality: "Bundle work, route nearby stops, and keep pricing snapshots attached to the lead.",
    surface: "Book, Services, Admin Pricing",
    status: "in_progress",
    shapeIds: ["fast_quote", "delivery_reuse"],
  },
  {
    reference: "Goodwill",
    pattern: "Donation, reuse, removal, and visible before/after item flow.",
    jcMove: "Let removal and delivery leads tag items as donate, dispose, deliver, store, or reuse.",
    customerReality: "Upload photos and choose what should happen to each item.",
    workerReality: "Know whether the item is trash, donation, delivery, or special handling before arrival.",
    companyReality: "Create reuse partnerships, donation proof, and clean revenue categories.",
    surface: "Quick Request, Job Detail, Completion Proof",
    status: "next",
    shapeIds: ["delivery_reuse", "fast_quote"],
  },
  {
    reference: "McDonald's",
    pattern: "Fast menu, predictable packages, repeatable local offer.",
    jcMove: "Use simple packages like 2 movers / 3 hours and 3 movers / 2 hours as default buttons.",
    customerReality: "Choose a familiar package without learning the whole pricing system.",
    workerReality: "See standard crew/hour expectations and fewer vague job cards.",
    companyReality: "Quote faster, compare margins, and train Gold/Silver workers on consistent options.",
    surface: "Smart Booking, Quote Consensus, Pricing",
    status: "live",
    shapeIds: ["moving_help", "repeat_loop"],
  },
  {
    reference: "Two Men and a Truck",
    pattern: "Professional moving crew, arrival window, assigned team, completion confirmation.",
    jcMove: "Move lead cards through quoted, available, assigned, in progress, completed, paid.",
    customerReality: "Know the crew is assigned and the job is confirmed.",
    workerReality: "Accept, navigate, start, complete, and upload proof from the crew app.",
    companyReality: "Calendar, dispatch, payout safety, and review requests stay tied to one card.",
    surface: "Ops Board, Dispatch, Crew Jobs",
    status: "in_progress",
    shapeIds: ["moving_help"],
  },
  {
    reference: "U-Haul + MovingHelp + MovingHelper",
    pattern: "Load/unload choices, truck provider, truck size, helper count, hourly minimums.",
    jcMove: "Ask zip/date first, then load/unload/both, truck source, truck size, crew count, hours.",
    customerReality: "Get an estimate range without a phone call for common moving-help jobs.",
    workerReality: "Know whether the customer has the truck and what size crew is expected.",
    companyReality: "Zone rates, minimums, discount thresholds, and travel fees drive the quote snapshot.",
    surface: "Book, Zone Pricing, Lead Quote Dialog",
    status: "in_progress",
    shapeIds: ["moving_help"],
  },
  {
    reference: "Porch Moving Group + HireAHelper",
    pattern: "Marketplace availability, price comparison, service area fit, and quote confidence.",
    jcMove: "Use Bronze/Silver/Gold quote sampling so multiple matching picks can raise confidence before approval.",
    customerReality: "Request does not die while waiting for one person to price it.",
    workerReality: "Marketers can sample quote options and earn JCMOVES for useful answers.",
    companyReality: "Gold/Platinum approval protects pricing while speeding up response time.",
    surface: "Authority Tasks, Pending Quotes, Ops Board",
    status: "live",
    shapeIds: ["fast_quote", "moving_help"],
  },
  {
    reference: "Yelp + Google",
    pattern: "Local trust, reviews, address search, map intent, and quick contact.",
    jcMove: "Pair address autocomplete and review signals with a request flow that captures abandoned attempts.",
    customerReality: "Find the address quickly and trust the company before submitting.",
    workerReality: "Use reviews and job photos as marketing assets after completion.",
    companyReality: "Track funnel drop-offs, errors, review requests, and local search attribution.",
    surface: "Book, Booking Funnel, Reviews",
    status: "in_progress",
    shapeIds: ["fast_quote", "repeat_loop"],
  },
  {
    reference: "Facebook + Craigslist",
    pattern: "Local demand, quick comments/messages, photos, last-minute jobs, rep links.",
    jcMove: "Crew ad creator generates posts, follow-up text, tracked links, and campaign attribution.",
    customerReality: "Click from a local post and land directly in a simple request path.",
    workerReality: "Post for a couple minutes, copy follow-up, and let the link track the lead.",
    companyReality: "See campaign performance, requests, cards, errors, and rep credit.",
    surface: "Crew Earnings, Marketing Webhooks, Funnel",
    status: "live",
    shapeIds: ["fast_quote", "repeat_loop"],
  },
  {
    reference: "PODS + U-Box",
    pattern: "Container delivery, load/unload, box count, mileage, site access.",
    jcMove: "Add U-Box-style service rows with delivery only, load/unload only, or both.",
    customerReality: "Explain the container job without forcing it into a normal house move.",
    workerReality: "Know container count, site access, and whether delivery or labor is needed.",
    companyReality: "Price box fees, mileage, labor minimums, and quote review cards cleanly.",
    surface: "Zone Pricing, Book, Job Detail",
    status: "next",
    shapeIds: ["moving_help", "delivery_reuse"],
  },
  {
    reference: "Square",
    pattern: "Payment links, invoices, deposits, receipts, and collect-anywhere billing.",
    jcMove: "Prepare a Square payment link after quote approval so any approved worker can collect payment.",
    customerReality: "Pay from a trusted link after staff confirms final pricing.",
    workerReality: "Collect payment without handling private card data.",
    companyReality: "Cash payout records and invoice status protect profit and payout timing.",
    surface: "Finance, Job Detail, Payment Status",
    status: "in_progress",
    shapeIds: ["moving_help", "fast_quote"],
  },
  {
    reference: "Discord + Solbot-style webhooks",
    pattern: "Event bus, reminders, ops alerts, marketing posts, crew broadcasts.",
    jcMove: "Send job lifecycle and marketing events to Discord/webhooks while keeping leads as source of truth.",
    customerReality: "Faster response because the right people are alerted.",
    workerReality: "Only relevant crew get assignment updates after the job is claimed.",
    companyReality: "Owner sees new requests, crew sees available jobs, completion triggers payout flow.",
    surface: "Job Event Bus, Notifications, Marketing Webhooks",
    status: "live",
    shapeIds: ["fast_quote", "repeat_loop"],
  },
  {
    reference: "JCMOVES Crypto",
    pattern: "Rewards, streaks, task bonuses, referral credit, repeat engagement.",
    jcMove: "Issue JCMOVES for useful marketing, quote sampling, completion, review, and repeat booking loops.",
    customerReality: "Earn credits and discounts without making booking complicated.",
    workerReality: "Earn extra JCMOVES for work that helps the marketplace move.",
    companyReality: "Tie rewards to verified actions so bonuses do not outrun real revenue.",
    surface: "Rewards, Authority Tasks, Payout Engine",
    status: "live",
    shapeIds: ["repeat_loop"],
  },
];

export const MARKETPLACE_SIMPLE_SIDES: MarketplaceSimpleSide[] = [
  {
    id: "customer",
    side: "Customer",
    tabs: "Jobs, Book, Options",
    tasks: "Request help, track status, pay, review.",
    options: "Home, rewards, wallet, earn, profile.",
  },
  {
    id: "worker",
    side: "Worker",
    tabs: "Tasks, Options",
    tasks: "Accept, navigate, start, complete, advertise.",
    options: "Schedule, reviews, earnings, add job.",
  },
  {
    id: "company",
    side: "Company",
    tabs: "Tasks, Options",
    tasks: "Ops Board, Dispatch, Jobs, Schedule.",
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

export function getMarketplaceFunctionalIdeasForShape(id: MarketplaceRequestShapeId) {
  return MARKETPLACE_FUNCTIONAL_IDEAS.filter((idea) => idea.shapeIds.includes(id));
}

export function getMarketplaceShapeForServiceCode(serviceCode: string | null | undefined) {
  const normalized = String(serviceCode || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) return getMarketplaceRequestShape("fast_quote")!;

  if (
    normalized.includes("rebook") ||
    normalized.includes("review") ||
    normalized.includes("reward") ||
    normalized.includes("rep_link") ||
    normalized.includes("referral")
  ) {
    return getMarketplaceRequestShape("repeat_loop")!;
  }

  if (
    normalized.includes("clean") ||
    normalized.includes("junk") ||
    normalized.includes("trash") ||
    normalized.includes("snow") ||
    normalized.includes("lawn") ||
    normalized.includes("paint") ||
    normalized.includes("floor") ||
    normalized.includes("roof") ||
    normalized.includes("handyman") ||
    normalized.includes("demo")
  ) {
    return getMarketplaceRequestShape("fast_quote")!;
  }

  if (
    normalized.includes("ubox") ||
    normalized.includes("u_box") ||
    normalized.includes("moving") ||
    normalized.includes("move") ||
    normalized.includes("residential") ||
    normalized.includes("commercial") ||
    normalized.includes("load_unload") ||
    normalized.includes("unload") ||
    normalized.includes("pack_unpack") ||
    normalized.includes("packing") ||
    normalized === "labor"
  ) {
    return getMarketplaceRequestShape("moving_help")!;
  }

  if (
    normalized.includes("delivery") ||
    normalized.includes("pickup") ||
    normalized.includes("pods") ||
    normalized.includes("store") ||
    normalized.includes("reuse") ||
    normalized.includes("haul")
  ) {
    return getMarketplaceRequestShape("delivery_reuse")!;
  }

  return getMarketplaceRequestShape("fast_quote")!;
}
