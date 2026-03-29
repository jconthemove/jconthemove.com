import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, Check, X, ExternalLink, Handshake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Sponsor } from "@shared/schema";

const TIER_COLORS: Record<string, string> = {
  starter: "bg-emerald-600",
  growth: "bg-blue-600",
  power: "bg-yellow-600",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function AdminSponsorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "cancelled">("all");

  const { data: sponsors = [], isLoading } = useQuery<Sponsor[]>({
    queryKey: ["/api/admin/sponsors"],
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/sponsors/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      toast({ title: "Sponsor approved and set to active" });
    },
    onError: () => toast({ title: "Failed to approve sponsor", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/sponsors/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      toast({ title: "Sponsor rejected" });
    },
    onError: () => toast({ title: "Failed to reject sponsor", variant: "destructive" }),
  });

  const featuredMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/sponsors/${id}/featured`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
      toast({ title: "Featured status updated" });
    },
    onError: () => toast({ title: "Failed to update featured status", variant: "destructive" }),
  });

  const filtered = filter === "all" ? sponsors : sponsors.filter((s) => s.status === filter);

  const counts = {
    all: sponsors.length,
    pending: sponsors.filter((s) => s.status === "pending").length,
    active: sponsors.filter((s) => s.status === "active").length,
    cancelled: sponsors.filter((s) => s.status === "cancelled").length,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Handshake className="h-7 w-7 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Sponsors</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(["all", "pending", "active", "cancelled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f
                ? "bg-white/10 text-white border border-white/20"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 text-yellow-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-800/40 border-slate-700/50 border-dashed">
          <CardContent className="py-12 text-center">
            <Handshake className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No sponsors found in this category.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((sponsor) => (
            <Card key={sponsor.id} className="bg-slate-800/60 border-slate-700/50">
              <CardContent className="p-4">
                <div className="flex gap-4 items-start">
                  {/* Logo thumbnail */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-slate-700/60 flex items-center justify-center overflow-hidden">
                    {sponsor.logoUrl ? (
                      <img
                        src={sponsor.logoUrl}
                        alt={sponsor.businessName}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <Handshake className="h-6 w-6 text-slate-500" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-white font-semibold text-sm">{sponsor.businessName}</span>
                      <Badge className={`${TIER_COLORS[sponsor.tier] || "bg-slate-600"} text-white border-0 text-[10px] capitalize`}>
                        {sponsor.tier}
                      </Badge>
                      <Badge className={`${STATUS_COLORS[sponsor.status] || ""} text-[10px] capitalize`} variant="outline">
                        {sponsor.status}
                      </Badge>
                      {sponsor.featured && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                          <Star className="h-2.5 w-2.5 mr-0.5" />Featured
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 mb-2">
                      <span>{sponsor.contactName}</span>
                      <a href={`mailto:${sponsor.email}`} className="text-blue-400 hover:underline">{sponsor.email}</a>
                      <a href={`tel:${sponsor.phone}`} className="text-blue-400 hover:underline">{sponsor.phone}</a>
                      {sponsor.website && (
                        <a href={sponsor.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:underline">
                          <ExternalLink className="h-3 w-3" />
                          {sponsor.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>${sponsor.tierPrice}/mo</span>
                      <span>·</span>
                      <span>{new Date(sponsor.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {sponsor.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(sponsor.id)}
                        >
                          <Check className="h-3 w-3 mr-1" />Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-500/40 text-red-400 hover:bg-red-900/20 text-xs h-7 px-3"
                          disabled={rejectMutation.isPending}
                          onClick={() => rejectMutation.mutate(sponsor.id)}
                        >
                          <X className="h-3 w-3 mr-1" />Reject
                        </Button>
                      </>
                    )}
                    {sponsor.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/40 text-red-400 hover:bg-red-900/20 text-xs h-7 px-3"
                        disabled={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate(sponsor.id)}
                      >
                        <X className="h-3 w-3 mr-1" />Cancel
                      </Button>
                    )}
                    {sponsor.status === "cancelled" && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3"
                        disabled={approveMutation.isPending}
                        onClick={() => approveMutation.mutate(sponsor.id)}
                      >
                        <Check className="h-3 w-3 mr-1" />Re-activate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={`text-xs h-7 px-3 ${
                        sponsor.featured
                          ? "border-yellow-500/40 text-yellow-400 hover:bg-yellow-900/20"
                          : "border-slate-500/40 text-slate-400 hover:bg-slate-700/40"
                      }`}
                      disabled={featuredMutation.isPending}
                      onClick={() => featuredMutation.mutate(sponsor.id)}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      {sponsor.featured ? "Unfeature" : "Feature"}
                    </Button>
                  </div>
                </div>

                {sponsor.squarePaymentUrl && (
                  <div className="mt-2 pt-2 border-t border-slate-700/40">
                    <a
                      href={sponsor.squarePaymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Square Checkout Link
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
