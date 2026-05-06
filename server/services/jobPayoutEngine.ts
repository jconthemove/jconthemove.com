import type { Lead, User } from "@shared/schema";
import {
  DEFAULT_JOB_PAYOUT_SPLIT,
  type JobPayoutPreview,
  type JobPayoutRolePayment,
  type JobPayoutSplit,
  type WorkerPayoutProfile,
} from "@shared/jobPayout";

const WORKER_PROFILES: WorkerPayoutProfile[] = [
  {
    key: "tim",
    name: "Tim",
    minRate: 25,
    maxRate: 35,
    baseWeight: 1.2,
    roles: ["strong_labor"],
    aliases: ["tim", "timothy"],
  },
  {
    key: "bill",
    name: "Bill",
    minRate: 20,
    maxRate: 24,
    baseWeight: 1,
    roles: ["steady_labor", "small_jobs"],
    aliases: ["bill", "william"],
  },
  {
    key: "troy",
    name: "Troy",
    minRate: 20,
    maxRate: 30,
    baseWeight: 1.25,
    roles: ["labor", "suv_driver", "small_trailer"],
    aliases: ["troy"],
  },
  {
    key: "matt",
    name: "Matt",
    minRate: 22,
    maxRate: 25,
    baseWeight: 1.05,
    roles: ["labor", "marketing_training"],
    aliases: ["matt", "matthew"],
  },
  {
    key: "darrell",
    name: "Darrell",
    minRate: 30,
    maxRate: 50,
    baseWeight: 1.4,
    roles: ["owner", "admin", "booking", "labor", "driver", "equipment"],
    aliases: ["darrell", "darryl"],
  },
];

const FALLBACK_EMPLOYEE_PROFILE: WorkerPayoutProfile = {
  key: "default_employee",
  name: "Crew",
  minRate: 20,
  maxRate: 28,
  baseWeight: 1,
  roles: ["labor"],
  aliases: [],
};

type PreviewArgs = {
  lead: Lead;
  crewUsers: User[];
  relatedUsers?: User[];
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeKey(value: string | null | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fullName(user: Pick<User, "firstName" | "lastName">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

function resolveProfile(user: User): WorkerPayoutProfile {
  const keys = [
    normalizeKey(user.id),
    normalizeKey(user.username),
    normalizeKey(user.firstName),
    normalizeKey(fullName(user)),
  ].filter(Boolean);

  for (const profile of WORKER_PROFILES) {
    if (profile.aliases.some((alias) => keys.includes(normalizeKey(alias)))) {
      return profile;
    }
  }

  const isOwnerLike = ["admin", "business_owner"].includes(String(user.role || ""));
  if (isOwnerLike) {
    return {
      ...FALLBACK_EMPLOYEE_PROFILE,
      key: "owner_fallback",
      minRate: 30,
      maxRate: 40,
      baseWeight: 1.25,
      roles: ["owner", "admin", "labor"],
    };
  }

  return FALLBACK_EMPLOYEE_PROFILE;
}

function inferConfirmedHours(lead: Lead): number {
  if (typeof lead.confirmedHours === "number" && lead.confirmedHours > 0) {
    return lead.confirmedHours;
  }

  const detailText = String(lead.details || "");
  const match = detailText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 4;
}

function computeSplit(lead: Lead, referralPercent: number, equipmentPercent: number): JobPayoutSplit {
  const laborPool = DEFAULT_JOB_PAYOUT_SPLIT.laborPool;
  const ownerAdmin = DEFAULT_JOB_PAYOUT_SPLIT.ownerAdmin;
  const mealCultureFund = DEFAULT_JOB_PAYOUT_SPLIT.mealCultureFund;
  const reserveFund = DEFAULT_JOB_PAYOUT_SPLIT.reserveFund;
  const companyProfit = 1 - laborPool - ownerAdmin - mealCultureFund - reserveFund - referralPercent - equipmentPercent;

  return {
    laborPool,
    ownerAdmin,
    companyProfit: Math.max(0, round(companyProfit)),
    referralPool: referralPercent,
    equipmentPool: equipmentPercent,
    mealCultureFund,
    reserveFund,
  };
}

export function buildLeadJobPayoutPreview({ lead, crewUsers, relatedUsers = [] }: PreviewArgs): JobPayoutPreview {
  const jobTotal = Number.parseFloat(String(lead.totalPrice || lead.basePrice || "0")) || 0;
  const confirmedHours = inferConfirmedHours(lead);
  const uniqueUsers = new Map<string, User>();
  for (const user of [...crewUsers, ...relatedUsers]) {
    uniqueUsers.set(user.id, user);
  }

  const ownerAdminUser =
    Array.from(uniqueUsers.values()).find((user) => resolveProfile(user).roles.includes("owner")) ||
    Array.from(uniqueUsers.values()).find((user) => normalizeKey(user.firstName) === "darrell") ||
    null;

  const referralUser = lead.createdByUserId ? uniqueUsers.get(lead.createdByUserId) || null : null;
  const equipmentUsed = lead.truckConfig === "company_truck";
  const equipmentUser =
    equipmentUsed
      ? crewUsers.find((user) => {
          const profile = resolveProfile(user);
          return profile.roles.includes("equipment") || profile.roles.includes("driver");
        }) || ownerAdminUser
      : null;

  const referralPercent = referralUser
    ? (ownerAdminUser && referralUser.id === ownerAdminUser.id ? 0.05 : DEFAULT_JOB_PAYOUT_SPLIT.referralPool)
    : 0;
  const equipmentPercent = equipmentUsed ? DEFAULT_JOB_PAYOUT_SPLIT.equipmentPool : 0;
  const split = computeSplit(lead, referralPercent, equipmentPercent);

  const pools = {
    laborPool: round(jobTotal * split.laborPool),
    ownerAdminPool: round(jobTotal * split.ownerAdmin),
    companyProfitPool: round(jobTotal * split.companyProfit),
    referralPool: round(jobTotal * split.referralPool),
    equipmentPool: round(jobTotal * split.equipmentPool),
    mealCultureFund: round(jobTotal * split.mealCultureFund),
    reserveFund: round(jobTotal * split.reserveFund),
  };

  const crew = crewUsers.map((user) => {
    const profile = resolveProfile(user);
    return {
      user,
      profile,
      weight: profile.baseWeight,
      hoursWorked: confirmedHours,
    };
  });

  const totalWeight = crew.reduce((sum, worker) => sum + worker.weight, 0) || 1;
  let companyProfitRemaining = pools.companyProfitPool;
  let ownerAdminRemaining = pools.ownerAdminPool;
  let reserveRemaining = pools.reserveFund;
  const topUpFunding = {
    fromCompanyProfit: 0,
    fromOwnerAdmin: 0,
    fromReserve: 0,
    uncovered: 0,
  };

  const rolePayouts: JobPayoutRolePayment[] = [];
  if (ownerAdminUser) {
    rolePayouts.push({
      type: "owner_admin",
      recipientId: ownerAdminUser.id,
      recipientName: fullName(ownerAdminUser) || ownerAdminUser.email || "Owner/Admin",
      amount: pools.ownerAdminPool,
      reason: "Booking, admin, and system oversight pool",
    });
    ownerAdminRemaining = 0;
  }

  if (referralUser && pools.referralPool > 0) {
    rolePayouts.push({
      type: "referral",
      recipientId: referralUser.id,
      recipientName: fullName(referralUser) || referralUser.email || "Referral recipient",
      amount: pools.referralPool,
      reason: referralUser.id === ownerAdminUser?.id ? "Darrell-closed job referral layer" : "Worker referral credit",
    });
  }

  if (equipmentUser && pools.equipmentPool > 0) {
    rolePayouts.push({
      type: "equipment",
      recipientId: equipmentUser.id,
      recipientName: fullName(equipmentUser) || equipmentUser.email || "Equipment recipient",
      amount: pools.equipmentPool,
      reason: "Truck, trailer, and equipment use pool",
    });
  }

  const rolePayoutsByWorker = new Map<string, JobPayoutRolePayment[]>();
  for (const payout of rolePayouts) {
    if (!payout.recipientId) continue;
    const list = rolePayoutsByWorker.get(payout.recipientId) || [];
    list.push(payout);
    rolePayoutsByWorker.set(payout.recipientId, list);
  }

  const crewPayouts = crew.map(({ user, profile, weight, hoursWorked }) => {
    const weightedPay = round(pools.laborPool * (weight / totalWeight));
    const minimumPay = round(profile.minRate * hoursWorked);
    let topUpApplied = 0;
    let uncovered = 0;

    if (weightedPay < minimumPay) {
      let needed = round(minimumPay - weightedPay);
      const fromCompany = Math.min(companyProfitRemaining, needed);
      companyProfitRemaining = round(companyProfitRemaining - fromCompany);
      needed = round(needed - fromCompany);
      topUpFunding.fromCompanyProfit = round(topUpFunding.fromCompanyProfit + fromCompany);

      const fromOwnerAdmin = Math.min(ownerAdminRemaining, needed);
      ownerAdminRemaining = round(ownerAdminRemaining - fromOwnerAdmin);
      needed = round(needed - fromOwnerAdmin);
      topUpFunding.fromOwnerAdmin = round(topUpFunding.fromOwnerAdmin + fromOwnerAdmin);

      const fromReserve = Math.min(reserveRemaining, needed);
      reserveRemaining = round(reserveRemaining - fromReserve);
      needed = round(needed - fromReserve);
      topUpFunding.fromReserve = round(topUpFunding.fromReserve + fromReserve);

      topUpApplied = round(fromCompany + fromOwnerAdmin + fromReserve);
      uncovered = round(needed);
      topUpFunding.uncovered = round(topUpFunding.uncovered + uncovered);
    }

    const finalLaborPay = round(weightedPay + topUpApplied);
    const additionalPayouts = rolePayoutsByWorker.get(user.id) || [];
    const additionalTotal = additionalPayouts.reduce((sum, item) => sum + item.amount, 0);

    return {
      workerId: user.id,
      name: fullName(user) || user.email || profile.name,
      hoursWorked,
      minRate: profile.minRate,
      maxRate: profile.maxRate,
      weight,
      roles: profile.roles,
      weightedPay,
      minimumPay,
      topUpApplied,
      finalLaborPay,
      effectiveHourly: hoursWorked > 0 ? round(finalLaborPay / hoursWorked) : 0,
      maxRateExceeded: hoursWorked > 0 ? (finalLaborPay / hoursWorked) > profile.maxRate : false,
      additionalPayouts,
      totalTakeHome: round(finalLaborPay + additionalTotal),
    };
  });

  const retainedPools = {
    companyProfit: round(companyProfitRemaining),
    ownerAdmin: round(ownerAdminRemaining),
    referralPool: referralUser ? 0 : pools.referralPool,
    equipmentPool: equipmentUser ? 0 : pools.equipmentPool,
    mealCultureFund: pools.mealCultureFund,
    reserveFund: round(reserveRemaining),
  };

  const notes = [
    `Customer price stays at $${round(jobTotal).toLocaleString()}; worker pay is split from percentage pools.`,
    `Minimum-pay protection uses company profit first, then owner/admin, then reserve.`,
  ];
  if (!referralUser && pools.referralPool > 0) notes.push("Referral pool is currently retained because no referral recipient was inferred.");
  if (equipmentUsed && !equipmentUser && pools.equipmentPool > 0) notes.push("Equipment pool is currently retained because no equipment recipient was inferred.");
  if (topUpFunding.uncovered > 0) notes.push("At least one worker still sits below the configured minimum after available top-up pools were exhausted.");

  const laborPaid = round(crewPayouts.reduce((sum, worker) => sum + worker.finalLaborPay, 0));
  const rolePaid = round(rolePayouts.reduce((sum, payout) => sum + payout.amount, 0));

  return {
    jobId: lead.id,
    jobTotal: round(jobTotal),
    serviceType: String(lead.serviceType || ""),
    confirmedHours,
    crewCount: crewPayouts.length,
    split,
    pools,
    topUpFunding,
    rolePayouts,
    crewPayouts,
    retainedPools,
    totals: {
      laborPaid,
      rolePaid,
      totalTakeHome: round(crewPayouts.reduce((sum, worker) => sum + worker.totalTakeHome, 0)),
      retainedByCompany: round(Object.values(retainedPools).reduce((sum, value) => sum + value, 0)),
    },
    notes,
  };
}
