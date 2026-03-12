import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Users, Plus, MapPin, Phone, Mail, Calendar,
  Loader2, Search, ChevronRight, Trash2,
  Briefcase, MessageSquare
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { getStatusColors } from "@/lib/job-status";
import QuoteForm from "@/components/QuoteForm";
import type { Lead, User } from "@shared/schema";

const STATUS_OPTIONS = ["all", "new", "quoted", "confirmed", "in_progress", "completed", "cancelled"];

function LeadStatusBadge({ status }: { status: string }) {
  const colors = getStatusColors(status);
  return (
    <Badge variant="outline" className={`text-xs ${colors.text} ${colors.cardBorder}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}

export default function TeamHub() {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = ["admin", "business_owner"].includes(currentUser?.role || "");

  const [activeTab, setActiveTab] = useState("leads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery<User[]>({
    queryKey: ["/api/employees"],
  });

  const { data: quotedLeads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads/status/quoted"],
  });

  const { data: adminStats } = useQuery<{ totalLeads: number; activeJobs: number; totalUsers: number }>({
    queryKey: ["/api/admin/stats"],
    enabled: isAdmin,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/leads/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead deleted" });
      setLeadToDelete(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const response = await apiRequest("PATCH", `/api/users/${id}/role`, { role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Role updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q)) ||
        (l.phone?.includes(q)) ||
        (l.serviceType?.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [leads, statusFilter, search]);

  const activeLeads = leads.filter(l => ["new", "quoted", "confirmed", "in_progress"].includes(l.status));
  const completedToday = leads.filter(l => {
    if (l.status !== "completed") return false;
    const d = new Date(l.createdAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white pb-8">
      <div className="max-w-5xl mx-auto px-4 pt-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white">Team Hub</h1>
            <p className="text-slate-400 text-sm">Welcome back, {currentUser?.firstName}</p>
          </div>
          <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30">
            {currentUser?.role?.replace(/_/g, " ").toUpperCase()}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Active Leads", value: activeLeads.length, color: "text-blue-400" },
            { label: "Total Leads", value: adminStats?.totalLeads ?? leads.length, color: "text-white" },
            { label: "Team Members", value: employees.length, color: "text-green-400" },
            { label: "Pending Quotes", value: quotedLeads.length, color: "text-amber-400" },
          ].map(s => (
            <Card key={s.label} className="border-white/5 bg-white/[0.03]">
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-slate-500 text-xs">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700/50 mb-6">
            <TabsTrigger value="leads" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300 text-xs sm:text-sm">
              <FileText className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Leads</span>
            </TabsTrigger>
            <TabsTrigger value="add" className="data-[state=active]:bg-green-600/20 data-[state=active]:text-green-300 text-xs sm:text-sm">
              <Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Add Lead</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-300 text-xs sm:text-sm">
              <Users className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Team</span>
            </TabsTrigger>
            <TabsTrigger value="quotes" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-300 text-xs sm:text-sm">
              <MessageSquare className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Quotes</span>
              {quotedLeads.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{quotedLeads.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ══ LEADS TAB ══ */}
          <TabsContent value="leads" className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search by name, email, phone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 bg-slate-800/50 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s} value={s} className="text-white capitalize">
                      {s === "all" ? "All Status" : s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {leadsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
            ) : filteredLeads.length === 0 ? (
              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="py-12 text-center">
                  <FileText className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400">No leads found</p>
                  <Button className="mt-4 bg-blue-600 hover:bg-blue-500" onClick={() => setActiveTab("add")}>
                    Add First Lead
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredLeads.map((lead) => (
                  <Card key={lead.id} className="border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="font-semibold text-white text-sm">{lead.firstName} {lead.lastName}</p>
                            <LeadStatusBadge status={lead.status} />
                            {lead.serviceType && (
                              <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 text-xs">{lead.serviceType}</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
                            {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                            {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
                            {lead.moveDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(lead.moveDate).toLocaleDateString()}</span>}
                          </div>
                          {lead.fromAddress && (
                            <div className="flex items-start gap-1 mt-1 text-xs text-slate-500">
                              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="truncate">{lead.fromAddress}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Select
                            value={lead.status}
                            onValueChange={(val) => updateStatusMutation.mutate({ id: lead.id, status: val })}
                          >
                            <SelectTrigger className="w-28 h-7 text-xs bg-slate-700/50 border-slate-600 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {STATUS_OPTIONS.filter(s => s !== "all").map(s => (
                                <SelectItem key={s} value={s} className="text-white text-xs capitalize">
                                  {s.replace(/_/g, " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Link href={`/lead/${lead.id}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                          {isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-slate-600 hover:text-red-400"
                              onClick={() => setLeadToDelete(lead)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Quick action links */}
            {isAdmin && (
              <div className="flex gap-2 flex-wrap pt-2">
                <Link href="/leads">
                  <Button variant="outline" size="sm" className="border-white/10 text-slate-400 hover:text-white">
                    Full Leads View <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
                <Link href="/admin/pipeline">
                  <Button variant="outline" size="sm" className="border-white/10 text-slate-400 hover:text-white">
                    Pipeline View <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            )}
          </TabsContent>

          {/* ══ ADD LEAD TAB ══ */}
          <TabsContent value="add">
            <div className="max-w-xl mx-auto">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">Add New Lead</h2>
                <p className="text-slate-400 text-sm">Create a new service request on behalf of a customer</p>
              </div>
              <QuoteForm
                variant="employee"
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                  setActiveTab("leads");
                  toast({ title: "Lead created!", description: "New service request has been added." });
                }}
              />
            </div>
          </TabsContent>

          {/* ══ TEAM TAB ══ */}
          <TabsContent value="team" className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-white">Team Members ({employees.length})</h2>
              {isAdmin && (
                <Link href="/employee-register">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 font-semibold">
                    <Plus className="h-4 w-4 mr-1" /> Add Member
                  </Button>
                </Link>
              )}
            </div>

            {employeesLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
            ) : employees.length === 0 ? (
              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="py-8 text-center">
                  <Users className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-slate-400 text-sm">No team members yet</p>
                </CardContent>
              </Card>
            ) : (
              employees.map((emp) => (
                <Card key={emp.id} className="border-white/5 bg-white/[0.03]">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">
                      {emp.firstName?.[0]}{emp.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm">{emp.firstName} {emp.lastName}</p>
                      <p className="text-slate-400 text-xs">{emp.email}</p>
                    </div>
                    {isAdmin ? (
                      <Select
                        value={emp.role}
                        onValueChange={(role) => updateRoleMutation.mutate({ id: emp.id, role })}
                      >
                        <SelectTrigger className="w-32 h-7 text-xs bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {["employee", "admin", "business_owner", "pending"].map(r => (
                            <SelectItem key={r} value={r} className="text-white text-xs capitalize">{r.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-700/50 text-slate-300 text-xs capitalize">
                        {emp.role.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ══ QUOTES TAB ══ */}
          <TabsContent value="quotes" className="space-y-3">
            <h2 className="font-bold text-white mb-2">Pending Quotes ({quotedLeads.length})</h2>

            {quotedLeads.length === 0 ? (
              <Card className="border-white/5 bg-white/[0.03]">
                <CardContent className="py-8 text-center">
                  <MessageSquare className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-slate-400 text-sm">No pending quotes</p>
                </CardContent>
              </Card>
            ) : (
              quotedLeads.map((lead) => (
                <Card key={lead.id} className="border-amber-500/20 bg-amber-950/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm mb-0.5">{lead.firstName} {lead.lastName}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                          {lead.serviceType && <span className="capitalize">{lead.serviceType.replace(/_/g, " ")}</span>}
                          {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                          {lead.moveDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(lead.moveDate).toLocaleDateString()}</span>}
                        </div>
                        {lead.fromAddress && (
                          <p className="text-xs text-slate-500 mt-1 truncate">📍 {lead.fromAddress}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/lead/${lead.id}`}>
                          <Button size="sm" className="bg-amber-600 hover:bg-amber-500 text-white text-xs">
                            Review <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            <div className="pt-2 flex gap-2">
              <Link href="/pending-quotes">
                <Button variant="outline" size="sm" className="border-white/10 text-slate-400 hover:text-white">
                  All Quotes <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
              {isAdmin && (
                <Link href="/admin/quote-review">
                  <Button variant="outline" size="sm" className="border-white/10 text-slate-400 hover:text-white">
                    Chatbot Quotes <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Admin Quick Access */}
        {isAdmin && (
          <div className="mt-8 pt-6 border-t border-white/5">
            <p className="text-slate-500 text-xs mb-3 uppercase tracking-wider">Admin Controls</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { href: "/control", label: "Admin Control Center", icon: "🛡️" },
                { href: "/admin/treasury", label: "Treasury", icon: "💰" },
                { href: "/admin/users", label: "Users", icon: "👥" },
                { href: "/admin/marketplace", label: "Marketplace Mgmt", icon: "🎁" },
                { href: "/admin/promo-codes", label: "Promo Codes", icon: "🏷️" },
                { href: "/admin/system-check", label: "System Check", icon: "⚙️" },
              ].map(({ href, label, icon }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer">
                    <span className="text-base">{icon}</span>
                    <span className="text-slate-300 text-xs font-medium">{label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Lead Confirmation */}
      <AlertDialog open={!!leadToDelete} onOpenChange={() => setLeadToDelete(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Lead</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete {leadToDelete?.firstName} {leadToDelete?.lastName}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={() => leadToDelete && deleteLeadMutation.mutate(leadToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
