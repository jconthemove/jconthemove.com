import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Phone, Mail, Calendar, Loader2, Search, ChevronRight, Trash2, FileText, Plus } from "lucide-react";
import { Link } from "wouter";
import { getStatusColors } from "@/lib/job-status";
import QuoteForm from "@/components/QuoteForm";
import type { Lead } from "@shared/schema";

const STATUS_OPTIONS = ["all", "new", "contacted", "quote_requested", "quoted", "confirmed", "available", "accepted", "in_progress", "completed", "cancelled"];
const STATUS_SORT: Record<string, number> = {
  new: 0, contacted: 1, quote_requested: 2, quoted: 3,
  confirmed: 10, available: 11, accepted: 12, in_progress: 13,
  completed: 20, paid: 21, cancelled: 30,
};

function LeadStatusBadge({ status }: { status: string }) {
  const colors = getStatusColors(status);
  return (
    <Badge variant="outline" className={`text-xs ${colors.text} ${colors.cardBorder}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}

export default function CrewJobsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = ["admin", "business_owner"].includes(user?.role || "");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(15);
  const [showAddForm, setShowAddForm] = useState(false);

  const leadsEndpoint = isAdmin ? "/api/leads" : "/api/leads/my-jobs";
  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: [leadsEndpoint],
    staleTime: 0,
    refetchOnMount: true,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/leads/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
      toast({ title: "Status updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredLeads = useMemo(() => {
    return leads
      .filter(l => {
        const matchesStatus = statusFilter === "all" || l.status === statusFilter;
        const q = search.toLowerCase();
        const matchesSearch = !q ||
          `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
          (l.email?.toLowerCase().includes(q)) ||
          (l.phone?.includes(q)) ||
          (l.serviceType?.toLowerCase().includes(q));
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99));
  }, [leads, statusFilter, search]);

  if (showAddForm) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="text-slate-400">
            ← Back
          </Button>
          <h2 className="text-white font-bold">Add New Lead</h2>
        </div>
        <QuoteForm
          variant="employee"
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
            queryClient.invalidateQueries({ queryKey: ["/api/leads/my-jobs"] });
            setShowAddForm(false);
            toast({ title: "✅ Lead added!" });
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Job Board</h1>
          <p className="text-slate-400 text-sm">{filteredLeads.length} leads</p>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Lead
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={e => { setSearch(e.target.value); setVisibleCount(15); }}
            className="pl-9 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setVisibleCount(15); }}>
          <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700 text-white h-9">
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

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
      ) : filteredLeads.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No leads found</p>
          <Button className="mt-3 bg-blue-600 hover:bg-blue-500 text-sm" onClick={() => setShowAddForm(true)}>
            Add First Lead
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {filteredLeads.slice(0, visibleCount).map(lead => {
              const sc = getStatusColors(lead.status);
              return (
                <Card key={lead.id} className={`border-l-4 ${sc.border} border-t border-r border-b border-slate-700/40 bg-white/[0.03] hover:bg-white/[0.05] transition-colors`}>
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
                        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                          {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                          {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
                          {lead.moveDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(lead.moveDate).toLocaleDateString()}</span>}
                        </div>
                        {lead.fromAddress && (
                          <p className="flex items-start gap-1 mt-1 text-xs text-slate-500">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="truncate">{lead.fromAddress}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Select
                          value={lead.status}
                          onValueChange={val => updateStatusMutation.mutate({ id: lead.id, status: val })}
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
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {visibleCount < filteredLeads.length && (
            <Button
              variant="outline"
              className="w-full border-slate-700 text-slate-400 hover:text-white"
              onClick={() => setVisibleCount(c => c + 15)}
            >
              Show {Math.min(15, filteredLeads.length - visibleCount)} more
            </Button>
          )}
        </>
      )}
      <div className="h-2" />
    </div>
  );
}
