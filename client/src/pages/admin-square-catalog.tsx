import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Save, RefreshCw, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { Link } from "wouter";

const KNOWN_ITEM_IDS = [
  { id: "moving_2m_2h", label: "Moving: JC222 Special (2 Movers × 2h)" },
  { id: "moving_2m_3h", label: "Moving: 2 Movers × 3 hrs" },
  { id: "moving_2m_4h", label: "Moving: 2 Movers × 4 hrs" },
  { id: "moving_3m_3h", label: "Moving: 3 Movers × 3 hrs" },
  { id: "moving_3m_4h", label: "Moving: 3 Movers × 4 hrs" },
  { id: "moving_4m_3h", label: "Moving: 4 Movers × 3 hrs" },
  { id: "moving_4m_4h", label: "Moving: 4 Movers × 4 hrs" },
  { id: "moving_2m_6h", label: "Moving: 2 Movers × 6 hrs" },
  { id: "moving_3m_6h", label: "Moving: 3 Movers × 6 hrs" },
  { id: "junk_single_item", label: "Junk: Single Item" },
  { id: "junk_quarter", label: "Junk: ¼ Truck Load" },
  { id: "junk_half", label: "Junk: ½ Truck Load" },
  { id: "junk_full", label: "Junk: Full Truck Load" },
  { id: "junk_custom", label: "Junk: Custom Price" },
  { id: "mattress_bag", label: "Add-on: Mattress Bag(s)" },
  { id: "wardrobe_boxes", label: "Add-on: Wardrobe Boxes" },
  { id: "packing_supplies", label: "Add-on: Packing Tape & Supplies" },
  { id: "long_carry", label: "Add-on: Long Carry (>75 ft)" },
  { id: "stairs", label: "Add-on: Stairs / Flights" },
  { id: "elevator", label: "Add-on: Elevator Fee" },
  { id: "assembly", label: "Add-on: Furniture Assembly/Disassembly" },
  { id: "appliance_connect", label: "Add-on: Appliance Connection" },
  { id: "appliance_recycle", label: "Junk Add-on: Appliance Recycling Fee" },
  { id: "hazmat", label: "Junk Add-on: Hazardous Surcharge" },
  { id: "extra_labor", label: "Junk Add-on: Extra Labor Hour" },
  { id: "dumpster_bag", label: "Junk Add-on: Cleanout Dumpster Bag" },
  { id: "teardown", label: "Junk Add-on: Light Demolition" },
  { id: "drive_time", label: "Drive Time Fee" },
  { id: "hot_tub", label: "Specialty: Hot Tub" },
  { id: "piano", label: "Specialty: Piano" },
  { id: "heavy_safe", label: "Specialty: Heavy Safe" },
  { id: "pool_table", label: "Specialty: Pool Table" },
];

export default function AdminSquareCatalogPage() {
  const { toast } = useToast();
  const [localMappings, setLocalMappings] = useState<Record<string, string> | null>(null);

  const { data, isLoading } = useQuery<{ mappings: Record<string, string> }>({
    queryKey: ["/api/square/catalog-mappings"],
  });

  const { data: catalogData, isLoading: catalogLoading } = useQuery<{ items: any[] }>({
    queryKey: ["/api/square/catalog"],
  });

  const currentMappings = localMappings ?? data?.mappings ?? {};

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/square/catalog-mappings", { mappings: currentMappings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/square/catalog-mappings"] });
      setLocalMappings(null);
      toast({ title: "Saved", description: "Catalog mappings saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMapping = (id: string, val: string) => {
    setLocalMappings(prev => ({ ...(prev ?? currentMappings), [id]: val }));
  };

  const isDirty = localMappings !== null;
  const mappedCount = Object.values(currentMappings).filter(v => v?.trim()).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/control">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Square Catalog Mapping</h1>
          <p className="text-xs text-slate-400">Map order items to Square catalog variation IDs for itemized invoices</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
          {mappedCount} / {KNOWN_ITEM_IDS.length} mapped
        </Badge>
        {catalogLoading && <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}
        {catalogData?.items && (
          <span className="text-xs text-slate-400">{catalogData.items.length} Square catalog items fetched</span>
        )}
        <a
          href="https://squareup.com/dashboard/items/library"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 flex items-center gap-1 ml-auto hover:underline"
        >
          Square Catalog <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {catalogData?.items && catalogData.items.length > 0 && (
        <Card className="mb-4 border-blue-500/20 bg-slate-800/40">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-slate-300">Square Catalog Items (copy IDs from here)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {catalogData.items.map((item: any) => (
                <div key={item.id} className="text-xs flex items-center gap-2">
                  <span className="text-slate-300 flex-1 truncate">{item.name || item.id}</span>
                  {(item.variations || []).map((v: any) => (
                    <button
                      key={v.id}
                      title={v.name}
                      className="font-mono text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-500/20 hover:bg-blue-900/60 truncate max-w-[180px]"
                      onClick={() => { navigator.clipboard.writeText(v.id); toast({ title: "Copied", description: v.id }); }}
                    >
                      {v.name || v.id}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-700/30 bg-slate-800/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Item → Catalog ID Mapping</CardTitle>
          <CardDescription>Enter the Square catalog variation ID for each order item. Leave blank to use ad-hoc pricing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            KNOWN_ITEM_IDS.map(item => {
              const val = currentMappings[item.id] ?? "";
              return (
                <div key={item.id} className="grid grid-cols-[1fr_auto_180px] items-center gap-2">
                  <Label className="text-xs text-slate-300 truncate">{item.label}</Label>
                  {val.trim() ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
                  )}
                  <Input
                    className="bg-slate-900 border-slate-600 text-white text-xs font-mono h-7"
                    placeholder="Catalog variation ID"
                    value={val}
                    onChange={e => updateMapping(item.id, e.target.value)}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end mt-4 gap-2">
        {isDirty && (
          <Button variant="ghost" onClick={() => setLocalMappings(null)} className="text-slate-400">
            Discard
          </Button>
        )}
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {saveMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Mappings
        </Button>
      </div>
    </div>
  );
}
