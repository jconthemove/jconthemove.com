import { db } from './db';
import { rewardCategories, rewardItems } from '@shared/schema';
import { sql } from 'drizzle-orm';

const CATEGORIES = [
  { name: "☕ Entry Tier",        icon: "☕", color: "#78350f", sortOrder: 1 },
  { name: "⚡ Quantum Spin",      icon: "⚡", color: "#b45309", sortOrder: 2 },
  { name: "🎟️ Discount Coupons", icon: "🎟️", color: "#7c3aed", sortOrder: 3 },
  { name: "🛠️ Service Credits",  icon: "🛠️", color: "#1d4ed8", sortOrder: 4 },
  { name: "🎁 Gift Cards",        icon: "🎁", color: "#065f46", sortOrder: 5 },
  { name: "🚛 Premium Moving",    icon: "🚛", color: "#9f1239", sortOrder: 6 },
];

function buildItems(catMap: Record<string, number>) {
  return [

    // ── ☕ Entry Tier ─────────────────────────────────────────────────────────
    {
      categoryId: catMap["☕ Entry Tier"],
      name: "Copper Cup Coffee — $5 Gift Card",
      shortDesc: "A $5 gift card to Copper Cup Coffee in Ironwood, MI",
      fullDesc: "Redeem 5,000 JCMOVES for a $5 gift card to Copper Cup Coffee — your local coffee spot right here in Ironwood. Choose free local pickup or have it delivered.",
      tokenPrice: 5000, cashValue: "5.00", status: "active", featured: true, inventory: 50,
      deliveryType: "manual", requiresApproval: true, expirationDays: 365, promoBadge: "Most Popular",
      fulfillmentNote: "Choose FREE local pickup in Ironwood, MI — or request home delivery (+1,000 JCMOVES, admin will confirm). We'll contact you within 24 hours.",
      adminNotes: "Issue $5 Copper Cup gift card. Ask customer: free local pickup OR ship to home (+1K JCMOVES). Contact within 24 hours.",
    },

    // ── ⚡ Quantum Spin ───────────────────────────────────────────────────────
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Quantum Spin Entry",
      shortDesc: "One free spin on the Quantum Spin prize machine",
      fullDesc: "Buy one Quantum Spin entry and spin without spending from your wallet. Prizes include token jackpots, coupons, coffee gift cards, and mystery rewards. Jackpots grow every spin.",
      tokenPrice: 100, cashValue: "1.00", status: "active", featured: true,
      deliveryType: "digital_code", createsSpinCredit: true, isInstant: true,
      maxPerUser: 100, maxPerMonth: 50, promoBadge: "⚡ Instant",
      fulfillmentNote: "Your spin credit is added instantly. Open the Quantum Spin wheel and it will appear automatically.",
      adminNotes: "Spin credit auto-issued via reward_entitlements. No manual action needed.",
    },
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Quantum Spin — 5 Pack",
      shortDesc: "5 spins for the price of 4.5 — 10% bundle discount",
      fullDesc: "Get 5 Quantum Spin entries for 450 JCMOVES — saving 50 tokens vs. buying individually. Spins are added instantly and can be used anytime.",
      tokenPrice: 450, cashValue: "4.50", status: "active", featured: false,
      deliveryType: "digital_code", createsSpinCredit: true, isInstant: true,
      maxPerUser: 50, maxPerMonth: 20, promoBadge: "10% Off",
      fulfillmentNote: "5 spin credits added instantly to your account.",
      adminNotes: "Auto-issue 5 spin credits via reward_entitlements.",
    },
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Quantum Spin — 10 Pack",
      shortDesc: "10 spins, 15% bundle discount — 850 JCMOVES",
      fullDesc: "10 Quantum Spin entries for 850 JCMOVES — saving 150 tokens. The more you bundle, the more you save. Spins are instant.",
      tokenPrice: 850, cashValue: "8.50", status: "active", featured: false,
      deliveryType: "digital_code", createsSpinCredit: true, isInstant: true,
      maxPerUser: 30, maxPerMonth: 10, promoBadge: "15% Off",
      fulfillmentNote: "10 spin credits added instantly.",
      adminNotes: "Auto-issue 10 spin credits via reward_entitlements.",
    },
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Quantum Spin — 25 Pack",
      shortDesc: "25 spins, 20% bundle discount — 2,000 JCMOVES",
      fullDesc: "25 Quantum Spin entries for 2,000 JCMOVES — saving 500 tokens. Best value for frequent spinners. All 25 spins added instantly.",
      tokenPrice: 2000, cashValue: "20.00", status: "active", featured: false,
      deliveryType: "digital_code", createsSpinCredit: true, isInstant: true,
      maxPerUser: 20, maxPerMonth: 5, promoBadge: "20% Off",
      fulfillmentNote: "25 spin credits added instantly.",
      adminNotes: "Auto-issue 25 spin credits via reward_entitlements.",
    },
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Quantum Spin — 50 Pack",
      shortDesc: "50 spins, 25% bundle discount — 3,750 JCMOVES",
      fullDesc: "50 Quantum Spin entries for 3,750 JCMOVES — saving 1,250 tokens. High-volume token burn with massive prize potential.",
      tokenPrice: 3750, cashValue: "37.50", status: "active", featured: false,
      deliveryType: "digital_code", createsSpinCredit: true, isInstant: true,
      maxPerUser: 10, maxPerMonth: 3, promoBadge: "25% Off",
      fulfillmentNote: "50 spin credits added instantly.",
      adminNotes: "Auto-issue 50 spin credits via reward_entitlements.",
    },
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Quantum Spin — 100 Pack",
      shortDesc: "100 spins, 30% bundle discount — 7,000 JCMOVES",
      fullDesc: "The ultimate spin bundle — 100 Quantum Spin entries for 7,000 JCMOVES. Save 3,000 tokens vs. buying one at a time. Jackpot-chasing starts here.",
      tokenPrice: 7000, cashValue: "70.00", status: "active", featured: false,
      deliveryType: "digital_code", createsSpinCredit: true, isInstant: true,
      maxPerUser: 5, maxPerMonth: 2, promoBadge: "30% Off",
      fulfillmentNote: "100 spin credits added instantly.",
      adminNotes: "Auto-issue 100 spin credits via reward_entitlements.",
    },
    {
      categoryId: catMap["⚡ Quantum Spin"],
      name: "Mystery Reward Box",
      shortDesc: "Surprise token reward — unwrap something good",
      fullDesc: "Spend 300 JCMOVES and unwrap a mystery token reward. Could be 100 tokens, could be much more. The contents are randomized and revealed instantly.",
      tokenPrice: 300, cashValue: "3.00", status: "active", featured: true,
      deliveryType: "digital_code", isInstant: true, usesMysteryPool: true, promoBadge: "🎲 Mystery",
      fulfillmentNote: "Mystery reward amount revealed instantly and credited to your wallet.",
      adminNotes: "Mystery reward auto-paid from pool logic. Check mystery_pool config if needed.",
    },

    // ── 🎟️ Discount Coupons ──────────────────────────────────────────────────
    {
      categoryId: catMap["🎟️ Discount Coupons"],
      name: "10% Off Your Next Service",
      shortDesc: "Auto-generated coupon — up to $25 off any job",
      fullDesc: "Redeem 12,500 JCMOVES for 10% off your next service — up to $25 in savings. A unique promo code is generated instantly and stored in your Redemptions tab.",
      tokenPrice: 12500, cashValue: "25.00", status: "active", featured: true,
      deliveryType: "digital_code", isInstant: true, createsCouponCode: true,
      couponDiscountPct: 10, couponMaxDiscount: "25.00", expirationDays: 365, promoBadge: "Instant",
      fulfillmentNote: "Promo code generated instantly. Valid for 1 year — 10% off any service, up to $25.",
      adminNotes: "Promo code auto-generated. 10% off, max $25. Check promo_codes table.",
    },
    {
      categoryId: catMap["🎟️ Discount Coupons"],
      name: "20% Off Your Next Service",
      shortDesc: "Auto-generated coupon — up to $50 off any job",
      fullDesc: "Redeem 20,000 JCMOVES for 20% off your next service — up to $50 savings. Promo code generated instantly, valid for one year.",
      tokenPrice: 20000, cashValue: "50.00", status: "active", featured: true,
      deliveryType: "digital_code", isInstant: true, createsCouponCode: true,
      couponDiscountPct: 20, couponMaxDiscount: "50.00", expirationDays: 365, promoBadge: "Best Deal",
      fulfillmentNote: "Promo code generated instantly. Valid for 1 year — 20% off any service, up to $50.",
      adminNotes: "Promo code auto-generated. 20% off, max $50. Check promo_codes table.",
    },

    // ── 🛠️ Service Credits ────────────────────────────────────────────────────
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "15-Minute Labor Credit",
      shortDesc: "15 extra minutes of professional moving crew",
      fullDesc: "Redeem 5,000 JCMOVES for 15 minutes of labor credit on any booked job. Perfect for a bit of extra help at the end of a move.",
      tokenPrice: 5000, cashValue: "25.00", status: "active", featured: false,
      deliveryType: "service_credit", createsServiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: null,
      fulfillmentNote: "15-minute labor credit applied to your next invoice. Valid 6 months.",
      adminNotes: "Add 15 min labor credit to service invoice. Confirm with redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "30-Minute Labor Credit",
      shortDesc: "30 extra minutes of professional moving crew",
      fullDesc: "Redeem 10,000 JCMOVES for 30 minutes of labor credit on any booked job.",
      tokenPrice: 10000, cashValue: "50.00", status: "active", featured: false,
      deliveryType: "service_credit", createsServiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: null,
      fulfillmentNote: "30-minute labor credit applied to your next invoice. Valid 6 months.",
      adminNotes: "Add 30 min labor credit to service invoice. Confirm with redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "1-Hour Labor Credit",
      shortDesc: "Full hour of professional moving crew labor — free",
      fullDesc: "Redeem 20,000 JCMOVES for 1 full hour of crew labor on any booked job. Stack it with other credits for a bigger discount.",
      tokenPrice: 20000, cashValue: "100.00", status: "active", featured: false,
      deliveryType: "service_credit", createsServiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: "Most Used",
      fulfillmentNote: "1-hour labor credit applied to your next invoice. Valid 6 months.",
      adminNotes: "Add 1 hr labor credit to service invoice. Confirm with redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "$25 Off Moving Service",
      shortDesc: "Apply $25 directly off your next move",
      fullDesc: "Redeem 25,000 JCMOVES for $25 off any moving service. Applied to your invoice at time of booking.",
      tokenPrice: 25000, cashValue: "25.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: null,
      fulfillmentNote: "$25 applied to your service invoice. Valid 6 months.",
      adminNotes: "Deduct $25 from service invoice. Reference redemption ID. Valid 180 days.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "$50 Off Moving Service",
      shortDesc: "Apply $50 directly off your next move",
      fullDesc: "Redeem 50,000 JCMOVES for $50 off any moving or junk removal service.",
      tokenPrice: 50000, cashValue: "50.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: "Popular",
      fulfillmentNote: "$50 applied to your service invoice. Valid 6 months.",
      adminNotes: "Deduct $50 from service invoice. Reference redemption ID. Valid 180 days.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "$75 Off Moving Service",
      shortDesc: "Apply $75 directly off your next move or project",
      fullDesc: "Redeem 75,000 JCMOVES for $75 off any moving or junk removal service. Great for larger jobs.",
      tokenPrice: 75000, cashValue: "75.00", status: "active", featured: true,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: "High Value",
      fulfillmentNote: "$75 applied to your service invoice. Valid 6 months.",
      adminNotes: "Deduct $75 from service invoice. Reference redemption ID. Valid 180 days.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "1-Hour Travel Rate Credit",
      shortDesc: "Cover 1 hour of travel time for longer-distance jobs",
      fullDesc: "Redeem 50,000 JCMOVES to cover 1 hour of travel time. Perfect for jobs outside the Ironwood area — our crew drives to you, and this covers the travel cost.",
      tokenPrice: 50000, cashValue: "75.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true,
      expirationDays: 365, promoBadge: "Travel",
      fulfillmentNote: "1-hour travel credit applied to your invoice. Mention this at booking.",
      adminNotes: "Deduct 1hr travel cost from invoice. Reference redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "2-Hour Travel Rate Credit",
      shortDesc: "Cover 2 hours of travel time for distant jobs",
      fullDesc: "Redeem 100,000 JCMOVES to cover 2 hours of travel time on any job. Best for longer-distance moves in the UP or Northern Wisconsin.",
      tokenPrice: 100000, cashValue: "150.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true,
      expirationDays: 365, promoBadge: "Travel",
      fulfillmentNote: "2-hour travel credit applied to your invoice. Mention this at booking.",
      adminNotes: "Deduct 2hr travel cost from invoice. Reference redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "10-Window Wash — Free Session",
      shortDesc: "One residential window-cleaning session, up to 10 windows",
      fullDesc: "Redeem 50,000 JCMOVES for a free residential window-cleaning session covering up to 10 windows. Admin schedules the appointment and will reach out to confirm a date that works for you.",
      tokenPrice: 50000, cashValue: "150.00", status: "active", featured: false,
      deliveryType: "service_credit", requiresApproval: true, requiresSchedule: true,
      expirationDays: 365, promoBadge: null,
      fulfillmentNote: "Admin will contact you to schedule your window-cleaning session (up to 10 windows). Approval required before scheduling.",
      adminNotes: "Schedule 10-window residential wash. Confirm date with customer before booking. Approval required.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "1 Month of Trash Valet — Free",
      shortDesc: "One free month of weekly door-step trash pickup",
      fullDesc: "Redeem 30,000 JCMOVES for one free month of our weekly door-step trash valet subscription. Admin applies the credit directly to your subscription — no hassle, just show up at your door.",
      tokenPrice: 30000, cashValue: "79.99", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresApproval: true,
      expirationDays: 365, promoBadge: null,
      fulfillmentNote: "Admin will apply a one-month subscription credit to your trash valet account within 24 hours.",
      adminNotes: "Apply 1-month trash valet subscription credit to customer account. Confirm with redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "Handyman Deposit — Long Distance or 2× Local",
      shortDesc: "$150 deposit credit toward one long-distance or two local handyman jobs",
      fullDesc: "Redeem 50,000 JCMOVES for a $150 deposit credit redeemable toward one long-distance handyman call or two separate local handyman jobs. Credit expires 6 months from redemption date.",
      tokenPrice: 50000, cashValue: "150.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true,
      expirationDays: 180, promoBadge: null,
      fulfillmentNote: "$150 deposit credit applied toward your handyman job(s). Valid 6 months — covers one long-distance job or two local jobs.",
      adminNotes: "Apply $150 handyman deposit credit. Usable for 1 long-distance job or 2 local jobs. Expires 6 months from redemption. Reference redemption ID.",
    },
    {
      categoryId: catMap["🛠️ Service Credits"],
      name: "Tiny Junk Removal ≤ 300 lbs (Local)",
      shortDesc: "One local small-load junk haul, up to ~300 lbs",
      fullDesc: "Redeem 60,000 JCMOVES for one local small-load junk removal job — up to approximately 300 lbs. Excludes refrigerators, mattresses, TVs, and tires. Admin confirms the load details before scheduling.",
      tokenPrice: 60000, cashValue: "150.00", status: "active", featured: false,
      deliveryType: "service_credit", requiresApproval: true, requiresSchedule: true,
      expirationDays: 365, promoBadge: null,
      fulfillmentNote: "Admin will confirm your junk load details before scheduling. Excludes refrigerators, mattresses, TVs, and tires. Local area only.",
      adminNotes: "Small junk removal, max ~300 lbs. CONFIRM load contents before scheduling — no fridges, mattresses, TVs, or tires. Local only. Admin approval required.",
    },

    // ── 🎁 Gift Cards ─────────────────────────────────────────────────────────
    {
      categoryId: catMap["🎁 Gift Cards"],
      name: "$20 Pizza Card (Domino's or Little Caesars)",
      shortDesc: "Domino's or Little Caesars — your choice",
      fullDesc: "Redeem 30,000 JCMOVES for a $20 pizza gift card. You choose: Domino's or Little Caesars. Digital code or physical card.",
      tokenPrice: 30000, cashValue: "20.00", status: "active", featured: false,
      deliveryType: "manual", requiresApproval: true, expirationDays: 365, promoBadge: "Fan Favorite",
      fulfillmentNote: "Admin contacts you within 24 hours — Domino's or Little Caesars? Digital or physical card.",
      adminNotes: "Contact customer: Domino's or Little Caesars? Issue $20 gift card. Confirm within 24 hours.",
    },
    {
      categoryId: catMap["🎁 Gift Cards"],
      name: "$35 Prepaid Visa",
      shortDesc: "Use it anywhere Visa is accepted",
      fullDesc: "Redeem 50,000 JCMOVES for a $35 Prepaid Visa — spend it anywhere Visa is accepted. Shipped to your address within 3–5 days.",
      tokenPrice: 50000, cashValue: "35.00", status: "active", featured: false,
      deliveryType: "manual", requiresApproval: true, expirationDays: 365, promoBadge: "Spend Anywhere",
      fulfillmentNote: "Admin ships a $35 Prepaid Visa to your address within 3–5 business days.",
      adminNotes: "Issue $35 Prepaid Visa. Get mailing address. Ship within 3–5 business days.",
    },
    {
      categoryId: catMap["🎁 Gift Cards"],
      name: "$35 Gas Card",
      shortDesc: "Fill up on us — 50,000 JCMOVES well spent",
      fullDesc: "Redeem 50,000 JCMOVES for a $35 gas gift card. Works at most major gas stations. Physical card shipped to your address.",
      tokenPrice: 50000, cashValue: "35.00", status: "active", featured: false,
      deliveryType: "manual", requiresApproval: true, expirationDays: 365,
      fulfillmentNote: "Admin ships your $35 gas card within 3–5 business days.",
      adminNotes: "Issue $35 gas card. Confirm preferred station brand. Ship within 3–5 days.",
    },
    {
      categoryId: catMap["🎁 Gift Cards"],
      name: "$75 Gas or Prepaid Visa (You Pick)",
      shortDesc: "Your choice — $75 to spend your way",
      fullDesc: "Redeem 100,000 JCMOVES and pick your reward: a $75 gas card or a $75 Prepaid Visa. Two options, one serious payout.",
      tokenPrice: 100000, cashValue: "75.00", status: "active", featured: false,
      deliveryType: "manual", requiresApproval: true, expirationDays: 365, maxPerUser: 2, promoBadge: "Premium",
      fulfillmentNote: "Admin contacts you — Gas Card or Prepaid Visa? Your $75 card ships within 3–5 days.",
      adminNotes: "HIGH VALUE. Contact customer: Gas Card or Prepaid Visa? Issue $75. Ship 3–5 days. Confirm with Darrell.",
    },

    // ── 🚛 Premium Moving ─────────────────────────────────────────────────────
    {
      categoryId: catMap["🚛 Premium Moving"],
      name: "2 Movers · 1 Hour (Local)",
      shortDesc: "Our crew, 1 hour of labor — free in the Ironwood area",
      fullDesc: "Redeem 60,000 JCMOVES for 2 movers working for 1 full hour at no labor charge. Local Ironwood area jobs — completely free. Outside the area? You cover travel; the labor is on us.",
      tokenPrice: 60000, cashValue: "150.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true, requiresApproval: true,
      expirationDays: 365, maxPerUser: 3, promoBadge: "Free Labor",
      fulfillmentNote: "2 movers, 1 hour — free labor. Local Ironwood: fully free. Farther away: travel time only. Admin approval required.",
      adminNotes: "2-mover, 1-hr labor booking. Local = fully free. Non-local = customer pays travel. Confirm with Darrell.",
    },
    {
      categoryId: catMap["🚛 Premium Moving"],
      name: "2 Movers · 2 Hours (Local)",
      shortDesc: "2 movers, 2 full hours — the classic moving package",
      fullDesc: "Redeem 100,000 JCMOVES for 2 movers, 2 hours — no labor charge. Our most popular moving package, completely free for loyal customers. Local area moves only; travel extra for longer distances.",
      tokenPrice: 100000, cashValue: "300.00", status: "active", featured: true,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true, requiresApproval: true,
      expirationDays: 365, maxPerUser: 2, promoBadge: "⭐ Most Popular",
      fulfillmentNote: "2 movers, 2 hours — free labor. Local Ironwood: fully free. Farther: travel time only. Admin approval required.",
      adminNotes: "PREMIUM. 2-mover, 2-hr booking. Local = free. Non-local = customer pays travel. Confirm with Darrell.",
    },
    {
      categoryId: catMap["🚛 Premium Moving"],
      name: "2 Movers · 4 Hours (Bundle Deal)",
      shortDesc: "Half-day move — 10% bundle discount built in",
      fullDesc: "Redeem 400,000 JCMOVES for 2 movers working 4 hours. That's a 10% bundle discount — you save vs. booking two separate 2-hour slots. Perfect for a half-day local move.",
      tokenPrice: 400000, cashValue: "550.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true, requiresApproval: true,
      expirationDays: 365, maxPerUser: 2, promoBadge: "Bundle Discount",
      fulfillmentNote: "2 movers, 4 hours — free labor with 10% bundle savings. Admin approval required before scheduling.",
      adminNotes: "PREMIUM. 2-mover, 4-hr booking. Bundle pricing. Confirm with Darrell before scheduling.",
    },
    {
      categoryId: catMap["🚛 Premium Moving"],
      name: "2 Movers · 6 Hours",
      shortDesc: "6-hour crew session — ideal for full apartment or small house",
      fullDesc: "Redeem 600,000 JCMOVES for 2 movers working 6 hours. Built-in bundle discount over the 4-hour rate. Enough time to handle a full 1–2 bedroom apartment or a smaller home.",
      tokenPrice: 600000, cashValue: "800.00", status: "active", featured: false,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true, requiresApproval: true,
      expirationDays: 365, maxPerUser: 1, promoBadge: "6-Hour Block",
      fulfillmentNote: "2 movers, 6 hours — free labor. Admin approval required. Schedule at least 5 days out.",
      adminNotes: "PREMIUM. 2-mover, 6-hr booking. Confirm availability and travel with Darrell.",
    },
    {
      categoryId: catMap["🚛 Premium Moving"],
      name: "Full Day Movers + Travel Included",
      shortDesc: "The ultimate reward — a full moving day on us",
      fullDesc: "The jackpot redemption. 1,000,000 JCMOVES gets you a full day of moving service with travel included — wherever you are. 2 movers, full day, travel covered. This is our way of saying you're a legend.",
      tokenPrice: 1000000, cashValue: "1500.00", status: "active", featured: true,
      deliveryType: "service_credit", createsInvoiceCredit: true, requiresSchedule: true, requiresApproval: true,
      expirationDays: 365, maxPerUser: 1, promoBadge: "🏆 Jackpot Reward",
      fulfillmentNote: "Full moving day — 2 movers, all day, travel included. Admin approval required. Schedule minimum 2 weeks out.",
      adminNotes: "JACKPOT PRIZE. Full day booking + travel. Verify customer identity and schedule with Darrell minimum 2 weeks ahead. Confirm before posting to calendar.",
    },
  ];
}

export async function seedRewardShop() {
  try {
    const existing = await db.select({ count: sql<number>`count(*)` }).from(rewardCategories);
    if (Number(existing[0]?.count) > 0) {
      console.log("✅ Reward shop already seeded — skipping");
      return;
    }
    console.log("🌱 Seeding JCMOVES Rewards Marketplace...");
    const cats = await db.insert(rewardCategories).values(CATEGORIES).returning();
    const catMap: Record<string, number> = {};
    for (const c of cats) catMap[c.name] = c.id;
    const items = buildItems(catMap);
    await db.insert(rewardItems).values(items as any);
    console.log(`✅ Seeded ${CATEGORIES.length} categories and ${items.length} reward items`);
  } catch (err) {
    console.error("Error seeding reward shop:", err);
  }
}

export async function resetRewardCatalog(): Promise<{ hidden: number; inserted: number }> {
  const hiddenRows = await db
    .update(rewardItems)
    .set({ status: "hidden", updatedAt: new Date() })
    .returning({ id: rewardItems.id });
  const hiddenCount = hiddenRows.length;

  const existingCats = await db.select().from(rewardCategories);
  let catMap: Record<string, number> = {};
  for (const c of existingCats) catMap[c.name] = c.id;

  for (const cat of CATEGORIES) {
    if (!catMap[cat.name]) {
      const [inserted] = await db.insert(rewardCategories).values(cat).returning();
      catMap[cat.name] = inserted.id;
    }
  }

  const items = buildItems(catMap);
  const inserted = await db.insert(rewardItems).values(items as any).returning();
  console.log(`🔄 Catalog reset — hid ${hiddenCount} old items, inserted ${inserted.length} official items`);
  return { hidden: hiddenCount, inserted: inserted.length };
}
