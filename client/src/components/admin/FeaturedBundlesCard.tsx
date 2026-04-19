// Task #131 — Admin "Featured Bundles" inline-edit settings card.
// Hosted on the System Administration dashboard so admins manage bundle
// economics (discount value, bonus JCMOVES multiplier, featured/active
// flags) from the same surface they manage everything else.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BundleDefinition } from "@shared/schema";

// Wire-shape of the inline-edit PATCH body. Mirrors the Zod schema
// `bundleSettingsPatchSchema` on the server in routes/bookings.ts.
interface BundleSettingsPatchBody {
  discountValue?: number;
  bonusMultiplier?: number;
  isFeatured?: boolean;
  isActive?: boolean;
}

// Per-row draft state — each field is the raw <input> string the user is
// typing, plus the typed boolean toggles for featured/active.
interface BundleDraft {
  discountValue?: string;
  bonusMultiplier?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}
type DraftField = keyof BundleDraft;

export function FeaturedBundlesCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ bundles: BundleDefinition[] }>({
    queryKey: ["/api/admin/bundle-definitions"],
  });

  const [drafts, setDrafts] = useState<Record<string, BundleDraft>>({});

  const patch = useMutation({
    mutationFn: async ({ code, body }: { code: string; body: BundleSettingsPatchBody }) => {
      return await apiRequest("PATCH", `/api/admin/bundle-definitions/${code}`, body);
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bundle-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundles/featured"] });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.code];
        return next;
      });
      toast({ title: "Bundle updated" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Try again";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Featured Bundles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const bundles = data?.bundles ?? [];
  return (
    <Card data-testid="card-featured-bundles">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Featured Bundles
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {bundles.length === 0 && (
          <p className="text-sm text-muted-foreground">No bundles configured yet.</p>
        )}
        {bundles.map((b) => {
          const draft = drafts[b.code] ?? {};
          const discountValue = (draft.discountValue ?? b.discountValue) as string;
          const bonusMultiplier = (draft.bonusMultiplier ?? b.bonusMultiplier) as string;
          const isFeatured = (draft.isFeatured ?? b.isFeatured) as boolean;
          const isActive = (draft.isActive ?? b.isActive) as boolean;
          const dirty = drafts[b.code] && Object.keys(drafts[b.code]).length > 0;

          const setField = <K extends DraftField>(field: K, value: BundleDraft[K]) =>
            setDrafts((prev) => ({ ...prev, [b.code]: { ...prev[b.code], [field]: value } }));

          return (
            <div
              key={b.code}
              className="rounded-md border p-3 space-y-3"
              data-testid={`bundle-row-${b.code}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.code} ·{" "}
                    {Array.isArray(b.serviceComboJson) ? b.serviceComboJson.join(" + ") : ""}
                  </div>
                </div>
                <Badge variant={isActive ? "default" : "secondary"}>
                  {isActive ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Discount ({b.discountType})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={discountValue}
                    onChange={(e) => setField("discountValue", e.target.value)}
                    data-testid={`input-discount-${b.code}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">Bonus multiplier</Label>
                  <Input
                    type="number"
                    step="0.05"
                    min={1}
                    max={5}
                    value={bonusMultiplier}
                    onChange={(e) => setField("bonusMultiplier", e.target.value)}
                    data-testid={`input-multiplier-${b.code}`}
                  />
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <Switch
                    checked={isFeatured}
                    onCheckedChange={(v) => setField("isFeatured", v)}
                    data-testid={`switch-featured-${b.code}`}
                  />
                  <Label className="text-xs">Featured</Label>
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <Switch
                    checked={isActive}
                    onCheckedChange={(v) => setField("isActive", v)}
                    data-testid={`switch-active-${b.code}`}
                  />
                  <Label className="text-xs">Active</Label>
                </div>
              </div>

              {dirty && (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDrafts((prev) => {
                        const next = { ...prev };
                        delete next[b.code];
                        return next;
                      })
                    }
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={patch.isPending}
                    onClick={() => {
                      const d = drafts[b.code];
                      const body: BundleSettingsPatchBody = {};
                      if (d.discountValue !== undefined) body.discountValue = parseFloat(d.discountValue);
                      if (d.bonusMultiplier !== undefined) body.bonusMultiplier = parseFloat(d.bonusMultiplier);
                      if (d.isFeatured !== undefined) body.isFeatured = d.isFeatured;
                      if (d.isActive !== undefined) body.isActive = d.isActive;
                      patch.mutate({ code: b.code, body });
                    }}
                    data-testid={`button-save-${b.code}`}
                  >
                    {patch.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
