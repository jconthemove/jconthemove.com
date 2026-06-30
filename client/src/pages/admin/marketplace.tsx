import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminRewardShopPage from "@/pages/admin-reward-shop";
import AdminLotteryPage from "@/pages/admin-lottery";
import RewardsMarketplacePage from "@/pages/rewards-marketplace";
import MarketplaceZonePricingPage from "@/pages/admin/marketplace-zone-pricing";
import AuthorityTasksCard from "@/components/AuthorityTasksCard";
import MarketplaceActionMatrix from "@/components/MarketplaceActionMatrix";
import MarketplaceNextStepFlow from "@/components/MarketplaceNextStepFlow";
import MarketplaceSmartBookingEngine from "@/components/MarketplaceSmartBookingEngine";
import MarketplaceTaskSplit from "@/components/MarketplaceTaskSplit";

const flowCards = [
  ["1", "Start", "Capture every request as a lead card."],
  ["2", "Progress", "Quote, approve, assign, and invoice."],
  ["3", "Finish", "Complete, pay, reward, review, and rebook."],
] as const;

export default function AdminMarketplacePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Marketplace</h1>
            <p className="text-slate-400 text-sm">Start requests, price zones, assign work, and close rewards from one simple hub.</p>
          </div>
          <a
            href="/admin/marketplace-playbook"
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-blue-500/30 bg-blue-600/15 px-4 text-sm font-bold text-blue-200 hover:bg-blue-600/25"
          >
            Open playbook
          </a>
        </div>
        <Tabs defaultValue="flow">
          <TabsList className="mb-6 grid w-full grid-cols-4 border border-slate-700/50 bg-slate-800/50">
            <TabsTrigger value="flow" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Flow</TabsTrigger>
            <TabsTrigger value="zones" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Zones</TabsTrigger>
            <TabsTrigger value="rewards" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Rewards</TabsTrigger>
            <TabsTrigger value="preview" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="flow" className="space-y-5">
            <section className="grid gap-3 md:grid-cols-3">
              {flowCards.map(([number, title, detail]) => (
                <div key={number} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">
                    {number}
                  </div>
                  <h2 className="mt-3 text-sm font-black text-white">{title}</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-400">{detail}</p>
                </div>
              ))}
            </section>
            <AuthorityTasksCard />
            <MarketplaceNextStepFlow compact />
            <MarketplaceTaskSplit compact />
            <MarketplaceActionMatrix compact rail="all" limit={9} />
            <MarketplaceSmartBookingEngine />
          </TabsContent>
          <TabsContent value="zones">
            <MarketplaceZonePricingPage />
          </TabsContent>
          <TabsContent value="rewards" className="space-y-8">
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Catalog</h2>
              <AdminRewardShopPage />
            </section>
            <section>
              <h2 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Lottery</h2>
              <AdminLotteryPage />
            </section>
          </TabsContent>
          <TabsContent value="preview">
            <RewardsMarketplacePage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
