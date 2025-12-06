import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowDownUp,
  Loader2,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Coins,
  DollarSign,
  Info,
} from "lucide-react";

const SUPPORTED_TOKENS = {
  JCMOVES: {
    symbol: 'JCMOVES',
    name: 'JCMOVES Token',
    address: 'BHZW4jds7NSe5Fqvw9Z4pvt423EJSx63k8MT11F2moon',
    icon: '🚀',
    color: 'from-orange-500 to-orange-600',
  },
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    address: 'So11111111111111111111111111111111111111112',
    icon: '◎',
    color: 'from-purple-500 to-purple-600',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    icon: '$',
    color: 'from-blue-500 to-blue-600',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    icon: '₮',
    color: 'from-green-500 to-green-600',
  },
};

type TokenKey = keyof typeof SUPPORTED_TOKENS;

export default function SwapPage() {
  const { toast } = useToast();
  const [inputToken, setInputToken] = useState<TokenKey>('JCMOVES');
  const [outputToken, setOutputToken] = useState<TokenKey>('SOL');
  const [inputAmount, setInputAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);

  const { data: userInfo } = useQuery({
    queryKey: ["/api/user"],
  });

  const { data: walletInfo } = useQuery({
    queryKey: ["/api/wallet/status"],
  });

  const { data: quote, isLoading: quoteLoading, refetch: refetchQuote } = useQuery({
    queryKey: ["/api/swap/quote", inputToken, outputToken, inputAmount],
    queryFn: async () => {
      if (!inputAmount || parseFloat(inputAmount) <= 0) return null;
      const response = await apiRequest("POST", "/api/swap/quote", {
        inputMint: SUPPORTED_TOKENS[inputToken].address,
        outputMint: SUPPORTED_TOKENS[outputToken].address,
        amount: parseFloat(inputAmount),
        slippageBps,
      });
      return response.json();
    },
    enabled: !!inputAmount && parseFloat(inputAmount) > 0,
    refetchInterval: 10000,
  });

  const swapTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setInputAmount("");
  };

  const swapMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/swap/transaction", {
        inputMint: SUPPORTED_TOKENS[inputToken].address,
        outputMint: SUPPORTED_TOKENS[outputToken].address,
        amount: parseFloat(inputAmount),
        slippageBps,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.needsWallet) {
        toast({
          title: "Wallet Required",
          description: "Please set up your wallet first to use the swap feature.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Swap Transaction Ready",
        description: `Sign the transaction in your wallet to complete the swap.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Swap Failed",
        description: error.message || "Failed to create swap transaction",
        variant: "destructive",
      });
    },
  });

  const currentQuote = quote?.quote;
  const hasWallet = walletInfo?.hasWallet;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center pt-6 pb-2">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
            Token Swap
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Swap JCMOVES for SOL, USDC, or USDT
          </p>
        </div>

        {!hasWallet && (
          <Card className="p-4 border border-orange-500/50 bg-orange-500/10">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              <div>
                <p className="font-medium text-orange-300">Wallet Required</p>
                <p className="text-xs text-orange-400/70">
                  Set up your wallet in Rewards to use swaps
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-slate-300">You Pay</Label>
                <span className="text-xs text-slate-500">
                  Balance: -- {inputToken}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="bg-slate-900/50 border-slate-700 text-slate-100 text-lg h-14 placeholder:text-slate-600"
                    data-testid="input-swap-amount"
                  />
                </div>
                <Select value={inputToken} onValueChange={(v) => setInputToken(v as TokenKey)}>
                  <SelectTrigger className="w-32 bg-slate-900/50 border-slate-700 text-slate-100 h-14" data-testid="select-input-token">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {Object.entries(SUPPORTED_TOKENS).map(([key, token]) => (
                      <SelectItem 
                        key={key} 
                        value={key}
                        disabled={key === outputToken}
                        className="text-slate-200 focus:bg-slate-700"
                      >
                        <span className="flex items-center gap-2">
                          <span>{token.icon}</span>
                          <span>{token.symbol}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={swapTokens}
                className="rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600"
                data-testid="button-swap-direction"
              >
                <ArrowDownUp className="h-5 w-5 text-slate-300" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-slate-300">You Receive</Label>
                {quoteLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="bg-slate-900/50 border border-slate-700 rounded-md h-14 flex items-center px-4">
                    <span className="text-lg text-slate-100">
                      {currentQuote?.outputAmount || '0.00'}
                    </span>
                  </div>
                </div>
                <Select value={outputToken} onValueChange={(v) => setOutputToken(v as TokenKey)}>
                  <SelectTrigger className="w-32 bg-slate-900/50 border-slate-700 text-slate-100 h-14" data-testid="select-output-token">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {Object.entries(SUPPORTED_TOKENS).map(([key, token]) => (
                      <SelectItem 
                        key={key} 
                        value={key}
                        disabled={key === inputToken}
                        className="text-slate-200 focus:bg-slate-700"
                      >
                        <span className="flex items-center gap-2">
                          <span>{token.icon}</span>
                          <span>{token.symbol}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {currentQuote && (
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Rate</span>
                  <span className="text-slate-200">
                    1 {currentQuote.inputSymbol} ≈ {(parseFloat(currentQuote.outputAmount) / parseFloat(currentQuote.inputAmount)).toFixed(6)} {currentQuote.outputSymbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Price Impact</span>
                  <span className={`${currentQuote.priceImpactPct > 1 ? 'text-orange-400' : 'text-green-400'}`}>
                    {currentQuote.priceImpactPct.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Slippage</span>
                  <span className="text-slate-200">{(slippageBps / 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Network Fee</span>
                  <span className="text-slate-200">~$0.01</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSlippageBps(50)}
                className={`flex-1 ${slippageBps === 50 ? 'bg-purple-500/20 border-purple-500' : 'bg-slate-800 border-slate-700'}`}
              >
                0.5%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSlippageBps(100)}
                className={`flex-1 ${slippageBps === 100 ? 'bg-purple-500/20 border-purple-500' : 'bg-slate-800 border-slate-700'}`}
              >
                1%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSlippageBps(300)}
                className={`flex-1 ${slippageBps === 300 ? 'bg-purple-500/20 border-purple-500' : 'bg-slate-800 border-slate-700'}`}
              >
                3%
              </Button>
            </div>

            <Button
              onClick={() => swapMutation.mutate()}
              disabled={
                swapMutation.isPending ||
                !inputAmount ||
                parseFloat(inputAmount) <= 0 ||
                !hasWallet ||
                quoteLoading
              }
              className="w-full h-14 text-lg bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              data-testid="button-execute-swap"
            >
              {swapMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Creating Transaction...
                </>
              ) : !hasWallet ? (
                <>
                  <Wallet className="h-5 w-5 mr-2" />
                  Set Up Wallet First
                </>
              ) : (
                <>
                  <ArrowDownUp className="h-5 w-5 mr-2" />
                  Swap {inputToken} for {outputToken}
                </>
              )}
            </Button>
          </div>
        </Card>

        <Card className="p-4 border border-slate-700/50 bg-slate-800/50">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-slate-400">
              <p className="font-medium text-slate-300 mb-1">How Swaps Work</p>
              <ul className="space-y-1 list-disc list-inside text-xs">
                <li>Swaps are powered by Jupiter, Solana's leading DEX aggregator</li>
                <li>You'll sign the transaction with your connected wallet</li>
                <li>Swaps are final and cannot be reversed</li>
                <li>Network fees are paid in SOL (~$0.01)</li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="text-center">
          <a
            href="https://jup.ag"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-400"
          >
            Powered by Jupiter
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
