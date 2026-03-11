import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowRightLeft,
  FileText,
  Shield,
  Clock,
  CheckCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

export default function SwapPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center pt-6 pb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
            Token Exchange
          </h1>
          <p className="text-slate-400 mt-2">
            Convert JCMOVES tokens to SOL, USDC, or USDT
          </p>
        </div>

        <Card className="p-6 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 flex-shrink-0">
              <Shield className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-amber-300 text-lg">Manual Review Process</h3>
              <p className="text-amber-200/80 mt-2">
                To ensure compliance and protect our users, all token exchange requests are 
                processed manually by our team. This means:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-amber-200/70">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>No automated trading or instant execution</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>Each request is reviewed individually</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>Exchange rates are determined at time of processing</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/90 to-slate-900/90">
          <h3 className="font-bold text-slate-100 text-xl mb-4 flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-cyan-400" />
            How It Works
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-semibold text-slate-100">Submit Your Request</h4>
                <p className="text-sm text-slate-400 mt-1">
                  Fill out the exchange request form with the amount of JCMOVES you want to convert 
                  and your preferred asset (SOL, USDC, or USDT).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-semibold text-slate-100">Team Review</h4>
                <p className="text-sm text-slate-400 mt-1">
                  Our team reviews your request within 24-48 hours. We verify your token balance 
                  and check availability in our treasury.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-semibold text-slate-100">Off-Platform Fulfillment</h4>
                <p className="text-sm text-slate-400 mt-1">
                  If approved, we complete the swap using our treasury funds or external exchange services 
                  and send the converted assets to your wallet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                4
              </div>
              <div>
                <h4 className="font-semibold text-slate-100">Receive Confirmation</h4>
                <p className="text-sm text-slate-400 mt-1">
                  You'll receive notification with the transaction details once the exchange is complete. 
                  All transactions are verifiable on Solscan.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/10">
          <div className="text-center space-y-4">
            <FileText className="h-12 w-12 text-cyan-400 mx-auto" />
            <div>
              <h3 className="font-bold text-xl text-slate-100">Ready to Exchange?</h3>
              <p className="text-slate-400 mt-2">
                Submit a request and our team will process it promptly.
              </p>
            </div>
            <Link href="/request-swap">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-8"
                data-testid="button-submit-swap-request"
              >
                <ArrowRightLeft className="h-5 w-5 mr-2" />
                Submit Swap Request
              </Button>
            </Link>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4 border border-slate-700/50 bg-slate-800/50">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-slate-200">Processing Time</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Requests are typically reviewed within 24-48 hours during business days.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 border border-slate-700/50 bg-slate-800/50">
            <div className="flex items-start gap-3">
              <ExternalLink className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-slate-200">Verification</h4>
                <p className="text-xs text-slate-400 mt-1">
                  All transactions are recorded on Solana blockchain and viewable on Solscan.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-4 border border-orange-500/30 bg-orange-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-orange-300">Important Notice</h4>
              <p className="text-xs text-orange-200/80 mt-1">
                Exchange rates are not guaranteed and are determined at the time of processing 
                based on market conditions. Requests may be declined based on treasury availability 
                or policy considerations.
              </p>
            </div>
          </div>
        </Card>

        <div className="text-center text-xs text-slate-500 pb-6">
          <p>
            Supported assets: SOL, USDC, USDT
          </p>
          <p className="mt-1">
            Minimum request: 100 JCMOVES • Maximum: 50,000 JCMOVES per request
          </p>
        </div>
      </div>
    </div>
  );
}
