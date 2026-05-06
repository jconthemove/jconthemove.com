export type JobPayoutSplit = {
  laborPool: number;
  ownerAdmin: number;
  companyProfit: number;
  referralPool: number;
  equipmentPool: number;
  mealCultureFund: number;
  reserveFund: number;
};

export const DEFAULT_JOB_PAYOUT_SPLIT: JobPayoutSplit = {
  laborPool: 0.45,
  ownerAdmin: 0.10,
  companyProfit: 0.25,
  referralPool: 0.07,
  equipmentPool: 0.08,
  mealCultureFund: 0.03,
  reserveFund: 0.02,
};

export type WorkerPayoutProfile = {
  key: string;
  name: string;
  minRate: number;
  maxRate: number;
  baseWeight: number;
  roles: string[];
  aliases: string[];
};

export type JobPayoutRolePayment = {
  type: "owner_admin" | "referral" | "equipment";
  recipientId: string | null;
  recipientName: string;
  amount: number;
  reason: string;
};

export type JobPayoutWorker = {
  workerId: string;
  name: string;
  hoursWorked: number;
  minRate: number;
  maxRate: number;
  weight: number;
  roles: string[];
  weightedPay: number;
  minimumPay: number;
  topUpApplied: number;
  finalLaborPay: number;
  effectiveHourly: number;
  maxRateExceeded: boolean;
  additionalPayouts: JobPayoutRolePayment[];
  totalTakeHome: number;
};

export type JobPayoutPreview = {
  jobId: string;
  jobTotal: number;
  serviceType: string;
  confirmedHours: number;
  crewCount: number;
  split: JobPayoutSplit;
  pools: {
    laborPool: number;
    ownerAdminPool: number;
    companyProfitPool: number;
    referralPool: number;
    equipmentPool: number;
    mealCultureFund: number;
    reserveFund: number;
  };
  topUpFunding: {
    fromCompanyProfit: number;
    fromOwnerAdmin: number;
    fromReserve: number;
    uncovered: number;
  };
  rolePayouts: JobPayoutRolePayment[];
  crewPayouts: JobPayoutWorker[];
  retainedPools: {
    companyProfit: number;
    ownerAdmin: number;
    referralPool: number;
    equipmentPool: number;
    mealCultureFund: number;
    reserveFund: number;
  };
  totals: {
    laborPaid: number;
    rolePaid: number;
    totalTakeHome: number;
    retainedByCompany: number;
  };
  notes: string[];
};
