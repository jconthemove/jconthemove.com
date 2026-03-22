import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminRewardShopPage from "@/pages/admin-reward-shop";
import AdminLotteryPage from "@/pages/admin-lottery";
import RewardsMarketplacePage from "@/pages/rewards-marketplace";

export default function AdminMarketplacePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Marketplace</h1>
          <p className="text-slate-400 text-sm">Reward shop and lottery management</p>
        </div>
        <Tabs defaultValue="shop">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-6 flex-wrap">
            <TabsTrigger value="shop" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Reward Catalog</TabsTrigger>
            <TabsTrigger value="lottery" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Lottery</TabsTrigger>
            <TabsTrigger value="view" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">View Marketplace</TabsTrigger>
          </TabsList>
          <TabsContent value="shop">
            <AdminRewardShopPage />
          </TabsContent>
          <TabsContent value="lottery">
            <AdminLotteryPage />
          </TabsContent>
          <TabsContent value="view">
            <RewardsMarketplacePage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
