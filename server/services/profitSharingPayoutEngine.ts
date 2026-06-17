import {
  DEFAULT_PROFIT_SHARE_SETTINGS,
  type ProfitShareJobInput,
  type ProfitSharePayoutPreview,
  type ProfitShareRole,
  type ProfitShareSettings,
} from "@shared/jobPayout";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeProfitShareSettings(settings?: Partial<ProfitShareSettings> | null): ProfitShareSettings {
  return {
    ...DEFAULT_PROFIT_SHARE_SETTINGS,
    ...(settings || {}),
  };
}

export function defaultHourlyRateForRole(role: ProfitShareRole, settings: ProfitShareSettings): number {
  if (role === "lead_mover") return settings.leadMoverHourlyRate;
  if (role === "helper") return settings.helperHourlyRate;
  return settings.moverHourlyRate;
}

export function defaultBonusWeightsForCrew(roles: ProfitShareRole[]): number[] {
  const count = roles.length;
  if (count === 2) return roles.map((role) => (role === "lead_mover" ? 60 : 40));
  if (count === 3) {
    let moverSeen = false;
    return roles.map((role) => {
      if (role === "lead_mover") return 45;
      if (role === "helper") return 20;
      if (!moverSeen) {
        moverSeen = true;
        return 35;
      }
      return 20;
    });
  }
  if (count === 4) {
    let moverCount = 0;
    return roles.map((role) => {
      if (role === "lead_mover") return 40;
      if (role === "helper") return 15;
      moverCount += 1;
      return moverCount === 1 ? 25 : 20;
    });
  }

  const equal = count > 0 ? roundRatio(100 / count) : 0;
  return roles.map(() => equal);
}

export function calculateProfitSharingPayout(input: ProfitShareJobInput): ProfitSharePayoutPreview {
  const settings = normalizeProfitShareSettings(input.settings);
  const grossRevenue = roundMoney(Math.max(0, asFiniteNumber(input.grossRevenue)));
  const dumpFees = roundMoney(Math.max(0, asFiniteNumber(input.dumpFees)));
  const otherExpenses = roundMoney(Math.max(0, asFiniteNumber(input.otherExpenses)));

  const workers = input.workers.map((worker) => ({
    ...worker,
    hourlyRate: roundMoney(Math.max(0, asFiniteNumber(worker.hourlyRate, defaultHourlyRateForRole(worker.roleOnJob, settings)))),
    hoursWorked: roundMoney(Math.max(0, asFiniteNumber(worker.hoursWorked))),
    bonusWeight: Math.max(0, asFiniteNumber(worker.bonusWeight)),
  }));

  const guaranteedLaborTotal = roundMoney(
    workers.reduce((sum, worker) => sum + worker.hourlyRate * worker.hoursWorked, 0),
  );
  const totalLaborHours = roundMoney(workers.reduce((sum, worker) => sum + worker.hoursWorked, 0));

  const fuelReserve = roundMoney(grossRevenue * settings.fuelReservePct);
  const vehicleReserve = roundMoney(grossRevenue * settings.vehicleReservePct);
  const insuranceReserve = roundMoney(grossRevenue * settings.insuranceReservePct);
  const processingFees = roundMoney(grossRevenue * settings.processingFeePct);
  const totalExpensesAndReserves = roundMoney(
    fuelReserve + vehicleReserve + insuranceReserve + processingFees + dumpFees + otherExpenses,
  );
  const netJobProfit = roundMoney(grossRevenue - guaranteedLaborTotal - totalExpensesAndReserves);
  const positiveProfit = Math.max(0, netJobProfit);
  const hasReferral = !!input.referralPartnerId;

  const referralPayout = hasReferral ? roundMoney(positiveProfit * settings.referralPct) : 0;
  const growthFund = roundMoney(positiveProfit * settings.growthFundPct);
  const crewBonusPool = roundMoney(positiveProfit * settings.crewBonusPct);
  const companyReferralFallback = hasReferral ? 0 : roundMoney(positiveProfit * settings.referralPct);
  const companyProfit = roundMoney(
    netJobProfit < 0
      ? netJobProfit
      : positiveProfit * settings.companyProfitPct + companyReferralFallback,
  );

  const totalBonusWeight = workers.reduce((sum, worker) => sum + worker.bonusWeight, 0);
  const workerPayouts = workers.map((worker) => {
    const hourlyPay = roundMoney(worker.hourlyRate * worker.hoursWorked);
    const bonusPay = totalBonusWeight > 0 ? roundMoney(crewBonusPool * (worker.bonusWeight / totalBonusWeight)) : 0;
    const totalPay = roundMoney(hourlyPay + bonusPay);
    return {
      ...worker,
      hourlyPay,
      bonusPay,
      totalPay,
      jcmovesRewardAmount: roundMoney(totalPay * settings.rewardPointsPerDollarEarned),
    };
  });

  const notes: string[] = [];
  if (!hasReferral && positiveProfit > 0) {
    notes.push("No referral partner is attached; referral share rolls into company profit.");
  }
  if (netJobProfit <= 0) {
    notes.push("Net job profit is zero or negative; final non-hourly payouts require admin override.");
  }
  if (totalBonusWeight <= 0 && crewBonusPool > 0) {
    notes.push("Crew bonus pool is available but no bonus weights are assigned.");
  }

  return {
    jobId: input.jobId,
    customerName: input.customerName,
    jobType: input.jobType,
    status: input.status,
    grossRevenue,
    guaranteedLaborTotal,
    fuelReserve,
    vehicleReserve,
    insuranceReserve,
    processingFees,
    dumpFees,
    otherExpenses,
    totalExpensesAndReserves,
    netJobProfit,
    companyProfit,
    crewBonusPool,
    referralPayout,
    growthFund,
    totalLaborHours,
    profitMarginPct: grossRevenue > 0 ? roundRatio(netJobProfit / grossRevenue) : 0,
    profitPerLaborHour: totalLaborHours > 0 ? roundMoney(netJobProfit / totalLaborHours) : 0,
    referralPartnerId: input.referralPartnerId || null,
    referralPartnerName: input.referralPartnerName || null,
    adminOverrideRequired: netJobProfit <= 0,
    workerPayouts,
    notes,
    settingsSnapshot: settings,
  };
}
