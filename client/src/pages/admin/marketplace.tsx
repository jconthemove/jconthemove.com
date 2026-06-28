import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminRewardShopPage from "@/pages/admin-reward-shop";
import AdminLotteryPage from "@/pages/admin-lottery";
import RewardsMarketplacePage from "@/pages/rewards-marketplace";
import MarketplaceZonePricingPage from "@/pages/admin/marketplace-zone-pricing";

export default function AdminMarketplacePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Marketplace</h1>
          <p className="text-slate-400 text-sm">Reward shop, lottery, and zone-priced job marketplace controls</p>
        </div>
        <Tabs defaultValue="zones">
          <TabsList className="mb-6 grid w-full grid-cols-3 border border-slate-700/50 bg-slate-800/50 sm:w-auto">
            <TabsTrigger value="zones" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Zones</TabsTrigger>
            <TabsTrigger value="rewards" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Rewards</TabsTrigger>
            <TabsTrigger value="preview" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Preview</TabsTrigger>
          </TabsList>
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
