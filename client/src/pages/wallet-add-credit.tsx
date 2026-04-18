import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, DollarSign, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const PRESETS = [25, 50, 100, 250, 500];

export default function WalletAddCreditPage() {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("50");

  const checkout = useMutation({
    mutationFn: async (amountUsd: number) => {
      const r = await apiRequest("POST", "/api/jcmoves-usd/prepaid-checkout", { amountUsd });
      return r.json() as Promise<{ checkoutUrl: string; intentId: number }>;
    },
    onSuccess: (data) => {
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Could not start checkout", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Checkout failed", description: err?.message ?? "Try again.", variant: "destructive" });
    },
  });

  const parsed = parseFloat(amount);
  const validAmount = Number.isFinite(parsed) && parsed >= 5 && parsed <= 10000;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <Link href="/wallet">
          <Button variant="ghost" size="sm" className="-ml-2" data-testid="link-back-to-wallet">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Wallet
          </Button>
        </Link>

        <div>
          <h1 className="text-2xl font-bold">Add JCMOVES USD Credit</h1>
          <p className="text-sm text-muted-foreground">
            Pre-pay for future services. $1 of credit = $1 off any JC ON THE MOVE invoice.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Choose an amount
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  variant={parsed === p ? "default" : "outline"}
                  onClick={() => setAmount(String(p))}
                  data-testid={`preset-${p}`}
                >
                  ${p}
                </Button>
              ))}
            </div>

            <div>
              <Label htmlFor="custom-amount">Custom amount (USD)</Label>
              <Input
                id="custom-amount"
                type="number"
                min={5}
                max={10000}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-custom-amount"
              />
              <p className="text-xs text-muted-foreground mt-1">Min $5 · Max $10,000 per top-up</p>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={!validAmount || checkout.isPending}
              onClick={() => checkout.mutate(parsed)}
              data-testid="button-checkout"
            >
              {checkout.isPending ? "Starting checkout..." : `Pay $${validAmount ? parsed.toFixed(2) : "0.00"} with Square`}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
            <p className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>
                JCMOVES USD is a <strong>service credit</strong>, not money or an investment. It can only be used to pay
                JC ON THE MOVE LLC invoices and cannot be withdrawn for cash, transferred to other users, or earn yield.
              </span>
            </p>
            <p>
              Refunds for cancelled jobs are issued as JCMOVES USD credit to your wallet, not back to your card.
              Payments are processed by Square.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
