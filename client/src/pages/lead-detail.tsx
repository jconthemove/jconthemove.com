import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Truck, Users, DollarSign, Award, TrendingUp, CheckCircle, Circle, Clock, Star, ExternalLink, Sparkles, Send, FileText, Loader2, Bitcoin, Copy, Check, Zap, ShoppingBag, AlertTriangle, UserCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CrewSuggestionsDialog } from "@/components/crew-suggestions-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { JobOrderBuilder } from "@/components/JobOrderBuilder";

interface OrderLineItem {
  id?: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  category?: string;
}

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceType: string;
  fromAddress: string;
  toAddress?: string;
  moveDate?: string;
  propertySize?: string;
  details?: string;
  status: string;
  assignedToUserId?: string;
  createdByUserId?: string;
  truckConfig?: string;
  crewSize?: number;
  basePrice?: string;
  totalPrice?: string;
  confirmedDate?: string;
  confirmedFromAddress?: string;
  confirmedToAddress?: string;
  crewMembers?: string[];
  crewBonusFlags?: Record<string, boolean>;
  hasHotTub?: boolean;
  hotTubWeight?: number;
  hotTubFee?: string;
  hasHeavySafe?: boolean;
  heavySafeWeight?: number;
  heavySafeFee?: string;
  hasPoolTable?: boolean;
  poolTableWeight?: number;
  poolTableFee?: string;
  hasPiano?: boolean;
  pianoWeight?: number;
  pianoFee?: string;
  totalSpecialItemsFee?: string;
  quoteNotes?: string;
  lastQuoteUpdatedAt?: string;
  tokenAllocation?: number;
  confirmedHours?: number;
  orderLineItems?: OrderLineItem[];
  completionRewardedAt?: string;
  checkedInAt?: string;
  completedAt?: string;
  createdAt: string;
  redemptionId?: number;
  appliedCreditNote?: string;
}

interface Reward {
  id: string;
  userId: string;
  rewardType: string;
  tokenAmount: string;
  cashValue: string;
  status: string;
  earnedDate: string;
  referenceId?: string;
  metadata?: any;
}

interface DisbursementRecord {
  id: string;
  user_id: string;
  reward_type: string;
  token_amount: string;
  cash_value?: string;
  earned_date?: string;
  metadata?: Record<string, unknown>;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isApproved: boolean;
  status: string;
}

function DisbursementSummaryCard({ lead }: { lead: Lead }) {
  const { data, isLoading } = useQuery<{ records: DisbursementRecord[] }>({
    queryKey: [`/api/leads/${lead.id}/disbursement-summary`],
    enabled: !!lead.completionRewardedAt,
  });

  const records = data?.records ?? [];
  const totalDisburse = records.reduce((s, r) => s + parseFloat(r.token_amount || "0"), 0);
  const crewRecords = records.filter((r) => r.reward_type === "worker_job_completion_bonus" || r.reward_type === "worker_hours_bonus");
  const customerRecords = records.filter((r) => r.reward_type === "loyalty_booking");
  const referralRecords = records.filter((r) => r.reward_type === "referral_confirmed");

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-slate-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-400">
          <Zap className="h-5 w-5" />
          JCMOVES Disbursement
          <Badge className="ml-auto bg-green-600/30 text-green-300 border-green-500/30 text-[10px]">Complete</Badge>
        </CardTitle>
        <CardDescription className="text-amber-300/60 text-xs">
          Distributed at {new Date(lead.completionRewardedAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
          </div>
        ) : records.length === 0 ? (
          <p className="text-xs text-slate-500">No reward records found in database for this lead.</p>
        ) : (
          <>
            {crewRecords.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Crew</p>
                {crewRecords.map((r) => (
                  <div key={r.id} className="flex justify-between text-sm">
                    <span className="text-slate-400 truncate max-w-[60%]">
                      {r.first_name || r.username || `User #${r.user_id}`}{" "}
                      <span className="text-[10px] text-slate-600">({r.reward_type})</span>
                    </span>
                    <span className="text-amber-300 font-bold">{parseFloat(r.token_amount || "0").toLocaleString()} JC</span>
                  </div>
                ))}
              </div>
            )}
            {customerRecords.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Customer</p>
                {customerRecords.map((r) => (
                  <div key={r.id} className="flex justify-between text-sm">
                    <span className="text-slate-400">{r.first_name || r.username || `User #${r.user_id}`}</span>
                    <span className="text-amber-300 font-bold">{parseFloat(r.token_amount || "0").toLocaleString()} JC</span>
                  </div>
                ))}
              </div>
            )}
            {referralRecords.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Referral Bonus</p>
                {referralRecords.map((r) => (
                  <div key={r.id} className="flex justify-between text-sm">
                    <span className="text-slate-400">{r.first_name || r.username || `User #${r.user_id}`}</span>
                    <span className="text-amber-300 font-bold">{parseFloat(r.token_amount || "0").toLocaleString()} JC</span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-amber-500/20 flex justify-between text-sm font-semibold">
              <span className="text-slate-400">Total Disbursed</span>
              <span className="text-amber-300">{totalDisburse.toLocaleString()} JCMOVES</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeadDetailPage() {
  const [, params] = useRoute("/lead/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [tokenAllocation, setTokenAllocation] = useState("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [showCrewSuggestions, setShowCrewSuggestions] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [orderApplied, setOrderApplied] = useState(false);
  const [showBtcDialog, setShowBtcDialog] = useState(false);
  const [btcAmount, setBtcAmount] = useState("");
  const [btcPaymentLink, setBtcPaymentLink] = useState<string | null>(null);
  const [copiedBtcLink, setCopiedBtcLink] = useState(false);
  const [selectedCrewMembers, setSelectedCrewMembers] = useState<string[]>([]);
  const [bonusMover, setBonusMover] = useState(false);
  const { hasAdminAccess } = useAuth();

  const { data: lead, isLoading, isError, error } = useQuery<Lead>({
    queryKey: ["/api/leads", params?.id],
    enabled: !!params?.id,
    retry: 1,
    retryDelay: 1000,
    staleTime: 0, // Always fetch fresh data
  });
  
  // If lead is not found, clear the leads cache so list updates
  useEffect(() => {
    if (isError || (lead === null && !isLoading)) {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    }
  }, [isError, lead, isLoading]);

  const { data: rewards = [] } = useQuery<Reward[]>({
    queryKey: ["/api/rewards"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: hasAdminAccess,
  });

  const form = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      moveDate: "",
      details: "",
      fromAddress: "",
      toAddress: "",
      basePrice: "",
      crewSize: 2,
      confirmedDate: "",
      confirmedFromAddress: "",
      confirmedToAddress: "",
      quoteNotes: "",
    },
  });

  // Update form when lead data loads
  useEffect(() => {
    if (lead) {
      form.reset({
        firstName: lead.firstName || "",
        lastName: lead.lastName || "",
        email: lead.email || "",
        phone: lead.phone || "",
        moveDate: lead.moveDate || "",
        details: lead.details || "",
        fromAddress: lead.fromAddress || "",
        toAddress: lead.toAddress || "",
        basePrice: lead.basePrice || "",
        crewSize: lead.crewSize || 2,
        confirmedDate: lead.confirmedDate || lead.moveDate || "",
        confirmedFromAddress: lead.confirmedFromAddress || lead.fromAddress || "",
        confirmedToAddress: lead.confirmedToAddress || lead.toAddress || "",
        quoteNotes: lead.quoteNotes || "",
      });
      const members = lead.crewMembers || [];
      setSelectedCrewMembers(members);
      const inferredBonus = members.length > 0 && (lead.crewSize ?? 0) > members.length;
      setBonusMover(inferredBonus);
    }
  }, [lead, form]);

  const updateLead = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PATCH", `/api/leads/${params?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Success",
        description: "Lead updated successfully",
      });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update lead",
        variant: "destructive",
      });
    },
  });

  const toggleBonusMover = useMutation({
    mutationFn: async ({ memberId, isBonus }: { memberId: string; isBonus: boolean }) => {
      const current: Record<string, boolean> = lead.crewBonusFlags ?? {};
      const updated = { ...current, [memberId]: isBonus };
      return await apiRequest("PATCH", `/api/leads/${params?.id}`, { crewBonusFlags: updated });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Updated", description: "Bonus mover flag saved." });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(invoiceAmount);
      if (!amount || amount <= 0) throw new Error("Please enter a valid amount");
      if (lead?.orderLineItems && lead.orderLineItems.length > 0) {
        return await apiRequest("POST", `/api/square/invoice-lead/${params?.id}`, {
          lineItems: lead.orderLineItems,
        });
      }
      return await apiRequest("POST", `/api/invoices/lead/${params?.id}`, {
        amount,
        description: invoiceDescription || `${lead?.serviceType} - ${lead?.firstName} ${lead?.lastName}`,
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: "Invoice Sent!",
        description: data.invoiceUrl 
          ? "Invoice has been created and sent to the customer via Square." 
          : "Invoice created successfully.",
      });
      setShowInvoiceDialog(false);
      setInvoiceAmount("");
      setInvoiceDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/leads", params?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (data.invoiceUrl) {
        window.open(data.invoiceUrl, '_blank');
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create invoice",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const createBtcPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(btcAmount);
      if (!amount || amount <= 0) throw new Error("Please enter a valid amount");
      if (!lead) throw new Error("Lead not found");
      const response = await apiRequest("POST", "/api/btc/create-payment", {
        customerName: `${lead.firstName} ${lead.lastName}`,
        customerEmail: lead.email,
        customerPhone: lead.phone,
        usdAmount: amount,
        referenceType: "job_payment",
        referenceId: lead.id,
        notes: `${lead.serviceType} - ${lead.firstName} ${lead.lastName}`,
        items: [{ name: `${lead.serviceType}`, amount }],
      });
      return response.json();
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}/bitcoin-payment?id=${data.payment?.id || data.id}`;
      setBtcPaymentLink(link);
      toast({ title: "Bitcoin payment link created!", description: "Share this link with the customer to collect payment." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create BTC payment", description: error.message, variant: "destructive" });
    },
  });

  const advanceToStep = useMutation({
    mutationFn: async (targetStep: number) => {
      let newStatus = lead?.status;
      let updateData: any = {};
      switch (targetStep) {
        case 2:
          newStatus = "available";
          if (tokenAllocation) updateData.tokenAllocation = parseFloat(tokenAllocation);
          updateData.crewMembers = selectedCrewMembers;
          updateData.crewSize = computeEffectiveCrewSize();
          break;
        case 3:
          newStatus = "completed";
          updateData.completedAt = new Date().toISOString();
          break;
      }
      updateData = { ...updateData, status: newStatus };
      return await apiRequest("PATCH", `/api/leads/${params?.id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Step completed", description: "Job workflow advanced successfully" });
      setIsCheckingIn(false);
    },
  });

  const sendReminder = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/leads/${params?.id}/reminder`, {});
    },
    onSuccess: () => {
      toast({ title: "Reminder sent", description: "Customer has been notified about tomorrow's move" });
    },
  });

  const computeEffectiveCrewSize = () => selectedCrewMembers.length + (bonusMover ? 1 : 0);

  const handleSave = () => {
    const formData = form.getValues();
    updateLead.mutate({
      ...formData,
      status: lead?.status,
      crewMembers: selectedCrewMembers,
      crewSize: computeEffectiveCrewSize(),
    });
  };

  const handleOrderApply = (orderData: {
    basePrice: string;
    totalPrice: string;
    crewSize: number;
    confirmedHours: number;
    quoteNotes: string;
    hasHotTub: boolean;
    hotTubFee: string;
    hasHeavySafe: boolean;
    heavySafeFee: string;
    hasPoolTable: boolean;
    poolTableFee: string;
    hasPiano: boolean;
    pianoFee: string;
    totalSpecialItemsFee: string;
    lineItems: OrderLineItem[];
  }) => {
    updateLead.mutate({
      ...orderData,
      orderLineItems: orderData.lineItems,
      status: lead?.status,
      lastQuoteUpdatedAt: new Date().toISOString(),
    }, {
      onSuccess: () => {
        setOrderApplied(true);
        const price = orderData.totalPrice;
        setInvoiceAmount(price ? parseFloat(price).toString() : "");
        setInvoiceDescription(`${lead?.serviceType} - ${lead?.firstName} ${lead?.lastName}`);
        toast({ title: "Order applied!", description: `$${parseFloat(orderData.totalPrice).toFixed(2)} total saved to job.` });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full" data-testid="card-loading">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Loading job details...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !lead) {
    const errorMessage = error?.message || "Lead not found";
    const isNotFound = errorMessage.includes("404") || !lead;
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full" data-testid="card-error">
          <CardHeader>
            <CardTitle className="text-center">
              {isNotFound ? "Job Not Found" : "Error Loading Job"}
            </CardTitle>
            <CardDescription className="text-center">
              {isNotFound 
                ? "This job may have been deleted or doesn't exist."
                : "We couldn't load this job. Please try again."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isNotFound && (
              <p className="text-sm text-muted-foreground text-center bg-muted p-3 rounded">
                {errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Button 
                className="w-full" 
                onClick={() => setLocation("/leads")}
                data-testid="button-back-to-leads"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to All Jobs
              </Button>
              {!isNotFound && (
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => window.location.reload()}
                  data-testid="button-retry"
                >
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate potential earnings
  const baseReward = 100; // points
  const baseTokens = 500; // JCMOVES
  const onTimeBonus = 0.2; // 20%
  const ratingBonus = 0.3; // 30% for 4.0+ rating
  
  const potentialEarnings = {
    base: { points: baseReward, tokens: baseTokens },
    withOnTime: { 
      points: Math.round(baseReward * (1 + onTimeBonus)), 
      tokens: Math.round(baseTokens * (1 + onTimeBonus)) 
    },
    withRating: { 
      points: Math.round(baseReward * (1 + ratingBonus)), 
      tokens: Math.round(baseTokens * (1 + ratingBonus)) 
    },
    withBoth: { 
      points: Math.round(baseReward * (1 + onTimeBonus + ratingBonus)), 
      tokens: Math.round(baseTokens * (1 + onTimeBonus + ratingBonus)) 
    },
  };

  // Filter rewards related to this lead
  const leadRewards = rewards.filter(r => r.referenceId === lead.id);
  const pendingRewards = leadRewards.filter(r => r.status === "pending");
  const creditedRewards = leadRewards.filter(r => r.status === "confirmed");

  const serviceTypeBadge = () => {
    switch (lead.serviceType) {
      case "residential": return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
      case "commercial": return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
      case "junk": return "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200";
      default: return "bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200";
    }
  };

  // 3-step workflow system
  const workflow = [
    { step: 1, name: "Quote Requested", status: ["quote_requested"] },
    { step: 2, name: "Job Available", status: ["available"] },
    { step: 3, name: "Completed", status: ["completed"] }
  ];

  const getCurrentStep = () => {
    if (!lead) return 1;
    if (lead.status === "completed") return 3;
    if (lead.status === "available") return 2;
    return 1;
  };

  const currentStep = getCurrentStep();

  const requestReview = (platform: string) => {
    const customerEmail = lead?.email;
    const customerName = `${lead?.firstName} ${lead?.lastName}`;
    
    let url = "";
    switch (platform) {
      case "google":
        // JC ON THE MOVE Google review URL
        url = "https://www.google.com/search?q=jc+on+the+move&rlz=1C1GCEU_enUS832US832#lrd=0x8823f6fa63b16c07:0x9c6a4b3d4e5f6c8a,3";
        break;
      case "facebook":
        // JC ON THE MOVE Facebook reviews
        url = "https://www.facebook.com/JCOnTheMove/reviews";
        break;
      case "inapp":
        // This would open an in-app review modal
        toast({
          title: "Review request sent",
          description: "Customer will receive an in-app review request",
        });
        return;
    }
    
    if (url) {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/leads")}
              className="flex items-center gap-2"
              data-testid="button-back-to-leads"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Leads
            </Button>
            <div className="flex gap-2">
              {!isEditing && (
                <Button 
                  variant="outline"
                  onClick={() => setShowCrewSuggestions(true)} 
                  data-testid="button-crew-suggestions"
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Crew Suggestions
                </Button>
              )}
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} data-testid="button-edit">
                  Edit Details
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => {
                    setIsEditing(false);
                    const members = lead?.crewMembers || [];
                    setSelectedCrewMembers(members);
                    const inferredBonus = members.length > 0 && (lead?.crewSize ?? 0) > members.length;
                    setBonusMover(inferredBonus);
                  }} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={updateLead.isPending} data-testid="button-save">
                    {updateLead.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-foreground">
              {lead.firstName} {lead.lastName}
            </h1>
            <Badge className={serviceTypeBadge()}>
              {lead.serviceType === "residential" && "Residential"}
              {lead.serviceType === "commercial" && "Commercial"}
              {lead.serviceType === "junk" && "Junk Removal"}
            </Badge>
            <Badge variant={lead.status === "completed" ? "default" : "secondary"}>
              {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
            </Badge>
          </div>
        </div>

        {/* Reward Credit Banner */}
        {lead.appliedCreditNote && (
          <div className="mb-6 p-4 rounded-xl border border-orange-500/40 bg-orange-500/10 flex items-start gap-3">
            <span className="text-2xl">🎁</span>
            <div>
              <p className="font-semibold text-orange-400 text-sm mb-1">JCMOVES Reward Applied to This Job</p>
              <p className="text-sm text-foreground/80">{lead.appliedCreditNote}</p>
            </div>
          </div>
        )}

        {/* 5-Step Workflow Progress */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Job Workflow</CardTitle>
            <CardDescription>Complete these 5 simple steps to finish the job</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Progress Steps */}
              <div className="flex items-center justify-between">
                {workflow.map((step, idx) => (
                  <div key={step.step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                        currentStep > step.step 
                          ? 'bg-green-600 border-green-600 text-white' 
                          : currentStep === step.step
                          ? 'bg-primary border-primary text-white'
                          : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                      }`}>
                        {currentStep > step.step ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <span className="font-bold">{step.step}</span>
                        )}
                      </div>
                      <p className={`text-xs mt-2 text-center ${
                        currentStep >= step.step ? 'font-semibold' : 'text-muted-foreground'
                      }`}>
                        {step.name}
                      </p>
                    </div>
                    {idx < workflow.length - 1 && (
                      <div className={`h-0.5 flex-1 ${
                        currentStep > step.step ? 'bg-green-600' : 'bg-muted'
                      }`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Step-specific Actions */}
              <div className="p-4 bg-muted/50 rounded-lg">
                {currentStep === 1 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Circle className="h-4 w-4 text-primary" />
                      Step 1: Quote Requested
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Customer has requested a quote. Review details and set pricing.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="token-allocation">JCMOVES Tokens</Label>
                        <Input
                          id="token-allocation"
                          type="number"
                          placeholder="e.g., 500"
                          value={tokenAllocation}
                          onChange={(e) => setTokenAllocation(e.target.value)}
                          data-testid="input-token-allocation"
                        />
                      </div>
                    </div>
                    {hasAdminAccess && selectedCrewMembers.length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-md px-3 py-2">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span>No crew members assigned. Please assign crew before activating.</span>
                      </div>
                    )}
                    <Button 
                      onClick={() => advanceToStep.mutate(2)} 
                      disabled={!lead?.basePrice || advanceToStep.isPending}
                      data-testid="button-make-available"
                    >
                      {advanceToStep.isPending ? "Activating..." : "Make Job Available"}
                    </Button>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      Step 2: Job Available
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Job is available for employees to accept. Mark complete when finished.
                    </p>
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <p className="text-sm font-semibold text-primary">
                        Token Reward: {lead?.tokenAllocation || 0} JCMOVES
                      </p>
                    </div>
                    <Button 
                      onClick={() => advanceToStep.mutate(3)}
                      disabled={advanceToStep.isPending}
                      data-testid="button-mark-complete"
                    >
                      {advanceToStep.isPending ? "Completing..." : "Mark as Complete"}
                    </Button>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      Step 3: Completed
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Job complete! Request a review from the customer.
                    </p>
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <p className="text-sm font-semibold text-primary">
                        ⭐ Review Bonus: +30% for 4.0+ rating ({potentialEarnings.withRating.tokens} JCMOVES)
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        onClick={() => requestReview("google")}
                        variant="outline"
                        className="gap-2"
                        data-testid="button-review-google"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Google Review
                      </Button>
                      <Button 
                        onClick={() => requestReview("facebook")}
                        variant="outline"
                        className="gap-2"
                        data-testid="button-review-facebook"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Facebook Review
                      </Button>
                      <Button 
                        onClick={() => requestReview("inapp")}
                        variant="outline"
                        className="gap-2"
                        data-testid="button-review-inapp"
                      >
                        <Star className="h-4 w-4" />
                        In-App Review
                      </Button>
                    </div>
                    {lead?.status === "completed" && (
                      <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-lg">
                        <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                          ✅ Job Completed! Great work!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>First Name</Label>
                        <Input {...form.register("firstName")} data-testid="input-first-name" />
                      </div>
                      <div>
                        <Label>Last Name</Label>
                        <Input {...form.register("lastName")} data-testid="input-last-name" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Email</Label>
                        <Input type="email" {...form.register("email")} data-testid="input-email" />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input type="tel" {...form.register("phone")} data-testid="input-phone" />
                      </div>
                    </div>
                    <div>
                      <Label>From Address</Label>
                      <Input {...form.register("fromAddress")} data-testid="input-from-address" />
                    </div>
                    <div>
                      <Label>To Address</Label>
                      <Input {...form.register("toAddress")} data-testid="input-to-address" />
                    </div>
                    <div>
                      <Label>Requested Move Date</Label>
                      <Input type="date" {...form.register("moveDate")} data-testid="input-move-date" />
                    </div>
                    <div>
                      <Label>Additional Details / Notes</Label>
                      <Textarea rows={3} {...form.register("details")} data-testid="input-details" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <a href={`mailto:${lead.email}`} className="text-sm font-medium hover:underline" data-testid="link-email">
                            {lead.email}
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <a href={`tel:${lead.phone}`} className="text-sm font-medium hover:underline" data-testid="link-phone">
                            {lead.phone || "Not provided"}
                          </a>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground">From</p>
                          <p className="text-sm font-medium">{lead.fromAddress}</p>
                        </div>
                      </div>
                      {lead.toAddress && (
                        <div className="flex items-start gap-3">
                          <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-muted-foreground">To</p>
                            <p className="text-sm font-medium">{lead.toAddress}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Requested Move Date</p>
                          <p className="text-sm font-medium">{lead.moveDate || "Not specified"}</p>
                        </div>
                      </div>
                    </div>
                    {lead.details && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Additional Details</p>
                          <p className="text-sm bg-muted p-3 rounded">{lead.details}</p>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Order Builder ── */}
            {hasAdminAccess && (
              <JobOrderBuilder
                lead={lead}
                leadId={lead.id}
                disabled={updateLead.isPending}
                onApply={handleOrderApply}
              />
            )}

            {/* ── Current Order Summary (if an order has been built) ── */}
            {(lead.totalPrice || lead.basePrice) && (
              <Card className="border-emerald-500/30 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-emerald-400">
                    <ShoppingBag className="h-4 w-4" />
                    Active Order
                    {orderApplied && <Badge className="ml-1 bg-emerald-600/30 text-emerald-300 border-emerald-500/30 text-[10px]">Just applied</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {lead.orderLineItems && lead.orderLineItems.length > 0 ? (
                    <div className="space-y-1">
                      {lead.orderLineItems.map((li: OrderLineItem, i: number) => (
                        <div key={i} className="flex justify-between text-sm text-slate-300">
                          <span>{li.name}{li.qty > 1 ? ` × ${li.qty}` : ""}</span>
                          <span className="font-medium">${li.total?.toFixed(2) ?? "0.00"}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-white pt-2 border-t border-slate-600/50">
                        <span>Total</span>
                        <span className="text-emerald-400">${parseFloat(lead.totalPrice || lead.basePrice || "0").toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Quote Total</span>
                      <span className="font-bold text-emerald-400">${parseFloat(lead.totalPrice || lead.basePrice || "0").toFixed(2)}</span>
                    </div>
                  )}
                  {lead.crewSize && (
                    <div className="pt-1 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        {lead.crewSize} movers
                        {lead.confirmedHours ? <><Clock className="h-3.5 w-3.5 ml-2" />{lead.confirmedHours} hrs</> : null}
                      </div>
                      {hasAdminAccess && lead.crewMembers && lead.crewMembers.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Bonus Mover (+25% payout)</p>
                          {lead.crewMembers.map((mid: string) => {
                            const isBonus = lead.crewBonusFlags?.[mid] === true;
                            const emp = employees.find((e: Employee) => e.id === mid);
                            const displayName = emp
                              ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email
                              : `Crew #${mid.slice(0, 6)}`;
                            return (
                              <div key={mid} className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={isBonus}
                                  onCheckedChange={(v) => toggleBonusMover.mutate({ memberId: mid, isBonus: !!v })}
                                  disabled={toggleBonusMover.isPending}
                                  className="h-3.5 w-3.5"
                                />
                                <span className={isBonus ? "text-amber-400 font-medium" : "text-slate-400"}>
                                  {displayName} {isBonus ? "(+25%)" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {(lead.totalPrice || lead.basePrice) && (() => {
                    const price = parseFloat(lead.totalPrice || lead.basePrice || "0");
                    const crewCount = lead.crewSize ? parseInt(String(lead.crewSize)) : 0;
                    const jobTokens = Math.round(price * 15);
                    const perWorker = crewCount > 0 ? Math.round(jobTokens / crewCount) : jobTokens;
                    return (
                      <div className="pt-1.5 border-t border-slate-700/50 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Token conversion · $1 = 15 JCMOVES</p>
                        {hasAdminAccess ? (
                          <>
                            <div className="flex items-center gap-1.5 text-xs text-amber-400">
                              <Zap className="h-3.5 w-3.5 shrink-0" />
                              <span>Customer earns <strong>~{jobTokens.toLocaleString()}</strong> JCMOVES</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-orange-400">
                              <Zap className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Crew earns <strong>~{jobTokens.toLocaleString()}</strong> JCMOVES
                                {crewCount > 0 && <span className="text-orange-400/70"> (~{perWorker.toLocaleString()} each × {crewCount})</span>}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-orange-400">
                            <Zap className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              Crew earns <strong>~{jobTokens.toLocaleString()}</strong> JCMOVES on completion
                              {crewCount > 0 && <span className="text-orange-400/70"> (~{perWorker.toLocaleString()} each)</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* ── Schedule Details (editable separately) ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Schedule & Addresses
                </CardTitle>
                <CardDescription>Confirm the date, pickup, and delivery locations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="confirmedDate">Confirmed Move Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmedDate"
                      type="date"
                      className="pl-9"
                      disabled={!isEditing}
                      {...form.register("confirmedDate")}
                      data-testid="input-confirmed-date"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmedFromAddress">Confirmed Pickup Address</Label>
                  <Input
                    id="confirmedFromAddress"
                    disabled={!isEditing}
                    {...form.register("confirmedFromAddress")}
                    data-testid="input-confirmed-from"
                  />
                </div>

                <div>
                  <Label htmlFor="confirmedToAddress">Confirmed Delivery Address</Label>
                  <Input
                    id="confirmedToAddress"
                    disabled={!isEditing}
                    {...form.register("confirmedToAddress")}
                    data-testid="input-confirmed-to"
                  />
                </div>

                {!hasAdminAccess && (
                  <div>
                    <Label htmlFor="basePrice">Base Price</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="basePrice"
                        type="number"
                        step="0.01"
                        className="pl-9"
                        disabled={!isEditing}
                        {...form.register("basePrice")}
                        data-testid="input-base-price"
                      />
                    </div>
                  </div>
                )}

                {hasAdminAccess && (
                  <div className="space-y-3 pt-2">
                    <Separator />
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Crew Assignment
                      </Label>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>
                          {selectedCrewMembers.length + (bonusMover ? 1 : 0)} mover{selectedCrewMembers.length + (bonusMover ? 1 : 0) !== 1 ? "s" : ""}
                        </span>
                        {bonusMover && (
                          <Badge className="bg-amber-600/20 text-amber-400 border-amber-500/30 text-[10px]">
                            +1 Bonus
                          </Badge>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <>
                        <div
                          className="max-h-48 overflow-y-auto space-y-1.5 border rounded-md p-2 bg-muted/20"
                          data-testid="crew-member-list"
                        >
                          {employees.filter(e => e.isApproved || e.status === "approved").length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-2">No approved employees found</p>
                          ) : (
                            employees
                              .filter(emp => emp.isApproved || emp.status === "approved")
                              .map((emp) => {
                              const isSelected = selectedCrewMembers.includes(emp.id);
                              const toggleMember = () => {
                                setSelectedCrewMembers(prev =>
                                  prev.includes(emp.id)
                                    ? prev.filter(id => id !== emp.id)
                                    : [...prev, emp.id]
                                );
                              };
                              return (
                                <div
                                  key={emp.id}
                                  role="option"
                                  aria-selected={isSelected}
                                  tabIndex={0}
                                  className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer"
                                  onClick={() => toggleMember()}
                                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleMember(); } }}
                                  data-testid={`crew-checkbox-${emp.id}`}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    tabIndex={-1}
                                    className="h-4 w-4 pointer-events-none"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium leading-none ${isSelected ? "text-primary" : ""}`}>
                                      {emp.firstName} {emp.lastName}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                                  </div>
                                  {isSelected && <UserCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                                </div>
                              );
                            })
                          )}
                        </div>

                        <div className="flex items-center justify-between py-1">
                          <Label htmlFor="bonus-mover-toggle" className="flex items-center gap-2 cursor-pointer">
                            <span className="text-sm">Bonus Mover</span>
                            <span className="text-xs text-muted-foreground">(+1 crew, +25% payout)</span>
                          </Label>
                          <Switch
                            id="bonus-mover-toggle"
                            checked={bonusMover}
                            onCheckedChange={setBonusMover}
                            data-testid="toggle-bonus-mover"
                          />
                        </div>
                      </>
                    ) : (
                      selectedCrewMembers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5" data-testid="crew-member-badges">
                          {selectedCrewMembers.map((memberId) => {
                            const emp = employees.find(e => e.id === memberId);
                            return (
                              <Badge
                                key={memberId}
                                variant="secondary"
                                className="text-xs"
                                data-testid={`crew-badge-${memberId}`}
                              >
                                <UserCheck className="h-3 w-3 mr-1" />
                                {emp ? `${emp.firstName} ${emp.lastName}` : memberId.slice(0, 8) + "…"}
                              </Badge>
                            );
                          })}
                          {bonusMover && (
                            <Badge className="text-xs bg-amber-600/20 text-amber-400 border-amber-500/30">
                              +1 Bonus Mover
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No crew assigned yet</p>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Send Invoice - Admin Only */}
            {hasAdminAccess && (
              <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-background">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Invoice
                  </CardTitle>
                  <CardDescription>Send a Square invoice to the customer for payment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">{lead.firstName} {lead.lastName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Email</span>
                      <span className="font-medium">{lead.email}</span>
                    </div>
                    {lead.totalPrice && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Quote Total</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">${parseFloat(lead.totalPrice).toFixed(2)}</span>
                      </div>
                    )}
                    {!lead.totalPrice && lead.basePrice && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base Price</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">${parseFloat(lead.basePrice).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      const price = lead.totalPrice || lead.basePrice || "";
                      setInvoiceAmount(price ? parseFloat(price).toString() : "");
                      setInvoiceDescription(`${lead.serviceType} - ${lead.firstName} ${lead.lastName}`);
                      setShowInvoiceDialog(true);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Invoice via Square
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── JCMOVES Disbursement Summary (shows after completion rewards are distributed) ── */}
            {lead.completionRewardedAt && hasAdminAccess && (
              <DisbursementSummaryCard lead={lead} />
            )}

            {/* Bitcoin Payment - Admin Only */}
            {hasAdminAccess && (
              <Card className="border-orange-500/30 bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/20 dark:to-background">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bitcoin className="h-5 w-5 text-orange-500" />
                    Bitcoin Payment
                  </CardTitle>
                  <CardDescription>Generate a BTC payment link for this job (10% discount)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">{lead.firstName} {lead.lastName}</span>
                    </div>
                    {(lead.totalPrice || lead.basePrice) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Quote Total</span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          ${parseFloat(lead.totalPrice || lead.basePrice || "0").toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      const price = lead.totalPrice || lead.basePrice || "";
                      setBtcAmount(price ? parseFloat(price).toString() : "");
                      setBtcPaymentLink(null);
                      setShowBtcDialog(true);
                    }}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    <Bitcoin className="h-4 w-4 mr-2" />
                    Generate BTC Payment Link
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar - Potential Earnings & Rewards */}
          <div className="space-y-6">
            {/* Potential Earnings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Potential Earnings
                </CardTitle>
                <CardDescription>Rewards for completing this job</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Base Completion</p>
                  <div className="space-y-1">
                    <p className="text-lg font-bold">{potentialEarnings.base.points} Points</p>
                    <p className="text-sm text-muted-foreground">{potentialEarnings.base.tokens} JCMOVES</p>
                  </div>
                </div>

                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">+ On-Time Bonus (20%)</p>
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-primary">{potentialEarnings.withOnTime.points} Points</p>
                    <p className="text-sm text-muted-foreground">{potentialEarnings.withOnTime.tokens} JCMOVES</p>
                  </div>
                </div>

                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">+ Rating Bonus (30% for 4.0+)</p>
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-primary">{potentialEarnings.withRating.points} Points</p>
                    <p className="text-sm text-muted-foreground">{potentialEarnings.withRating.tokens} JCMOVES</p>
                  </div>
                </div>

                <Separator />

                <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Maximum Potential</p>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-primary">{potentialEarnings.withBoth.points} Points</p>
                    <p className="text-sm text-muted-foreground">{potentialEarnings.withBoth.tokens} JCMOVES</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rewards Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Rewards Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="pending" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pending" data-testid="tab-pending">
                      Pending ({pendingRewards.length})
                    </TabsTrigger>
                    <TabsTrigger value="credited" data-testid="tab-credited">
                      Credited ({creditedRewards.length})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="pending" className="space-y-3 mt-4">
                    {pendingRewards.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No pending rewards
                      </p>
                    ) : (
                      pendingRewards.map(reward => (
                        <div key={reward.id} className="p-3 border rounded-lg" data-testid={`pending-reward-${reward.id}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">{reward.rewardType}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(reward.earnedDate).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge variant="outline">Pending</Badge>
                          </div>
                          <div className="mt-2 text-sm">
                            <p className="font-semibold">{parseFloat(reward.tokenAmount).toFixed(2)} JCMOVES credits</p>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>
                  
                  <TabsContent value="credited" className="space-y-3 mt-4">
                    {creditedRewards.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No credited rewards yet
                      </p>
                    ) : (
                      creditedRewards.map(reward => (
                        <div key={reward.id} className="p-3 border rounded-lg bg-muted/30" data-testid={`credited-reward-${reward.id}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">{reward.rewardType}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(reward.earnedDate).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge className="bg-green-600">Credited</Badge>
                          </div>
                          <div className="mt-2 text-sm">
                            <p className="font-semibold">{parseFloat(reward.tokenAmount).toFixed(2)} JCMOVES credits</p>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Crew Suggestions Dialog */}
      <CrewSuggestionsDialog
        jobId={lead.id}
        jobTitle={`${lead.firstName} ${lead.lastName} - ${lead.serviceType}`}
        open={showCrewSuggestions}
        onOpenChange={setShowCrewSuggestions}
      />

      {/* Send Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-500" />
              Send Invoice via Square
            </DialogTitle>
            <DialogDescription>
              This will create a Square invoice and email it to {lead.firstName} {lead.lastName} ({lead.email}) for payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Amount ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pl-9"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  placeholder="Enter invoice amount"
                />
              </div>
              {parseFloat(invoiceAmount) > 0 && (() => {
                const amt = parseFloat(invoiceAmount);
                const crewCount = lead?.crewSize ? parseInt(String(lead.crewSize)) : 0;
                const tokens = Math.round(amt * 15);
                const perWorker = crewCount > 0 ? Math.round(tokens / crewCount) : tokens;
                return (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/20 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/70">$1 = 15 JCMOVES conversion</p>
                    <div className="flex items-center gap-1.5 text-xs text-amber-400">
                      <Zap className="h-3 w-3 shrink-0" />
                      <span>Customer earns <strong>~{tokens.toLocaleString()}</strong> JCMOVES</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-orange-400">
                      <Zap className="h-3 w-3 shrink-0" />
                      <span>
                        Workers earn <strong>~{tokens.toLocaleString()}</strong> JCMOVES
                        {crewCount > 0 && <span className="text-orange-400/70"> (~{perWorker.toLocaleString()} each × {crewCount})</span>}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={invoiceDescription}
                onChange={(e) => setInvoiceDescription(e.target.value)}
                placeholder="Service description"
              />
            </div>
            {lead.orderLineItems && lead.orderLineItems.length > 0 && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-lg text-xs space-y-1">
                <p className="font-semibold text-emerald-400 mb-1.5">Itemized order ({lead.orderLineItems.length} line items):</p>
                {lead.orderLineItems.map((li: OrderLineItem, i: number) => (
                  <div key={i} className="flex justify-between text-slate-400">
                    <span>{li.name}{li.qty > 1 ? ` × ${li.qty}` : ""}</span>
                    <span>${li.total?.toFixed(2)}</span>
                  </div>
                ))}
                <p className="text-[10px] text-slate-500 pt-1 border-t border-emerald-500/10">
                  Invoice will use Square order line items.
                </p>
              </div>
            )}
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p className="font-medium">Payment methods accepted:</p>
              <p className="text-muted-foreground">Credit/Debit Card, Bank Transfer, Cash App Pay</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createInvoiceMutation.mutate()}
              disabled={createInvoiceMutation.isPending || !invoiceAmount || parseFloat(invoiceAmount) <= 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {createInvoiceMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {createInvoiceMutation.isPending ? "Sending..." : "Send Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bitcoin Payment Dialog */}
      <Dialog open={showBtcDialog} onOpenChange={(open) => { setShowBtcDialog(open); if (!open) setBtcPaymentLink(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bitcoin className="h-5 w-5 text-orange-500" />
              Generate Bitcoin Payment Link
            </DialogTitle>
            <DialogDescription>
              Create a BTC payment link for {lead.firstName} {lead.lastName}. Customer gets a 10% discount for paying with Bitcoin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!btcPaymentLink ? (
              <>
                <div>
                  <Label>Amount ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="pl-9"
                      value={btcAmount}
                      onChange={(e) => setBtcAmount(e.target.value)}
                      placeholder="Enter amount in USD"
                    />
                  </div>
                </div>
                {btcAmount && parseFloat(btcAmount) > 0 && (
                  <div className="p-3 bg-orange-950/30 border border-orange-500/30 rounded-lg text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original</span>
                      <span>${parseFloat(btcAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-orange-400 font-medium">
                      <span>With 10% BTC Discount</span>
                      <span>${(parseFloat(btcAmount) * 0.9).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-orange-950/30 border border-orange-500/30 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Payment Link — share this with the customer:</p>
                  <p className="text-xs font-mono break-all text-orange-300 leading-relaxed">{btcPaymentLink}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(btcPaymentLink);
                      setCopiedBtcLink(true);
                      setTimeout(() => setCopiedBtcLink(false), 3000);
                    }}
                  >
                    {copiedBtcLink ? <Check className="h-4 w-4 mr-2 text-green-500" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copiedBtcLink ? "Copied!" : "Copy Link"}
                  </Button>
                  <Button
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                    onClick={() => window.open(btcPaymentLink, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  You can verify this payment in the Admin Bitcoin Payments panel once the customer sends BTC.
                </p>
              </div>
            )}
          </div>
          {!btcPaymentLink && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBtcDialog(false)}>Cancel</Button>
              <Button
                onClick={() => createBtcPaymentMutation.mutate()}
                disabled={createBtcPaymentMutation.isPending || !btcAmount || parseFloat(btcAmount) <= 0}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {createBtcPaymentMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bitcoin className="h-4 w-4 mr-2" />}
                {createBtcPaymentMutation.isPending ? "Generating..." : "Generate Link"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
