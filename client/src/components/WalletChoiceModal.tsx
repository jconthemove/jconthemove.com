import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wallet, Building2, ExternalLink, Check, Loader2, AlertCircle } from "lucide-react";
import { SiSolana } from "react-icons/si";

interface WalletPreference {
  walletMode: 'personal' | 'company' | null;
  personalWalletAddress: string | null;
  companyWalletId: string | null;
  companyWalletAddress: string | null;
  hasWalletConfigured: boolean;
}

interface WalletChoiceModalProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function WalletChoiceModal({ open, onClose, onComplete }: WalletChoiceModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [walletMode, setWalletMode] = useState<'personal' | 'company' | null>(null);
  const [personalAddress, setPersonalAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { data: preference, isLoading: preferenceLoading } = useQuery<WalletPreference>({
    queryKey: ['/api/user/wallet-preference'],
    enabled: open,
  });

  useEffect(() => {
    if (preference && open && !hasInitialized) {
      if (preference.walletMode) {
        setWalletMode(preference.walletMode);
      }
      if (preference.personalWalletAddress) {
        setPersonalAddress(preference.personalWalletAddress);
      }
      setHasInitialized(true);
    }
  }, [preference, open, hasInitialized]);

  useEffect(() => {
    if (!open) {
      setHasInitialized(false);
    }
  }, [open]);

  const saveWalletChoice = useMutation({
    mutationFn: async (data: { walletMode: string; personalWalletAddress?: string }) => {
      const response = await apiRequest('POST', '/api/user/wallet-choice', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: walletMode === 'personal' ? "Wallet Connected!" : "Rewards Account Set Up!",
        description: walletMode === 'personal' 
          ? "Your personal Phantom wallet is now connected. You control your keys."
          : "Your company rewards account is ready! Rewards will be tracked internally.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user/wallet-preference'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      onComplete?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save wallet choice",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const validateSolanaAddress = (address: string): boolean => {
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address);
  };

  const handlePersonalAddressChange = (value: string) => {
    setPersonalAddress(value);
    if (value && !validateSolanaAddress(value)) {
      setAddressError("Invalid Solana wallet address format");
    } else {
      setAddressError(null);
    }
  };

  const handleSubmit = () => {
    if (walletMode === 'personal') {
      if (!personalAddress) {
        setAddressError("Please enter your Phantom wallet address");
        return;
      }
      if (!validateSolanaAddress(personalAddress)) {
        setAddressError("Invalid Solana wallet address format");
        return;
      }
      saveWalletChoice.mutate({
        walletMode: 'personal',
        personalWalletAddress: personalAddress,
      });
    } else if (walletMode === 'company') {
      saveWalletChoice.mutate({
        walletMode: 'company',
      });
    }
  };

  const canSubmit = walletMode && (
    walletMode === 'company' || 
    (walletMode === 'personal' && personalAddress && !addressError)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700" data-testid="wallet-choice-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
              <Wallet className="h-5 w-5 text-purple-400" />
            </div>
            Set Up Your Wallet
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Choose how you want to receive your JCMOVES token rewards
          </DialogDescription>
        </DialogHeader>

        {preferenceLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : (
          <div className="space-y-6 pt-4">
            <RadioGroup 
              value={walletMode || ""} 
              onValueChange={(value) => setWalletMode(value as 'personal' | 'company')}
              className="space-y-4"
            >
              <Card 
                className={`cursor-pointer transition-all border-slate-700 bg-slate-800/50 ${walletMode === 'personal' ? 'ring-2 ring-purple-500 border-purple-500' : 'hover:border-purple-500/50'}`}
                onClick={() => setWalletMode('personal')}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-4">
                    <RadioGroupItem value="personal" id="personal" className="mt-1 border-slate-600" />
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 p-2 rounded-lg border border-purple-500/30">
                          <SiSolana className="h-5 w-5 text-purple-400" />
                        </div>
                        Personal Phantom Wallet
                      </CardTitle>
                      <CardDescription className="mt-2 text-slate-400">
                        Tokens are sent directly to your personal wallet. You control your keys.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pl-12">
                  <ul className="text-sm text-slate-400 space-y-1">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Full control over your tokens
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Trade on any exchange
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Direct blockchain transfers
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all border-slate-700 bg-slate-800/50 ${walletMode === 'company' ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-blue-500/50'}`}
                onClick={() => setWalletMode('company')}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-4">
                    <RadioGroupItem value="company" id="company" className="mt-1 border-slate-600" />
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2 text-lg text-slate-100">
                        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-2 rounded-lg border border-blue-500/30">
                          <Building2 className="h-5 w-5 text-blue-400" />
                        </div>
                        Company Rewards Account
                      </CardTitle>
                      <CardDescription className="mt-2 text-slate-400">
                        Your rewards are tracked internally by JC ON THE MOVE. Tokens are issued on the blockchain only if and when you choose to withdraw.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pl-12">
                  <ul className="text-sm text-slate-400 space-y-1">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      No wallet setup required
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Rewards tracked internally
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-400" />
                      Optional on-chain withdrawal
                    </li>
                  </ul>
                  <p className="text-xs text-slate-500 mt-3 italic">
                    This is a rewards account, not a crypto wallet.
                  </p>
                </CardContent>
              </Card>
            </RadioGroup>

            {walletMode === 'personal' && (
              <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <Label htmlFor="wallet-address" className="flex items-center gap-2 text-slate-200">
                  <SiSolana className="h-4 w-4 text-purple-400" />
                  Your Phantom Wallet Address
                </Label>
                <Input
                  id="wallet-address"
                  placeholder="e.g., 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                  value={personalAddress}
                  onChange={(e) => handlePersonalAddressChange(e.target.value)}
                  className={`bg-slate-900 border-slate-600 text-slate-100 placeholder:text-slate-500 ${addressError ? 'border-red-500' : ''}`}
                  data-testid="input-wallet-address"
                />
                {addressError && (
                  <p className="text-sm text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {addressError}
                  </p>
                )}
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  <a 
                    href="https://phantom.app" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:underline text-purple-400"
                  >
                    Don't have a wallet? Get Phantom
                  </a>
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800" data-testid="button-cancel-wallet">
                Later
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!canSubmit || saveWalletChoice.isPending}
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                data-testid="button-confirm-wallet"
              >
                {saveWalletChoice.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Confirm Choice
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
