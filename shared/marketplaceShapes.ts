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

export type MarketplaceReferenceBlueprint = {
  reference: string;
  borrow: string;
  avoid: string;
  jcSurface: string;
  customerWin: string;
  workerWin: string;
  companyWin: string;
  nextBuild: string;
  metric: string;
};

export type MarketplaceFlywheelStageId =
  | "attract"
  | "capture"
  | "size"
  | "quote"
  | "dispatch"
  | "complete"
  | "collect"
  | "retain";

export type MarketplaceFlywheelStage = {
  id: MarketplaceFlywheelStageId;
  label: string;
  references: string;
  objective: string;
  customerAction: string;
  workerAction: string;
  companyAction: string;
  automation: string;
  proof: string;
  rewardClose: string;
  primarySurface: string;
  sourceOfTruth: string;
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

export const MARKETPLACE_REFERENCE_BLUEPRINTS: MarketplaceReferenceBlueprint[] = [
  {
    reference: "Target",
    borrow: "Clean category cards, add-ons, pickup windows, and a calm checkout feel.",
    avoid: "Too many retail-style choices before the customer has told us the job shape.",
    jcSurface: "Services, Book, Customer Portal",
    customerWin: "Feels organized and familiar when choosing help.",
    workerWin: "Gets service category, add-ons, and timing without guessing.",
    companyWin: "Can bundle local delivery, reuse, and labor into repeatable offers.",
    nextBuild: "Service cards with photo-backed add-ons and one recommended package.",
    metric: "Package selection rate",
  },
  {
    reference: "Walmart",
    borrow: "Everyday practical pricing, delivery/pickup logic, and broad local coverage.",
    avoid: "Race-to-bottom pricing that breaks travel, labor, and payout math.",
    jcSurface: "Zone Pricing, Quote Preview, Dispatch",
    customerWin: "Gets a practical range fast, even outside the core town.",
    workerWin: "Knows travel and truck expectations before accepting.",
    companyWin: "Can cover more areas when the zone price reflects distance.",
    nextBuild: "Map-based zone editor with radius/polygon preview and travel variables.",
    metric: "Out-of-zone quote conversion",
  },
  {
    reference: "Goodwill",
    borrow: "Reuse, donation, item disposition, and proof that stuff went somewhere useful.",
    avoid: "Treating every removal as trash when it could become donation, resale, or delivery.",
    jcSurface: "Quick Request, Job Detail, Completion Proof",
    customerWin: "Can say donate, dispose, store, or deliver with photos.",
    workerWin: "Knows item destiny before loading.",
    companyWin: "Creates reuse partnerships and cleaner job categories.",
    nextBuild: "Per-item tags: donate, dispose, deliver, store, reuse.",
    metric: "Reuse-tagged jobs",
  },
  {
    reference: "McDonald's",
    borrow: "Simple menu, predictable packages, fast repeat choices.",
    avoid: "Hiding all pricing behind custom work when common jobs are predictable.",
    jcSurface: "Smart Booking, Pricing, Quote Consensus",
    customerWin: "Picks 2 movers / 3 hours or 3 movers / 2 hours quickly.",
    workerWin: "Sees a standard crew/hour expectation.",
    companyWin: "Quotes faster and compares margin across repeated packages.",
    nextBuild: "Default package buttons tied to zone rates and minimums.",
    metric: "Under-60-second quote starts",
  },
  {
    reference: "Two Men and a Truck",
    borrow: "Professional crew assignment, arrival windows, and completed-job confirmation.",
    avoid: "Letting the calendar fill with unconfirmed quote clutter.",
    jcSurface: "Ops Board, Dispatch, Crew Jobs, Schedule",
    customerWin: "Sees when the job is actually confirmed.",
    workerWin: "Gets assigned job details, route, start, and completion flow.",
    companyWin: "Tracks status from quote to paid without losing the card.",
    nextBuild: "White-to-green calendar status and dismissible ops notifications.",
    metric: "Confirmed jobs completed on schedule",
  },
  {
    reference: "U-Haul",
    borrow: "Truck size, load/unload, customer truck vs provider truck, and time windows.",
    avoid: "Forcing truck/container jobs through a generic moving form.",
    jcSurface: "Book, Lead Quote Dialog, Zone Pricing",
    customerWin: "Explains the move in the same language they already know.",
    workerWin: "Knows truck size and access details.",
    companyWin: "Can price truck, travel, and labor separately.",
    nextBuild: "Truck-size prompts that auto-suggest crew and hours.",
    metric: "Truck-size completion rate",
  },
  {
    reference: "MovingHelp / MovingHelper",
    borrow: "Hourly helper rates by crew size, minimums, and discounts after longer bookings.",
    avoid: "Final hard pricing before staff confirms risk, access, and travel.",
    jcSurface: "Zone Rates, Quote Preview, Lead Quote Dialog",
    customerWin: "Gets a credible estimate range before commitment.",
    workerWin: "Sees helper count and expected hours.",
    companyWin: "Keeps rates adjustable by zone while freezing old quote snapshots.",
    nextBuild: "Rate rows per service, crew size, minimum hours, and discount threshold.",
    metric: "Quote approval time",
  },
  {
    reference: "Porch Moving Group",
    borrow: "Marketplace routing, service fit, and fast lead handling.",
    avoid: "Selling the lead to nowhere or making ownership unclear.",
    jcSurface: "Ops Board, Authority Tasks, Notifications",
    customerWin: "Request reaches people who can act.",
    workerWin: "Can help classify or quote without owning final risk.",
    companyWin: "Uses Bronze/Silver/Gold/Platinum rails to speed response safely.",
    nextBuild: "Consensus quote queue where matching samples raise confidence.",
    metric: "Time to first useful quote action",
  },
  {
    reference: "HireAHelper",
    borrow: "Price comparison, availability confidence, and service-area matching.",
    avoid: "Letting customer comparison turn into unmanaged low-bid chaos.",
    jcSurface: "Quote Consensus, Zone Pricing, Crew Availability",
    customerWin: "Gets a range and availability signal quickly.",
    workerWin: "Can choose from clear available cards.",
    companyWin: "Balances speed with Gold/Platinum approval gates.",
    nextBuild: "Availability-aware quote confidence badges.",
    metric: "Available-to-assigned conversion",
  },
  {
    reference: "Yelp",
    borrow: "Reviews, local trust, photos, and quick contact intent.",
    avoid: "Untracked messages that never become lead cards.",
    jcSurface: "Reviews, Funnel, Marketing Webhooks",
    customerWin: "Trusts the crew before entering contact info.",
    workerWin: "Can use real review/photo assets in local posts.",
    companyWin: "Sees review-driven traffic and request recovery.",
    nextBuild: "Review/photo picker for ad creation.",
    metric: "Review-attributed requests",
  },
  {
    reference: "Google",
    borrow: "Address autocomplete, local search intent, maps, and fast answers.",
    avoid: "Manual address typing that slows booking and creates bad travel math.",
    jcSurface: "Book, Zone Map, Booking Funnel",
    customerWin: "Finds address in seconds.",
    workerWin: "Gets cleaner route and access info.",
    companyWin: "Uses better address data for zone, travel, and dispatch.",
    nextBuild: "Address autocomplete everywhere a job can be created.",
    metric: "Address resolved rate",
  },
  {
    reference: "Facebook",
    borrow: "Local groups, comments, Messenger follow-up, photos, and last-minute demand.",
    avoid: "Posting without a tracked link or follow-up path.",
    jcSurface: "Crew Earn / Ads, Marketing Webhooks, Funnel",
    customerWin: "Clicks a post and lands in a simple request path.",
    workerWin: "Creates ad kit and earns JCMOVES for useful campaigns.",
    companyWin: "Tracks which posts turn into cards.",
    nextBuild: "Campaign scoreboard plus saved ad templates by area/focus.",
    metric: "Campaign-attributed cards",
  },
  {
    reference: "Craigslist",
    borrow: "Simple classified demand and direct local service offers.",
    avoid: "Anonymous, unqualified back-and-forth with no quote card.",
    jcSurface: "Ad Creator, Quick Request, Funnel Recovery",
    customerWin: "Gets a simple link instead of a vague reply thread.",
    workerWin: "Can paste a short ad and fast reply.",
    companyWin: "Turns classified traffic into tracked quote_requested cards.",
    nextBuild: "Craigslist-safe short-copy mode in the ad builder.",
    metric: "Classified link starts",
  },
  {
    reference: "PODS / U-Box",
    borrow: "Container count, delivery vs load/unload, mileage, and site access.",
    avoid: "Pricing container jobs like regular house moves.",
    jcSurface: "Book, Zone Pricing, Job Detail",
    customerWin: "Describes box/container work clearly.",
    workerWin: "Sees box count and site constraints.",
    companyWin: "Prices mileage, box fees, and labor with a snapshot.",
    nextBuild: "U-Box-style service rows and container-specific intake.",
    metric: "Container quote accuracy",
  },
  {
    reference: "Square",
    borrow: "Payment links, invoices, deposits, receipts, and collect-anywhere trust.",
    avoid: "Letting workers handle private card data or payout before payment safety checks.",
    jcSurface: "Finance, Job Detail, Payment Status",
    customerWin: "Pays through a trusted link.",
    workerWin: "Can collect with a link, not a card number.",
    companyWin: "Keeps invoice, deposit, payout, and profit states aligned.",
    nextBuild: "One-click Square invoice/link from approved quote.",
    metric: "Approved quote to paid time",
  },
  {
    reference: "JCMOVES Crypto",
    borrow: "Rewards, streaks, referrals, task bonuses, and repeat engagement.",
    avoid: "Issuing rewards without verified value or completed work.",
    jcSurface: "Rewards, Authority Tasks, Payout Engine",
    customerWin: "Gets useful credits without booking becoming complicated.",
    workerWin: "Earns for marketing, quote help, completion, and reviews.",
    companyWin: "Rewards behavior that creates or completes real work.",
    nextBuild: "Task completion ledger with bonus JCMOVES by tier.",
    metric: "Verified reward actions",
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

export const MARKETPLACE_OPERATING_FLYWHEEL: MarketplaceFlywheelStage[] = [
  {
    id: "attract",
    label: "Attract",
    references: "Facebook, Craigslist, Yelp, Google, rep links",
    objective: "Bring local intent into one tracked JC doorway instead of scattered messages.",
    customerAction: "Sees a local post, review, search result, or rep page and taps the quote link.",
    workerAction: "Creates a simple ad with photo/text, posts it, and copies the fast follow-up message.",
    companyAction: "Tracks source, campaign, promo code, rep slug, and funnel health.",
    automation: "Crew ad creator generates copy, tracked links, Discord/webhook reminders, and bonus eligibility.",
    proof: "marketing_webhook_campaigns row, booking_funnel_events row, quote_attributions row.",
    rewardClose: "Marketing task JCMOVES for useful tracked campaigns.",
    primarySurface: "Crew Earn / Ads, Marketing Webhooks, Booking Funnel",
    sourceOfTruth: "marketing_webhook_campaigns + quote_attributions",
  },
  {
    id: "capture",
    label: "Capture",
    references: "Google forms, Yelp leads, MovingHelp intake",
    objective: "Turn every request into a recoverable lead card within seconds.",
    customerAction: "Enters ZIP/address, estimated date, service choice, contact, notes, and optional photos.",
    workerAction: "Can enter a request on behalf of a customer from worker mode.",
    companyAction: "Receives owner/admin notification and can recover abandoned attempts.",
    automation: "Booking bridge creates or links a quote_requested lead and records partial funnel snapshots.",
    proof: "Lead card exists with source, quote snapshot, funnel event, photos/media context.",
    rewardClose: "Lead creation and marketing attribution can feed task credit later.",
    primarySurface: "Book, Quick Request, Admin Funnel, Admin Jobs",
    sourceOfTruth: "leads",
  },
  {
    id: "size",
    label: "Size",
    references: "McDonald's menu, Walmart catalog, U-Haul truck sizing",
    objective: "Make job sizing feel like picking the closest package, not filling out a long form.",
    customerAction: "Chooses load/unload/both, truck provider, truck size, and a common crew/hour package.",
    workerAction: "Sees clear crew count, hours, truck/access notes, and job shape.",
    companyAction: "Adjusts package, hours, crew, zone, travel, and special handling before approval.",
    automation: "Smart defaults suggest 2 movers / 3 hours or 3 movers / 2 hours and preserve item/photos detail.",
    proof: "Lead quote snapshot includes service selections, crew, hours, truck, zone preview, and notes.",
    rewardClose: "Quote sampling tasks can reward matching Bronze/Silver/Gold picks.",
    primarySurface: "Smart Booking, Lead Quote Dialog, Authority Tasks",
    sourceOfTruth: "lead.quoteSnapshot",
  },
  {
    id: "quote",
    label: "Quote",
    references: "MovingHelp rates, HireAHelper comparison, PODS/U-Box pricing",
    objective: "Convert rough request detail into a price range and confirmed staff quote.",
    customerAction: "Sees estimate range first and waits for final staff confirmation.",
    workerAction: "Silver can build quote cards; Gold can approve when guided picks match.",
    companyAction: "Sets final price, deposit, Square link, crew pay preview, and company profit guardrails.",
    automation: "Zone rates, hourly minimums, discounts, travel padding, and quote consensus reduce manual work.",
    proof: "Quoted lead has base/total price, quote notes, zone snapshot, approval record, and payment/deposit status.",
    rewardClose: "Quote task JCMOVES only after useful quote work, not loose guesses.",
    primarySurface: "Pricing, Jobs, Quote Review, Finance",
    sourceOfTruth: "leads + quote_approvals + zone snapshots",
  },
  {
    id: "dispatch",
    label: "Dispatch",
    references: "Two Men and a Truck, Porch Moving Group",
    objective: "Move a confirmed card onto calendar and into the right crew hands.",
    customerAction: "Gets confirmation that the crew/date/window is set.",
    workerAction: "Receives only relevant available or assigned job notifications, then accepts/navigates/starts.",
    companyAction: "Assigns crew, resolves leave/availability, and watches calendar coverage.",
    automation: "Job events notify admin, eligible crew, assigned crew, and webhooks by lifecycle stage.",
    proof: "Crew assignment, calendar entry, dispatch timestamp, status transition, notification record.",
    rewardClose: "Accepted assignment prepares payout but does not issue premature payout.",
    primarySurface: "Dispatch, Crew Jobs, Schedule, Ops Board",
    sourceOfTruth: "leads + job_assignments + notifications",
  },
  {
    id: "complete",
    label: "Complete",
    references: "Professional mover workflow, review platforms",
    objective: "Prove the job happened and trigger rewards/payout flow once.",
    customerAction: "Confirms service, receives review/tip follow-up, and can rebook.",
    workerAction: "Completes job, uploads proof/photos/notes, and closes status.",
    companyAction: "Reviews completion, resolves exceptions, and protects payout safety.",
    automation: "Completion event is idempotent so JCMOVES and payout records do not duplicate.",
    proof: "Completed status, completion timestamp, proof notes/photos, payout calculation.",
    rewardClose: "Worker/customer JCMOVES and lottery/review loops attach after verified completion.",
    primarySurface: "Crew Jobs, Job Detail, Reviews, Payouts",
    sourceOfTruth: "leads + job_payout_calculations",
  },
  {
    id: "collect",
    label: "Collect",
    references: "Square invoice links, cash payout records",
    objective: "Make payment collection simple while preserving company profit and crew cash payout math.",
    customerAction: "Pays deposit/final invoice through Square link or approved cash/payment path.",
    workerAction: "Can collect through trusted link without handling card data.",
    companyAction: "Marks payment/payout status and verifies reserves, profit, bonus, referral, and growth splits.",
    automation: "Square link, deposit gate, payout preview, and manual payout status keep money movement controlled.",
    proof: "Square payment URL/status, deposit flag, payout status, paid timestamp, profit-share record.",
    rewardClose: "Cash payout now; automatic invoice/payment setup as Square token/config matures.",
    primarySurface: "Finance, Job Detail, Job Payouts",
    sourceOfTruth: "leads + payment/payout tables",
  },
  {
    id: "retain",
    label: "Retain",
    references: "Target loyalty, McDonald's repeat habit, Goodwill reuse loop, JCMOVES",
    objective: "Turn a completed job into the next booking, review, referral, or reuse opportunity.",
    customerAction: "Leaves review, uses JCMOVES, rebooks, refers someone, or asks for related services.",
    workerAction: "Uses completed photos/reviews for the next local post and follows up with warm leads.",
    companyAction: "Measures campaign performance, reviews, repeat jobs, and reward liability.",
    automation: "Review links, rep pages, webhook reminders, wallet rewards, and campaign analytics feed the loop.",
    proof: "Review, reward ledger, attribution, repeat lead, recovered funnel card, campaign performance row.",
    rewardClose: "JCMOVES reinforces useful behavior without replacing actual payment discipline.",
    primarySurface: "Reviews, Rewards, Marketing Network, Analytics",
    sourceOfTruth: "rewards + reviews + quote_attributions",
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
