import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { type Lead, type User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, ClipboardList, CheckCircle, UserPlus, Wallet } from "lucide-react";
import EmployeeDashboard from "@/components/employee-dashboard";

// Business Owner Dashboard Component
function BusinessOwnerDashboard() {
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: employees = [] } = useQuery<User[]>({
    queryKey: ["/api/employees"],
  });

  const stats = {
    allLeads: leads.length,
    openLeads: leads.filter(l => ["new","contacted","quoted","available"].includes(l.status)).length,
    confirmedJobs: leads.filter(l => ["confirmed","accepted","in_progress"].includes(l.status)).length,
    completedJobs: leads.filter(l => l.status === "completed").length,
    totalEmployees: employees.length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-orange-500/10 to-blue-600/20 blur-3xl -z-10"></div>
              <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-orange-400 to-blue-400 bg-clip-text text-transparent tracking-tight">
                Business Owner Dashboard
              </h1>
              <p className="text-slate-400 mt-2 text-lg font-medium">Quick access to all business operations</p>
            </div>
            <Link href="/" data-testid="link-back-to-site">
              <Button variant="outline" className="flex items-center gap-2 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-all">
                <ArrowLeft className="h-4 w-4" />
                Back to Site
              </Button>
            </Link>
          </div>
        </div>

        {/* Navigation Cards — Traffic Light System */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {/* All Leads — blue/neutral */}
          <Link href="/leads">
            <Card data-testid="stat-all-leads"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-blue-900/20 hover:border-blue-500/50 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 text-blue-400 p-2.5 rounded-xl group-hover:bg-blue-500/30 transition-colors">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-100">{stats.allLeads}</p>
                    <p className="text-xs text-slate-400 font-medium">All Leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Open Leads — RED 🔴 */}
          <Link href="/leads">
            <Card data-testid="stat-open-leads"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-red-900/40 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-red-900/30 hover:border-red-500/60 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/20 text-red-400 p-2.5 rounded-xl group-hover:bg-red-500/30 transition-colors relative">
                    <ClipboardList className="h-5 w-5" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow shadow-red-500/70" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-red-300">{stats.openLeads}</p>
                    <p className="text-xs text-slate-400 font-medium">Leads / Quotes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Confirmed Jobs — YELLOW 🟡 */}
          <Link href="/leads">
            <Card data-testid="stat-confirmed-jobs"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-yellow-900/40 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-yellow-900/30 hover:border-yellow-500/60 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400"></div>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-yellow-500/20 text-yellow-400 p-2.5 rounded-xl group-hover:bg-yellow-500/30 transition-colors relative">
                    <CheckCircle className="h-5 w-5" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full shadow shadow-yellow-400/70" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-yellow-300">{stats.confirmedJobs}</p>
                    <p className="text-xs text-slate-400 font-medium">Confirmed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Completed Jobs — GREEN 🟢 */}
          <Link href="/leads">
            <Card data-testid="stat-completed-jobs"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-green-900/40 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-green-900/30 hover:border-green-500/60 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500/20 text-green-400 p-2.5 rounded-xl group-hover:bg-green-500/30 transition-colors relative">
                    <CheckCircle className="h-5 w-5" />
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow shadow-green-500/70" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-green-300">{stats.completedJobs}</p>
                    <p className="text-xs text-slate-400 font-medium">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Employees — purple */}
          <Link href="/employees">
            <Card data-testid="stat-employees"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-purple-900/20 hover:border-purple-500/50 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 text-purple-400 p-2.5 rounded-xl group-hover:bg-purple-500/30 transition-colors">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-100">{stats.totalEmployees}</p>
                    <p className="text-xs text-slate-400 font-medium">Employees</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Additional Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/in-god-we-trust">
            <Card className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-blue-900/20 hover:border-blue-500/50 group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500"></div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 text-white p-3 rounded-xl shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                      <Wallet className="h-6 w-6" />
                    </div>
                    <div className="ml-4">
                      <p className="text-xl font-bold text-slate-100">Treasury Management</p>
                      <p className="text-sm text-slate-400">View funding, deposits & transactions</p>
                    </div>
                  </div>
                  <ArrowLeft className="h-5 w-5 text-slate-500 rotate-180 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <BusinessOwnerDashboard />;
  }

  return <EmployeeDashboard />;
}
