import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminPipelinePage from "@/pages/admin-pipeline";
import LeadsPage from "@/pages/leads";

export default function AdminJobsPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Jobs & Pipeline</h1>
          <p className="text-slate-400 text-sm">All leads and job pipeline management</p>
        </div>
        <Tabs defaultValue="pipeline">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-6">
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Pipeline</TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">All Leads</TabsTrigger>
          </TabsList>
          <TabsContent value="pipeline">
            <AdminPipelinePage />
          </TabsContent>
          <TabsContent value="leads">
            <LeadsPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
