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
    pendingQuotes: leads.filter(lead => lead.status === "quoted").length,
    confirmedJobs: leads.filter(lead => lead.status === "confirmed").length,
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

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Link href="/leads">
            <Card 
              data-testid="stat-all-leads" 
              className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-blue-900/20 hover:border-blue-500/50 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-3 rounded-xl shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <p className="text-3xl font-black text-slate-100">{stats.allLeads}</p>
                    <p className="text-slate-400 font-medium">All Leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/pending-quotes">
            <Card 
              data-testid="stat-pending-quotes"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-orange-900/20 hover:border-orange-500/50 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-orange-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-3 rounded-xl shadow-lg shadow-orange-500/25 group-hover:scale-110 transition-transform">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <p className="text-3xl font-black text-slate-100">{stats.pendingQuotes}</p>
                    <p className="text-slate-400 font-medium">Pending Quotes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/leads">
            <Card 
              data-testid="stat-confirmed-jobs"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-green-900/20 hover:border-green-500/50 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-3 rounded-xl shadow-lg shadow-green-500/25 group-hover:scale-110 transition-transform">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <p className="text-3xl font-black text-slate-100">{stats.confirmedJobs}</p>
                    <p className="text-slate-400 font-medium">Confirmed Jobs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/employees">
            <Card 
              data-testid="stat-employees"
              className="cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl hover:shadow-purple-900/20 hover:border-purple-500/50 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-purple-600"></div>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-3 rounded-xl shadow-lg shadow-purple-500/25 group-hover:scale-110 transition-transform">
                    <UserPlus className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <p className="text-3xl font-black text-slate-100">{stats.totalEmployees}</p>
                    <p className="text-slate-400 font-medium">Employees</p>
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

        {/* Quick Stats Summary */}
        <Card className="mt-8 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm shadow-xl overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-orange-500 to-blue-500"></div>
          <CardContent className="p-6">
            <h3 className="text-xl font-bold mb-6 text-slate-100">Quick Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-4xl font-black text-blue-400">{stats.allLeads}</p>
                <p className="text-sm text-slate-400 font-medium mt-1">Total Leads</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-4xl font-black text-orange-400">{stats.pendingQuotes}</p>
                <p className="text-sm text-slate-400 font-medium mt-1">Quoted</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-4xl font-black text-green-400">{stats.confirmedJobs}</p>
                <p className="text-sm text-slate-400 font-medium mt-1">Confirmed</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <p className="text-4xl font-black text-purple-400">{stats.totalEmployees}</p>
                <p className="text-sm text-slate-400 font-medium mt-1">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
