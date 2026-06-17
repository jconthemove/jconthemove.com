import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminTreasuryPage from "@/pages/admin-treasury";
import AdminBtcPaymentsPage from "@/pages/admin-btc-payments";
import StakingPage from "@/pages/staking";
import AdminRewardsReconciliationPage from "@/pages/admin/AdminRewardsReconciliationPage";
import AdminJobPayoutsPage from "@/pages/admin/job-payouts";

export default function AdminFinancePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Finance</h1>
          <p className="text-slate-400 text-sm">Treasury, transfers, payouts, and payments</p>
        </div>
        <Tabs defaultValue="treasury">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-6">
            <TabsTrigger value="treasury" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Treasury</TabsTrigger>
            <TabsTrigger value="btc" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">BTC Payments</TabsTrigger>
            <TabsTrigger value="job-payouts" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Job Payouts</TabsTrigger>
            <TabsTrigger value="staking" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Staking</TabsTrigger>
            <TabsTrigger value="reconciliation" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Reconciliation</TabsTrigger>
          </TabsList>
          <TabsContent value="treasury">
            <AdminTreasuryPage />
          </TabsContent>
          <TabsContent value="btc">
            <AdminBtcPaymentsPage />
          </TabsContent>
          <TabsContent value="job-payouts">
            <AdminJobPayoutsPage />
          </TabsContent>
          <TabsContent value="staking">
            <StakingPage />
          </TabsContent>
          <TabsContent value="reconciliation">
            <AdminRewardsReconciliationPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
