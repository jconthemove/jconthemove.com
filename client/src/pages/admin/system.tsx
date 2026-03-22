import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminSystemCheckPage from "@/pages/admin-system-check";
import AdminSquareCatalogPage from "@/pages/admin-square-catalog";
import AdminPromoCodesPage from "@/pages/admin-promo-codes";
import AdminQuoteReviewPage from "@/pages/admin-quote-review";
import PendingQuotesPage from "@/pages/pending-quotes";

export default function AdminSystemPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">System</h1>
          <p className="text-slate-400 text-sm">System health, Square catalog, and configuration</p>
        </div>
        <Tabs defaultValue="check">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-6 flex-wrap">
            <TabsTrigger value="check" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">System Check</TabsTrigger>
            <TabsTrigger value="square" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Square Catalog</TabsTrigger>
            <TabsTrigger value="promos" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Promo Codes</TabsTrigger>
            <TabsTrigger value="quotes" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Quote Review</TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Pending Quotes</TabsTrigger>
          </TabsList>
          <TabsContent value="check">
            <AdminSystemCheckPage />
          </TabsContent>
          <TabsContent value="square">
            <AdminSquareCatalogPage />
          </TabsContent>
          <TabsContent value="promos">
            <AdminPromoCodesPage />
          </TabsContent>
          <TabsContent value="quotes">
            <AdminQuoteReviewPage />
          </TabsContent>
          <TabsContent value="pending">
            <PendingQuotesPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
