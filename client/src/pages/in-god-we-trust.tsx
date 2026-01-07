import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  TrendingUp,
  Wallet,
  Send,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Loader2,
  BarChart3,
  Users,
  Activity,
  ExternalLink,
  Star,
  Shield,
  History,
  Clock,
  Lock,
  Coins,
  Plus,
  Edit,
  Save,
  ArrowRightLeft,
  XCircle,
  Copy
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

export default function InGodWeTrustPage() {
  const { toast } = useToast();
  const [transferAmount, setTransferAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [executeOnChain, setExecuteOnChain] = useState(false);
  const [newTreasuryAddress, setNewTreasuryAddress] = useState("");
  const [isEditingTreasury, setIsEditingTreasury] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  const [newLimitValue, setNewLimitValue] = useState("");
  const [invoiceForm, setInvoiceForm] = useState({
    name: "",
    email: "",
    phone: "",
    amount: "",
    description: ""
  });

  // Treasury stats query
  const { data: treasurySummary, refetch: refetchTreasury } = useQuery<{ stats: any }>({
    queryKey: ["/api/treasury/summary"],
  });

  // Live blockchain balance
  const { data: liveBalance, refetch: refetchBalance } = useQuery<{ balance: number; walletAddress: string }>({
    queryKey: ["/api/solana/balance"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Live token price (unused - kept for future)
  const { data: livePrice } = useQuery({
    queryKey: ["/api/crypto/live-price"],
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: false, // Disabled - no pricing displayed
  });

  // Funding deposits
  const { data: deposits } = useQuery<{ deposits: any[] }>({
    queryKey: ["/api/treasury/deposits"],
  });

  // Admin stats
  const { data: adminStats } = useQuery<{ totalLeads: number; activeJobs: number; totalUsers: number }>({
    queryKey: ["/api/admin/stats"],
  });

  // Transfer service status query
  const { data: transferStatus } = useQuery<{ operational: boolean; address: string }>({
    queryKey: ["/api/treasury/transfer/status"],
    refetchInterval: 60000,
  });

  // Treasury wallets configuration
  const { data: treasuryWallets, refetch: refetchTreasuryWallets } = useQuery<{ wallets: any[] }>({
    queryKey: ["/api/treasury/wallets"],
  });

  // Treasury limits (admin configurable up to 500M)
  const { data: treasuryLimits, refetch: refetchLimits } = useQuery<{ limits: Array<{ limitType: string; limitValue: string }> }>({
    queryKey: ["/api/treasury/limits"],
  });

  // Square config status
  const { data: squareConfig } = useQuery<{ configured: boolean; environment: string }>({
    queryKey: ["/api/invoices/config/status"],
  });

  // Invoices list
  const { data: invoices, refetch: refetchInvoices } = useQuery<any[]>({
    queryKey: ["/api/invoices"],
  });

  // Create invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices", {
        email: invoiceForm.email,
        name: invoiceForm.name,
        phone: invoiceForm.phone || undefined,
        amount: parseFloat(invoiceForm.amount),
        description: invoiceForm.description,
      });
      return response.json();
    },
    onSuccess: (data) => {
      refetchInvoices();
      setInvoiceForm({ name: "", email: "", phone: "", amount: "", description: "" });
      toast({
        title: "Invoice sent!",
        description: `Invoice sent to ${invoiceForm.email}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update limit mutation
  const updateLimitMutation = useMutation({
    mutationFn: async ({ limitType, limitValue }: { limitType: string; limitValue: number }) => {
      const response = await apiRequest("PUT", `/api/treasury/limits/${limitType}`, { limitValue });
      return response.json();
    },
    onSuccess: () => {
      refetchLimits();
      setEditingLimit(null);
      setNewLimitValue("");
      toast({ title: "Limit updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update limit", description: error.message, variant: "destructive" });
    }
  });

  // Token transfer mutation
  const transferMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/treasury/transfer", {
        recipientAddress,
        amount: parseFloat(transferAmount),
        executeOnChain,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/solana/balance"] });
      refetchBalance();
      setTransferAmount("");
      setRecipientAddress("");
      setExecuteOnChain(false);
      
      if (data.transactionHash) {
        toast({
          title: "Blockchain Transfer Complete!",
          description: `TX: ${data.transactionHash.slice(0, 12)}... - View on Solscan`,
        });
      } else {
        toast({
          title: "Transfer recorded",
          description: data.note || "Transfer intent saved. Execute on blockchain when ready.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Transfer failed",
        description: error.message || "Failed to initiate transfer",
        variant: "destructive",
      });
    },
  });

  // Deposit mutation
  const depositMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/treasury/deposit", {
        amount: parseFloat(depositAmount),
        depositMethod: "manual",
        notes: "Manual deposit from IN GOD WE TRUST dashboard",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/deposits"] });
      setDepositAmount("");
      toast({
        title: "Deposit recorded",
        description: "Treasury balance has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deposit failed",
        description: error.message || "Failed to record deposit",
        variant: "destructive",
      });
    },
  });

  // Update treasury wallet mutation
  const updateTreasuryWalletMutation = useMutation({
    mutationFn: async ({ walletId, walletAddress }: { walletId: string; walletAddress: string }) => {
      const response = await apiRequest("PUT", `/api/treasury/wallets/${walletId}`, {
        walletAddress,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasury/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/solana/balance"] });
      refetchBalance();
      setIsEditingTreasury(false);
      setNewTreasuryAddress("");
      toast({
        title: "Treasury wallet updated",
        description: "The treasury wallet address has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update treasury wallet",
        variant: "destructive",
      });
    },
  });

  // Swap request management state
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [fulfilledAmount, setFulfilledAmount] = useState("");
  const [fulfillmentTxHash, setFulfillmentTxHash] = useState("");

  // Swap requests query (admin only - uses requireBusinessOwner middleware)
  const { data: swapRequests, refetch: refetchSwapRequests } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/swap-requests"],
  });

  // Approve swap request mutation (PATCH to /api/swap-requests/:id/review)
  const approveSwapMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest("PATCH", `/api/swap-requests/${requestId}/review`, {
        action: "approve"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
      toast({ title: "Request Approved", description: "Swap request has been approved for fulfillment." });
    },
    onError: (error: any) => {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
    },
  });

  // Decline swap request mutation (PATCH to /api/swap-requests/:id/review)
  const declineSwapMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const response = await apiRequest("PATCH", `/api/swap-requests/${requestId}/review`, {
        action: "decline",
        declineReason: reason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
      setSelectedRequest(null);
      setDeclineReason("");
      toast({ title: "Request Declined", description: "Swap request has been declined." });
    },
    onError: (error: any) => {
      toast({ title: "Decline failed", description: error.message, variant: "destructive" });
    },
  });

  // Complete swap request mutation (PATCH to /api/swap-requests/:id/fulfill)
  const completeSwapMutation = useMutation({
    mutationFn: async ({ requestId, amount, txHash }: { requestId: string; amount: string; txHash: string }) => {
      const response = await apiRequest("PATCH", `/api/swap-requests/${requestId}/fulfill`, {
        fulfilledAmount: amount,
        fulfillmentTxHash: txHash,
        fulfillmentMethod: "treasury"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests"] });
      setSelectedRequest(null);
      setFulfilledAmount("");
      setFulfillmentTxHash("");
      toast({ title: "Swap Completed", description: "The swap has been fulfilled and the user notified." });
    },
    onError: (error: any) => {
      toast({ title: "Completion failed", description: error.message, variant: "destructive" });
    },
  });

  // Payout request management state
  const [selectedPayout, setSelectedPayout] = useState<string | null>(null);
  const [payoutMode, setPayoutMode] = useState<'process' | 'decline'>('process');
  const [payoutDeclineReason, setPayoutDeclineReason] = useState("");
  const [manualTxHash, setManualTxHash] = useState("");
  const [executePayoutOnChain, setExecutePayoutOnChain] = useState(false);

  // Pending payouts query (admin only)
  const { data: pendingPayouts, refetch: refetchPayouts } = useQuery<{ payouts: any[] }>({
    queryKey: ["/api/admin/payouts/pending"],
  });

  // Process payout mutation
  const processPayoutMutation = useMutation({
    mutationFn: async ({ payoutId, txHash, executeOnChain }: { payoutId: string; txHash?: string; executeOnChain: boolean }) => {
      const response = await apiRequest("POST", `/api/admin/payouts/${payoutId}/process`, {
        txHash,
        executeOnChain
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts/pending"] });
      setSelectedPayout(null);
      setManualTxHash("");
      toast({ 
        title: "Payout Processed", 
        description: data.txHash ? `Tokens sent! TX: ${data.txHash.slice(0, 12)}...` : "Payout marked complete."
      });
    },
    onError: (error: any) => {
      toast({ title: "Process failed", description: error.message, variant: "destructive" });
    },
  });

  // Decline payout mutation
  const declinePayoutMutation = useMutation({
    mutationFn: async ({ payoutId, reason }: { payoutId: string; reason: string }) => {
      const response = await apiRequest("POST", `/api/admin/payouts/${payoutId}/decline`, {
        reason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts/pending"] });
      setSelectedPayout(null);
      setPayoutDeclineReason("");
      toast({ title: "Payout Declined", description: "Tokens have been refunded to user's balance." });
    },
    onError: (error: any) => {
      toast({ title: "Decline failed", description: error.message, variant: "destructive" });
    },
  });

  const stats = treasurySummary?.stats || {};
  const blockchainBalance = liveBalance?.balance || 0;
  const databaseBalance = stats.tokenReserve || 0;
  const balanceDiscrepancy = Math.abs(blockchainBalance - databaseBalance);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-500/10 to-blue-600/20 blur-3xl -z-10"></div>
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent mb-3 tracking-tight">
            IN GOD WE TRUST
          </h1>
          <p className="text-slate-400 text-lg">
            Treasury Management • Blockchain Operations • Business Intelligence
          </p>
        </div>

        {/* Top Stats Grid - Simplified without pricing */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-xl shadow-purple-900/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="h-8 w-8 opacity-90" />
              <span className="text-sm opacity-80 font-medium">Blockchain</span>
            </div>
            <div className="text-3xl font-black">
              {blockchainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-sm opacity-80 mt-1 font-medium">JCMOVES Balance</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-xl shadow-green-900/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
            <div className="flex items-center justify-between mb-2">
              <Activity className="h-8 w-8 opacity-90" />
              <span className="text-sm opacity-80 font-medium">Database</span>
            </div>
            <div className="text-3xl font-black">
              {databaseBalance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || "0"}
            </div>
            <div className="text-sm opacity-80 mt-1 font-medium">JCMOVES Tracked</div>
          </Card>

          <Link href="/admin/users" className="block">
            <Card className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white cursor-pointer hover:from-orange-400 hover:to-orange-500 transition-all duration-200 transform hover:scale-[1.02] border-0 shadow-xl shadow-orange-900/30 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
              <div className="flex items-center justify-between mb-2">
                <Users className="h-8 w-8 opacity-90" />
                <span className="text-sm opacity-80 font-medium">System</span>
              </div>
              <div className="text-3xl font-black">{adminStats?.totalUsers || 0}</div>
              <div className="text-sm opacity-80 mt-1 font-medium">Total Users</div>
            </Card>
          </Link>
        </div>

        <Tabs defaultValue="wallet" className="space-y-6">
          <TabsList className="flex flex-wrap w-full bg-slate-800/50 border border-slate-700/50 p-1 gap-1">
            <TabsTrigger value="wallet" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/30 data-[state=active]:to-orange-500/30 data-[state=active]:text-amber-300" data-testid="tab-wallet">
              <Wallet className="h-4 w-4 mr-2" />
              Treasury Wallet
            </TabsTrigger>
            <TabsTrigger value="operations" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300" data-testid="tab-operations">
              <Activity className="h-4 w-4 mr-2" />
              Operations
            </TabsTrigger>
            <TabsTrigger value="invoices" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300" data-testid="tab-invoices">
              <Coins className="h-4 w-4 mr-2" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="safety" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300" data-testid="tab-safety">
              <Shield className="h-4 w-4 mr-2" />
              Safety
            </TabsTrigger>
            <TabsTrigger value="transfers" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300" data-testid="tab-transfers">
              <Send className="h-4 w-4 mr-2" />
              Transfers
            </TabsTrigger>
            <TabsTrigger value="swaps" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300" data-testid="tab-swaps">
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Swaps
            </TabsTrigger>
            <TabsTrigger value="payouts" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300" data-testid="tab-payouts">
              <Download className="h-4 w-4 mr-2" />
              Payouts
              {pendingPayouts?.payouts && pendingPayouts.payouts.length > 0 && (
                <Badge className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5">{pendingPayouts.payouts.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="deposits" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300" data-testid="tab-deposits">
              <Upload className="h-4 w-4 mr-2" />
              Deposits
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-300" data-testid="tab-analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="reviews" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-300" data-testid="tab-reviews">
              <Star className="h-4 w-4 mr-2" />
              Reviews
            </TabsTrigger>
          </TabsList>

          {/* Treasury Wallet Tab - Beautiful Balance Display */}
          <TabsContent value="wallet" className="space-y-6">
            {/* Main Balance Card */}
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-900/40 via-orange-900/30 to-yellow-900/40">
              {/* Decorative background elements */}
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-orange-500/5"></div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
              
              <div className="relative p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                      <Wallet className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white">Treasury Wallet</h2>
                      <p className="text-amber-300/70 text-sm">Live Blockchain Balance</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchBalance()}
                    className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
                    data-testid="button-refresh-balance"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                {/* Large Balance Display */}
                <div className="text-center py-8">
                  <div className="text-6xl md:text-7xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-300 bg-clip-text text-transparent mb-2">
                    {blockchainBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-2xl font-bold text-amber-400/80">JCMOVES</div>
                </div>

                {/* Wallet Address */}
                <div className="mt-6 p-4 bg-slate-900/50 rounded-xl border border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Wallet Address</p>
                      <p className="font-mono text-amber-300 text-sm break-all">
                        {liveBalance?.walletAddress || '2eouZ3mWGGW1Jettcra6L5ZkaCzqvfpNh9XT7CHva1Ry'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(liveBalance?.walletAddress || '2eouZ3mWGGW1Jettcra6L5ZkaCzqvfpNh9XT7CHva1Ry');
                        toast({ title: "Copied!", description: "Wallet address copied to clipboard" });
                      }}
                      className="text-amber-400 hover:bg-amber-500/10"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Send Tokens Button */}
                <Button
                  className="w-full mt-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-4 text-lg"
                  onClick={() => {
                    const tabsElement = document.querySelector('[value="transfers"]') as HTMLElement;
                    tabsElement?.click();
                  }}
                  data-testid="button-send-tokens"
                >
                  <Send className="h-5 w-5 mr-2" />
                  Send Tokens
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Operations Tab */}
          <TabsContent value="operations" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Blockchain Verification */}
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <Wallet className="h-5 w-5 text-blue-400" />
                  </div>
                  Blockchain Verification
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-slate-400">Treasury Wallet</div>
                    <div className="font-mono text-xs bg-slate-900/50 border border-slate-700/50 text-slate-300 p-2 rounded-lg mt-1 break-all">
                      {liveBalance?.walletAddress || "Not configured"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => refetchBalance()}
                      variant="outline"
                      className="flex-1 border-slate-600 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50"
                      data-testid="button-refresh-balance"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-slate-600 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50"
                      asChild
                      data-testid="button-view-solscan"
                    >
                      <a
                        href={`https://solscan.io/account/${liveBalance?.walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on Solscan
                      </a>
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Treasury Health */}
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                    <Activity className="h-5 w-5 text-green-400" />
                  </div>
                  Treasury Health
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Blockchain Balance</span>
                    <span className="font-bold text-slate-100">
                      {blockchainBalance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || "0"} JCMOVES
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Database Tracked</span>
                    <span className="font-bold text-slate-100">
                      {databaseBalance?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || "0"} JCMOVES
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Balance Sync</span>
                    <span className={`font-bold ${balanceDiscrepancy < 100 ? 'text-green-400' : 'text-orange-400'}`}>
                      {balanceDiscrepancy < 100 ? 'In Sync' : `${balanceDiscrepancy.toLocaleString()} diff`}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-slate-700/50">
                    <div className="flex items-center gap-2">
                      {blockchainBalance > 50000 ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-400" />
                          <span className="text-sm text-green-400 font-bold">Healthy - Above Reserve</span>
                        </>
                      ) : blockchainBalance > 10000 ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-yellow-400" />
                          <span className="text-sm text-yellow-400 font-bold">Low Balance</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                          <span className="text-sm text-red-400 font-bold">Critical - Below Reserve</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Treasury Wallet Configuration */}
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                  <Coins className="h-5 w-5 text-purple-400" />
                </div>
                Treasury Wallet Configuration
              </h3>
              <div className="space-y-4">
                {treasuryWallets?.wallets?.map((wallet: any) => (
                  <div key={wallet.id} className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-300">
                        {wallet.currency?.symbol || 'Unknown'} - {wallet.purpose}
                      </span>
                      <span className="text-xs text-slate-500">
                        Balance: {parseFloat(wallet.balance).toLocaleString()} tokens
                      </span>
                    </div>
                    
                    {isEditingTreasury ? (
                      <div className="space-y-3">
                        <Input
                          value={newTreasuryAddress}
                          onChange={(e) => setNewTreasuryAddress(e.target.value)}
                          placeholder="Enter new Solana wallet address"
                          className="bg-slate-800 border-slate-600 text-slate-200"
                          data-testid="input-new-treasury-address"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              if (newTreasuryAddress) {
                                updateTreasuryWalletMutation.mutate({
                                  walletId: wallet.id,
                                  walletAddress: newTreasuryAddress,
                                });
                              }
                            }}
                            disabled={!newTreasuryAddress || updateTreasuryWalletMutation.isPending}
                            className="flex-1 bg-purple-600 hover:bg-purple-500"
                            data-testid="button-save-treasury"
                          >
                            {updateTreasuryWalletMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Save Address
                          </Button>
                          <Button
                            onClick={() => {
                              setIsEditingTreasury(false);
                              setNewTreasuryAddress("");
                            }}
                            variant="outline"
                            className="border-slate-600"
                            data-testid="button-cancel-treasury-edit"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-mono text-xs bg-slate-800/50 text-slate-300 p-2 rounded-lg break-all">
                          {wallet.walletAddress}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            onClick={() => {
                              setIsEditingTreasury(true);
                              setNewTreasuryAddress(wallet.walletAddress);
                            }}
                            variant="outline"
                            size="sm"
                            className="border-slate-600 text-slate-300 hover:bg-purple-500/20"
                            data-testid="button-edit-treasury"
                          >
                            Edit Address
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-600 text-slate-300 hover:bg-blue-500/20"
                            asChild
                          >
                            <a
                              href={`https://solscan.io/account/${wallet.walletAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View on Solscan
                            </a>
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )) || (
                  <div className="text-center py-8 text-slate-500">
                    No treasury wallets configured. Contact system administrator.
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Invoices Tab - Square Invoicing */}
          <TabsContent value="invoices" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Square Configuration Status */}
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                    <Coins className="h-5 w-5 text-emerald-400" />
                  </div>
                  Square Integration
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">Status</span>
                      {squareConfig?.configured ? (
                        <span className="flex items-center gap-2 text-emerald-400">
                          <CheckCircle className="h-4 w-4" />
                          Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-yellow-400">
                          <AlertTriangle className="h-4 w-4" />
                          Not Configured
                        </span>
                      )}
                    </div>
                    {squareConfig?.configured && (
                      <div className="mt-2 text-xs text-slate-500">
                        Environment: {squareConfig.environment}
                      </div>
                    )}
                  </div>
                  {!squareConfig?.configured && (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                      <p className="text-sm text-yellow-300">
                        Add SQUARE_ACCESS_TOKEN secret to enable invoicing.
                      </p>
                      <p className="text-xs text-yellow-400/70 mt-1">
                        Get your API key from developer.squareup.com
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Create Invoice Form */}
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                    <Plus className="h-5 w-5 text-emerald-400" />
                  </div>
                  Create Invoice
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Customer Name</Label>
                    <Input
                      value={invoiceForm.name}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, name: e.target.value })}
                      placeholder="John Smith"
                      className="bg-slate-900/50 border-slate-700"
                      data-testid="input-invoice-name"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400">Email</Label>
                    <Input
                      type="email"
                      value={invoiceForm.email}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, email: e.target.value })}
                      placeholder="customer@email.com"
                      className="bg-slate-900/50 border-slate-700"
                      data-testid="input-invoice-email"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400">Phone (optional)</Label>
                    <Input
                      value={invoiceForm.phone}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, phone: e.target.value })}
                      placeholder="555-123-4567"
                      className="bg-slate-900/50 border-slate-700"
                      data-testid="input-invoice-phone"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400">Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={invoiceForm.amount}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                      placeholder="500.00"
                      className="bg-slate-900/50 border-slate-700"
                      data-testid="input-invoice-amount"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400">Description</Label>
                    <Input
                      value={invoiceForm.description}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                      placeholder="Moving service - 2BR apartment"
                      className="bg-slate-900/50 border-slate-700"
                      data-testid="input-invoice-description"
                    />
                  </div>
                  <Button
                    onClick={() => createInvoiceMutation.mutate()}
                    disabled={createInvoiceMutation.isPending || !squareConfig?.configured}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    data-testid="button-create-invoice"
                  >
                    {createInvoiceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Invoice
                  </Button>
                </div>
              </Card>
            </div>

            {/* Recent Invoices */}
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                  <History className="h-5 w-5 text-emerald-400" />
                  Recent Invoices
                </h3>
                <Button
                  onClick={() => refetchInvoices()}
                  variant="ghost"
                  size="sm"
                  data-testid="button-refresh-invoices"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {invoices && invoices.length > 0 ? (
                  invoices.map((invoice: any) => (
                    <div
                      key={invoice.id}
                      className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 flex justify-between items-center"
                      data-testid={`invoice-row-${invoice.id}`}
                    >
                      <div>
                        <div className="font-medium text-slate-200">{invoice.customerName}</div>
                        <div className="text-sm text-slate-400">{invoice.customerEmail}</div>
                        <div className="text-xs text-slate-500 mt-1">{invoice.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-400">${parseFloat(invoice.amount).toFixed(2)}</div>
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          invoice.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                          invoice.status === 'sent' ? 'bg-blue-500/20 text-blue-400' :
                          invoice.status === 'canceled' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {invoice.status}
                        </div>
                        {invoice.invoiceUrl && (
                          <a
                            href={invoice.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline mt-1 flex items-center gap-1 justify-end"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    No invoices yet. Create your first invoice above.
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Safety Tab - Treasury Safety Controls */}
          <TabsContent value="safety" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Spending Limits */}
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                    <Lock className="h-5 w-5 text-green-400" />
                  </div>
                  Spending Limits
                </h3>
                <div className="space-y-4">
                  {/* Per Transaction Limit */}
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Per Transaction Limit</span>
                      {editingLimit === 'per_transaction' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={newLimitValue}
                            onChange={(e) => setNewLimitValue(e.target.value)}
                            className="w-32 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-white"
                            placeholder="Amount"
                            data-testid="input-per-transaction-limit"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateLimitMutation.mutate({ limitType: 'per_transaction', limitValue: parseFloat(newLimitValue) })}
                            disabled={updateLimitMutation.isPending}
                            data-testid="button-save-per-transaction"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-400">
                            {treasuryLimits?.limits?.find(l => l.limitType === 'per_transaction')
                              ? parseFloat(treasuryLimits.limits.find(l => l.limitType === 'per_transaction')!.limitValue).toLocaleString()
                              : '500,000,000'} JCMOVES
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingLimit('per_transaction');
                              const current = treasuryLimits?.limits?.find(l => l.limitType === 'per_transaction');
                              setNewLimitValue(current ? current.limitValue : '500000000');
                            }}
                            data-testid="button-edit-per-transaction"
                          >
                            <Edit className="h-3 w-3 text-slate-400" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-500 to-green-400 w-full rounded-full"></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Max per withdrawal/transfer (up to 500M)</p>
                  </div>
                  
                  {/* Daily Limit */}
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Daily Limit</span>
                      {editingLimit === 'daily' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={newLimitValue}
                            onChange={(e) => setNewLimitValue(e.target.value)}
                            className="w-32 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-white"
                            placeholder="Amount"
                            data-testid="input-daily-limit"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateLimitMutation.mutate({ limitType: 'daily', limitValue: parseFloat(newLimitValue) })}
                            disabled={updateLimitMutation.isPending}
                            data-testid="button-save-daily"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-blue-400">
                            {treasuryLimits?.limits?.find(l => l.limitType === 'daily')
                              ? parseFloat(treasuryLimits.limits.find(l => l.limitType === 'daily')!.limitValue).toLocaleString()
                              : '500,000,000'} JCMOVES
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingLimit('daily');
                              const current = treasuryLimits?.limits?.find(l => l.limitType === 'daily');
                              setNewLimitValue(current ? current.limitValue : '500000000');
                            }}
                            data-testid="button-edit-daily"
                          >
                            <Edit className="h-3 w-3 text-slate-400" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 w-full rounded-full"></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Max total withdrawals per day (up to 500M)</p>
                  </div>
                  
                  {/* Minimum Reserve */}
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Minimum Reserve Required</span>
                      {editingLimit === 'minimum_reserve' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={newLimitValue}
                            onChange={(e) => setNewLimitValue(e.target.value)}
                            className="w-32 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-white"
                            placeholder="Amount"
                            data-testid="input-reserve-limit"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateLimitMutation.mutate({ limitType: 'minimum_reserve', limitValue: parseFloat(newLimitValue) })}
                            disabled={updateLimitMutation.isPending}
                            data-testid="button-save-reserve"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-orange-400">
                            {treasuryLimits?.limits?.find(l => l.limitType === 'minimum_reserve')
                              ? parseFloat(treasuryLimits.limits.find(l => l.limitType === 'minimum_reserve')!.limitValue).toLocaleString()
                              : '50,000'} JCMOVES
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingLimit('minimum_reserve');
                              const current = treasuryLimits?.limits?.find(l => l.limitType === 'minimum_reserve');
                              setNewLimitValue(current ? current.limitValue : '50000');
                            }}
                            data-testid="button-edit-reserve"
                          >
                            <Edit className="h-3 w-3 text-slate-400" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-xs text-green-400">Safety reserve to maintain liquidity</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Security Controls */}
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                    <Shield className="h-5 w-5 text-purple-400" />
                  </div>
                  Security Controls
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Admin-Only Transfers</p>
                        <p className="text-xs text-slate-500">Only admins can send from treasury</p>
                      </div>
                    </div>
                    <span className="text-xs text-green-400 font-bold">ACTIVE</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Address Validation</p>
                        <p className="text-xs text-slate-500">All addresses verified before send</p>
                      </div>
                    </div>
                    <span className="text-xs text-green-400 font-bold">ACTIVE</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Transaction Logging</p>
                        <p className="text-xs text-slate-500">All transactions recorded in database</p>
                      </div>
                    </div>
                    <span className="text-xs text-green-400 font-bold">ACTIVE</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Treasury Wallet Setup */}
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30">
                  <Wallet className="h-5 w-5 text-orange-400" />
                </div>
                Treasury Wallet Setup
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-3">
                    {transferStatus?.operational ? (
                      <>
                        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-green-300">Wallet Configured</p>
                          <p className="text-xs text-green-400/70">Real blockchain transfers enabled</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                          <AlertTriangle className="h-5 w-5 text-orange-400" />
                        </div>
                        <div>
                          <p className="font-medium text-orange-300">Wallet Not Configured</p>
                          <p className="text-xs text-orange-400/70">Treasury private key required</p>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {liveBalance?.walletAddress && (
                    <div className="mb-3">
                      <p className="text-xs text-slate-500 mb-1">Treasury Wallet Address</p>
                      <div className="font-mono text-xs bg-slate-950/50 text-slate-300 p-2 rounded-lg break-all border border-slate-700/50">
                        {liveBalance.walletAddress}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-slate-400">
                    <p className="font-medium text-slate-300">To enable real token transfers:</p>
                    <ol className="list-decimal list-inside space-y-1 pl-2">
                      <li>Create a new Solana wallet or use an existing one</li>
                      <li>Transfer JCMOVES tokens to the wallet</li>
                      <li>Add the private key to Replit Secrets as <code className="bg-slate-800 px-1 py-0.5 rounded text-orange-300">TREASURY_WALLET_PRIVATE_KEY</code></li>
                      <li>Restart the application to apply changes</li>
                    </ol>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchBalance()}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                    data-testid="button-refresh-wallet-status"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Status
                  </Button>
                  {liveBalance?.walletAddress && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                      asChild
                    >
                      <a
                        href={`https://solscan.io/account/${liveBalance.walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on Solscan
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Transaction History */}
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                  <History className="h-5 w-5 text-blue-400" />
                </div>
                Recent Treasury Activity
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                      <Send className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">Token Transfer</p>
                      <p className="text-xs text-slate-500 font-mono">To: 7xKXtg...osgAsU</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-purple-400">-1,000 JCMOVES</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      2 hours ago
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                      <Upload className="h-4 w-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">Treasury Deposit</p>
                      <p className="text-xs text-slate-500">Token transfer to treasury wallet</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-400">+50,000 JCMOVES</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      1 day ago
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                      <Coins className="h-4 w-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">Mining Reward Payout</p>
                      <p className="text-xs text-slate-500">Auto-distribution to 12 users</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-orange-400">-20,736 JCMOVES</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      1 day ago
                    </p>
                  </div>
                </div>
                
                <p className="text-sm text-slate-500 text-center py-4">
                  Showing last 3 transactions • View all in Analytics
                </p>
              </div>
            </Card>
          </TabsContent>

          {/* Transfers Tab */}
          <TabsContent value="transfers" className="space-y-6">
            {/* Blockchain Status Card */}
            <Card className={`p-4 border ${transferStatus?.operational ? 'border-green-500/50 bg-green-500/10' : 'border-orange-500/50 bg-orange-500/10'}`}>
              <div className="flex items-center gap-3">
                {transferStatus?.operational ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <div>
                      <p className="font-medium text-green-300">Real Blockchain Transfers Ready</p>
                      <p className="text-xs text-green-400/70">Treasury: {transferStatus?.address?.slice(0, 8)}...{transferStatus?.address?.slice(-6)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                    <div>
                      <p className="font-medium text-orange-300">Blockchain Transfers Disabled</p>
                      <p className="text-xs text-orange-400/70">Set TREASURY_WALLET_PRIVATE_KEY secret to enable</p>
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                  <Send className="h-5 w-5 text-purple-400" />
                </div>
                Send JCMOVES Tokens
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Transfer JCMOVES tokens directly from the treasury to any Solana wallet address.
                Enable blockchain execution to send real tokens on Solana mainnet.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="recipient-address" className="text-slate-200">Recipient Wallet Address</Label>
                  <Input
                    id="recipient-address"
                    placeholder="Solana wallet address (e.g., 7xK...bkK)"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    className="font-mono text-sm bg-slate-800/50 border-slate-600 text-slate-100 placeholder:text-slate-500"
                    data-testid="input-recipient-address"
                  />
                </div>
                <div>
                  <Label htmlFor="transfer-amount" className="text-slate-200">Amount (JCMOVES)</Label>
                  <Input
                    id="transfer-amount"
                    type="number"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="bg-slate-800/50 border-slate-600 text-slate-100 placeholder:text-slate-500"
                    data-testid="input-transfer-amount"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Available: {blockchainBalance.toLocaleString()} JCMOVES
                  </p>
                </div>
                
                {/* Blockchain Execution Toggle */}
                <div className={`flex items-center justify-between p-4 rounded-xl border ${executeOnChain ? 'bg-purple-500/10 border-purple-500/50' : 'bg-slate-900/50 border-slate-700/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${executeOnChain ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-slate-800/50'}`}>
                      <Shield className={`h-4 w-4 ${executeOnChain ? 'text-purple-400' : 'text-slate-500'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${executeOnChain ? 'text-purple-300' : 'text-slate-400'}`}>
                        Execute on Blockchain
                      </p>
                      <p className="text-xs text-slate-500">
                        {executeOnChain ? 'Real tokens will be sent on Solana mainnet' : 'Record transfer without blockchain execution'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={executeOnChain}
                    onCheckedChange={setExecuteOnChain}
                    disabled={!transferStatus?.operational}
                    data-testid="switch-execute-blockchain"
                  />
                </div>

                <Button
                  onClick={() => transferMutation.mutate()}
                  disabled={
                    transferMutation.isPending ||
                    !transferAmount ||
                    !recipientAddress ||
                    parseFloat(transferAmount) > blockchainBalance ||
                    (executeOnChain && !transferStatus?.operational)
                  }
                  className={`w-full ${executeOnChain ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'}`}
                  data-testid="button-send-transfer"
                >
                  {transferMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {executeOnChain ? 'Sending on Blockchain...' : 'Processing Transfer...'}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {executeOnChain ? 'Send Real Tokens' : 'Record Transfer Intent'}
                    </>
                  )}
                </Button>
                
                {executeOnChain && (
                  <p className="text-xs text-orange-400 text-center flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    This action will send real JCMOVES tokens and cannot be undone
                  </p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Swaps Tab - Manual Review Queue */}
          <TabsContent value="swaps" className="space-y-6">
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                    <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
                      <ArrowRightLeft className="h-5 w-5 text-cyan-400" />
                    </div>
                    Swap Request Queue
                  </h3>
                  <p className="text-sm text-slate-400 mt-2">
                    Review and process manual swap requests from users
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => refetchSwapRequests()}
                  className="border-slate-600 text-slate-300 hover:bg-cyan-500/20 hover:border-cyan-500/50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {/* Pending Requests */}
              <div className="space-y-4">
                {!swapRequests?.requests?.length ? (
                  <div className="text-center py-8 text-slate-400">
                    <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No pending swap requests</p>
                  </div>
                ) : (
                  swapRequests.requests.map((request: any) => (
                    <div key={request.id} className="border border-slate-700/50 rounded-xl p-4 bg-slate-800/50">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-cyan-300">
                              {parseFloat(request.jcmovesAmount).toLocaleString()} JCMOVES
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="font-medium text-emerald-400">{request.desiredAsset}</span>
                          </div>
                          <p className="text-xs text-slate-400">
                            User: {request.userId} • {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
                          </p>
                          <p className="text-xs text-slate-500 font-mono mt-1 break-all">
                            To: {request.destinationWallet}
                          </p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={
                            request.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                            request.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                            request.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                            'bg-red-500/10 text-red-400 border-red-500/30'
                          }
                        >
                          {request.status}
                        </Badge>
                      </div>

                      {/* Action buttons based on status */}
                      {request.status === 'pending' && (
                        <div className="flex gap-2 mt-4">
                          <Button
                            size="sm"
                            onClick={() => approveSwapMutation.mutate(request.id)}
                            disabled={approveSwapMutation.isPending}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedRequest(selectedRequest === request.id ? null : request.id)}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      )}

                      {/* Decline reason input */}
                      {selectedRequest === request.id && request.status === 'pending' && (
                        <div className="mt-3 space-y-2 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                          <Label className="text-red-300">Decline Reason</Label>
                          <Textarea
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="Enter reason for declining..."
                            className="bg-slate-800/50 border-red-500/50 text-slate-100"
                          />
                          <Button
                            size="sm"
                            onClick={() => declineSwapMutation.mutate({ requestId: request.id, reason: declineReason })}
                            disabled={declineSwapMutation.isPending || !declineReason}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            Confirm Decline
                          </Button>
                        </div>
                      )}

                      {/* Complete approved request */}
                      {request.status === 'approved' && (
                        <div className="mt-3 space-y-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                          <p className="text-sm text-blue-300">Complete the swap and record fulfillment details:</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-blue-200 text-xs">Amount Sent</Label>
                              <Input
                                value={fulfilledAmount}
                                onChange={(e) => setFulfilledAmount(e.target.value)}
                                placeholder="e.g., 0.5 SOL"
                                className="bg-slate-800/50 border-blue-500/50 text-slate-100"
                              />
                            </div>
                            <div>
                              <Label className="text-blue-200 text-xs">Transaction Hash</Label>
                              <Input
                                value={fulfillmentTxHash}
                                onChange={(e) => setFulfillmentTxHash(e.target.value)}
                                placeholder="Solscan TX hash"
                                className="bg-slate-800/50 border-blue-500/50 text-slate-100 font-mono text-xs"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => completeSwapMutation.mutate({ 
                              requestId: request.id, 
                              amount: fulfilledAmount, 
                              txHash: fulfillmentTxHash 
                            })}
                            disabled={completeSwapMutation.isPending || !fulfilledAmount || !fulfillmentTxHash}
                            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Mark as Completed
                          </Button>
                        </div>
                      )}

                      {/* Show completion details */}
                      {request.status === 'completed' && (
                        <div className="mt-3 p-3 bg-green-500/10 rounded-lg border border-green-500/30 text-sm">
                          <p className="text-green-300">
                            Fulfilled: {request.fulfilledAmount} {request.desiredAsset}
                          </p>
                          {request.fulfillmentTxHash && (
                            <a
                              href={`https://solscan.io/tx/${request.fulfillmentTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline text-xs"
                            >
                              View on Solscan →
                            </a>
                          )}
                        </div>
                      )}

                      {/* Show decline reason */}
                      {request.status === 'declined' && request.declineReason && (
                        <div className="mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                          <p className="text-red-300 text-sm">Reason: {request.declineReason}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Compliance Info */}
            <Card className="p-4 border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-300">Option A Compliance</h4>
                  <p className="text-sm text-amber-200/80 mt-1">
                    This system uses manual review to avoid exchange classification. All swaps are fulfilled off-platform
                    through treasury or external DEX. No automated execution or guaranteed rates.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Payouts Tab - Approve Token Withdrawals */}
          <TabsContent value="payouts" className="space-y-6">
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                    <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                      <Download className="h-5 w-5 text-amber-400" />
                    </div>
                    Pending Payout Requests
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Review and approve user token withdrawal requests
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchPayouts()}
                  className="border-slate-600"
                  data-testid="button-refresh-payouts"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>

              {!pendingPayouts?.payouts || pendingPayouts.payouts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400/50" />
                  <p className="font-medium">No pending payout requests</p>
                  <p className="text-sm">All withdrawals have been processed</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingPayouts.payouts.map((payout: any) => (
                    <div 
                      key={payout.id}
                      className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-amber-300 text-lg">
                            {parseFloat(payout.tokenAmount).toLocaleString()} JCMOVES
                          </p>
                          <p className="text-sm text-slate-400">{payout.userName}</p>
                          <p className="text-xs text-slate-500">{payout.userEmail}</p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                        >
                          pending
                        </Badge>
                      </div>

                      <div className="space-y-2 text-sm text-slate-400 mb-4">
                        <p><span className="text-slate-500">To:</span> {payout.recipientAddress?.slice(0, 12)}...{payout.recipientAddress?.slice(-8)}</p>
                        <p><span className="text-slate-500">Requested:</span> {format(new Date(payout.requestedAt), "MMM d, yyyy h:mm a")}</p>
                      </div>

                      {selectedPayout !== payout.id ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedPayout(payout.id);
                              setPayoutMode('process');
                              // Default to blockchain if available, otherwise manual
                              setExecutePayoutOnChain(!!transferStatus?.operational);
                            }}
                            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                            data-testid={`button-approve-payout-${payout.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Process
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPayout(payout.id);
                              setPayoutMode('decline');
                            }}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                            data-testid={`button-decline-payout-${payout.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      ) : payoutMode === 'process' ? (
                        <div className="space-y-3 p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                          <p className="text-sm text-green-300 font-medium">Process Payout</p>
                          
                          <div className="flex items-center justify-between">
                            <Label className="text-green-200 text-sm">Execute on blockchain</Label>
                            <Switch
                              checked={executePayoutOnChain}
                              onCheckedChange={setExecutePayoutOnChain}
                              disabled={!transferStatus?.operational}
                            />
                          </div>

                          {!executePayoutOnChain && (
                            <div>
                              <Label className="text-green-200 text-xs">Manual TX Hash</Label>
                              <Input
                                placeholder="Enter transaction hash..."
                                value={manualTxHash}
                                onChange={(e) => setManualTxHash(e.target.value)}
                                className="bg-slate-800/50 border-green-500/50 text-slate-100 mt-1"
                              />
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => processPayoutMutation.mutate({ 
                                payoutId: payout.id, 
                                txHash: executePayoutOnChain ? undefined : manualTxHash,
                                executeOnChain: executePayoutOnChain 
                              })}
                              disabled={processPayoutMutation.isPending || (!executePayoutOnChain && !manualTxHash)}
                              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                            >
                              {processPayoutMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4 mr-1" />
                              )}
                              {executePayoutOnChain ? "Send Tokens" : "Mark Complete"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPayout(null);
                                setManualTxHash("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                          <p className="text-sm text-red-300 font-medium">Decline Payout</p>
                          <Input
                            placeholder="Reason for declining..."
                            value={payoutDeclineReason}
                            onChange={(e) => setPayoutDeclineReason(e.target.value)}
                            className="bg-slate-800/50 border-red-500/50 text-slate-100"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => declinePayoutMutation.mutate({ 
                                payoutId: payout.id, 
                                reason: payoutDeclineReason 
                              })}
                              disabled={declinePayoutMutation.isPending || !payoutDeclineReason}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Confirm Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPayout(null);
                                setPayoutDeclineReason("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                          <p className="text-xs text-red-400/70">
                            Declining will refund tokens to user's balance
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Blockchain Status Info */}
            <Card className={`p-4 border ${transferStatus?.operational ? 'border-green-500/50 bg-green-500/10' : 'border-orange-500/50 bg-orange-500/10'}`}>
              <div className="flex items-center gap-3">
                {transferStatus?.operational ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <div>
                      <p className="font-medium text-green-300">Blockchain Transfers Ready</p>
                      <p className="text-xs text-green-400/70">
                        Treasury: {transferStatus?.address?.slice(0, 8)}...{transferStatus?.address?.slice(-6)} | 
                        Balance: {blockchainBalance.toLocaleString()} JCMOVES
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                    <div>
                      <p className="font-medium text-orange-300">Manual Processing Only</p>
                      <p className="text-xs text-orange-400/70">Set TREASURY_WALLET_PRIVATE_KEY to enable automatic blockchain transfers</p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Deposits Tab */}
          <TabsContent value="deposits" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                    <Upload className="h-5 w-5 text-green-400" />
                  </div>
                  Record Token Deposit
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  Record tokens deposited to the treasury wallet. This updates the database tracking.
                </p>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="deposit-amount" className="text-slate-200">JCMOVES Amount</Label>
                    <Input
                      id="deposit-amount"
                      type="number"
                      placeholder="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="bg-slate-800/50 border-slate-600 text-slate-100 placeholder:text-slate-500"
                      data-testid="input-deposit-amount"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Enter the number of JCMOVES tokens deposited
                    </p>
                  </div>
                  <Button
                    onClick={() => depositMutation.mutate()}
                    disabled={depositMutation.isPending || !depositAmount}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                    data-testid="button-record-deposit"
                  >
                    {depositMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Recording...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Record Deposit
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-100">
                  <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <Download className="h-5 w-5 text-blue-400" />
                  </div>
                  Recent Deposits
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {(deposits?.deposits?.length ?? 0) > 0 ? (
                    deposits?.deposits?.slice(0, 5).map((deposit: any) => (
                      <div
                        key={deposit.id}
                        className="flex justify-between items-center p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm"
                      >
                        <div>
                          <div className="font-bold text-green-400">+{parseFloat(deposit.tokensPurchased || deposit.depositAmount).toLocaleString()} JCMOVES</div>
                          <div className="text-xs text-slate-500">
                            {new Date(deposit.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-400 capitalize">{deposit.depositMethod}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No recent deposits</p>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-600"></div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">
                  Total Leads
                </h3>
                <div className="text-4xl font-black text-blue-400">{adminStats?.totalLeads || 0}</div>
              </Card>
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-600"></div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">
                  Active Jobs
                </h3>
                <div className="text-4xl font-black text-green-400">{adminStats?.activeJobs || 0}</div>
              </Card>
              <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-orange-600"></div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">
                  Total Rewards Distributed
                </h3>
                <div className="text-4xl font-black text-orange-400">
                  ${stats.totalDistributed?.toLocaleString() || "0"}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="space-y-6">
            <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                    <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30">
                      <Star className="h-5 w-5 text-orange-400" />
                    </div>
                    Review Management
                  </h3>
                  <p className="text-sm text-slate-400 mt-2">
                    Import reviews from external platforms and manage customer testimonials
                  </p>
                </div>
                <Link href="/admin/testimonials">
                  <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25">
                    <Plus className="h-4 w-4 mr-2" />
                    Import Reviews
                  </Button>
                </Link>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/30">
                  <h4 className="font-bold text-orange-300 mb-2">Supported Platforms</h4>
                  <ul className="text-sm text-orange-200/80 space-y-1">
                    <li>• Yelp Reviews</li>
                    <li>• Google Reviews</li>
                    <li>• Facebook Reviews</li>
                    <li>• HireAHelper Reviews</li>
                  </ul>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/30">
                  <h4 className="font-bold text-blue-300 mb-2">Quick Actions</h4>
                  <div className="space-y-2">
                    <Link href="/admin/testimonials">
                      <Button variant="outline" size="sm" className="w-full justify-start border-slate-600 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50">
                        <Star className="h-4 w-4 mr-2" />
                        Manage All Reviews
                      </Button>
                    </Link>
                    <Link href="/reviews">
                      <Button variant="outline" size="sm" className="w-full justify-start border-slate-600 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Public Reviews Page
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
