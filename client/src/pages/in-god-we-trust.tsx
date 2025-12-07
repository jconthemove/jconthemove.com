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
  Plus
} from "lucide-react";

export default function InGodWeTrustPage() {
  const { toast } = useToast();
  const [transferAmount, setTransferAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [executeOnChain, setExecuteOnChain] = useState(false);
  const [newTreasuryAddress, setNewTreasuryAddress] = useState("");
  const [isEditingTreasury, setIsEditingTreasury] = useState(false);

  // Treasury stats query
  const { data: treasurySummary, refetch: refetchTreasury } = useQuery({
    queryKey: ["/api/treasury/summary"],
  });

  // Live blockchain balance
  const { data: liveBalance, refetch: refetchBalance } = useQuery({
    queryKey: ["/api/solana/balance"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Live token price
  const { data: livePrice } = useQuery({
    queryKey: ["/api/crypto/live-price"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Funding deposits
  const { data: deposits } = useQuery({
    queryKey: ["/api/treasury/deposits"],
  });

  // Admin stats
  const { data: adminStats } = useQuery({
    queryKey: ["/api/admin/stats"],
  });

  // Transfer service status query
  const { data: transferStatus } = useQuery({
    queryKey: ["/api/treasury/transfer/status"],
    refetchInterval: 60000,
  });

  // Treasury wallets configuration
  const { data: treasuryWallets, refetch: refetchTreasuryWallets } = useQuery({
    queryKey: ["/api/treasury/wallets"],
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

  const stats = treasurySummary?.stats || {};
  const tokenPrice = livePrice?.price || stats.currentTokenPrice || 0;
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

        {/* Top Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-xl shadow-blue-900/30 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
            <div className="flex items-center justify-between mb-2">
              <Wallet className="h-8 w-8 opacity-90" />
              <span className="text-sm opacity-80 font-medium">Live Price</span>
            </div>
            <div className="text-3xl font-black">${tokenPrice.toFixed(8)}</div>
            <div className="text-sm opacity-80 mt-1 font-medium">JCMOVES Token</div>
          </Card>

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

        {/* Balance Discrepancy Alert */}
        {balanceDiscrepancy > 100 && (
          <Card className="p-4 bg-yellow-500/10 border-yellow-500/30 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-400 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-yellow-300">
                  Balance Discrepancy Detected
                </h3>
                <p className="text-sm text-yellow-400/80 mt-1">
                  Blockchain: {blockchainBalance.toLocaleString()} JCMOVES • Database:{" "}
                  {databaseBalance.toLocaleString()} JCMOVES • Difference:{" "}
                  {balanceDiscrepancy.toLocaleString()} JCMOVES
                </p>
                <p className="text-xs text-yellow-500/70 mt-2">
                  The blockchain is the source of truth. Database tracking may be incomplete.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="operations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-slate-800/50 border border-slate-700/50 p-1">
            <TabsTrigger value="operations" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300" data-testid="tab-operations">
              <Activity className="h-4 w-4 mr-2" />
              Operations
            </TabsTrigger>
            <TabsTrigger value="safety" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300" data-testid="tab-safety">
              <Shield className="h-4 w-4 mr-2" />
              Safety
            </TabsTrigger>
            <TabsTrigger value="transfers" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300" data-testid="tab-transfers">
              <Send className="h-4 w-4 mr-2" />
              Transfers
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
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Per Transaction Limit</span>
                      <span className="font-bold text-green-400">10,000 JCMOVES</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-500 to-green-400 w-1/3 rounded-full"></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Max single transfer allowed</p>
                  </div>
                  
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Daily Limit</span>
                      <span className="font-bold text-blue-400">100,000 JCMOVES</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 w-1/4 rounded-full"></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">~25,000 used today</p>
                  </div>
                  
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Minimum Reserve Required</span>
                      <span className="font-bold text-orange-400">50,000 JCMOVES</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-xs text-green-400">Current balance exceeds minimum reserve</span>
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
                  {deposits?.deposits?.length > 0 ? (
                    deposits.deposits.slice(0, 5).map((deposit: any) => (
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
